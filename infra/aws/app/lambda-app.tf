# The value is set by hand with the CLI and never enters the repo.
# The parameter must exist before the first plan.
data "aws_ssm_parameter" "site_admin_usernames" {
  name = "/${local.name_prefix}/site-admin-usernames"
}

resource "aws_lambda_function" "app" {
  function_name = "${local.name_prefix}-app"
  description   = "Serves the application behind the HTTP API."
  role          = aws_iam_role.app_runtime.arn
  package_type  = "Image"
  image_uri     = "${data.aws_ecr_repository.catherder.repository_url}:${var.app_image_tag}"
  architectures = ["arm64"]
  memory_size   = 1024
  # The HTTP API cuts every request at 30 seconds, so the function must give up first.
  timeout = 29

  vpc_config {
    subnet_ids                  = aws_subnet.app[*].id
    security_group_ids          = [aws_security_group.lambda.id]
    ipv6_allowed_for_dual_stack = true
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.app.name
  }

  # NODE_ENV, PORT, HOSTNAME, DATABASE_SSL_CA, and the AWS_LWA_* values are baked into the image.
  environment {
    variables = {
      APP_BASE_URL            = "https://${local.app_hostname}"
      AUTH_ISSUER             = "https://cognito-idp.${data.aws_region.current.region}.amazonaws.com/${aws_cognito_user_pool.users.id}"
      AUTH_JWKS_URL           = "https://cognito-idp.${data.aws_region.current.region}.amazonaws.com/${aws_cognito_user_pool.users.id}/.well-known/jwks.json"
      AUTH_AUDIENCE           = aws_cognito_user_pool_client.app.id
      AUTH_CLIENT_ID          = aws_cognito_user_pool_client.app.id
      AUTH_LOGIN_DOMAIN       = local.login_hostname
      AUTH_DEV_ISSUER         = "false"
      AUTH_SESSION_SECRET_ARN = aws_secretsmanager_secret.session.arn
      DATABASE_SECRET_ARN     = aws_db_instance.postgres.master_user_secret[0].secret_arn
      DATABASE_HOST           = aws_db_instance.postgres.address
      DATABASE_NAME           = aws_db_instance.postgres.db_name
      DATABASE_PORT           = tostring(aws_db_instance.postgres.port)
      DB_POOL_MAX             = "1"
      SITE_ADMIN_USERNAMES    = data.aws_ssm_parameter.site_admin_usernames.value
    }
  }

  # Terraform sets the image only when the function is created; every deploy changes it through the pipeline, and Terraform must not change it back.
  lifecycle {
    ignore_changes = [image_uri]
  }

  # Lambda checks the role's network permissions at creation.
  depends_on = [
    aws_iam_role_policy_attachment.app_runtime_vpc,
    aws_cloudwatch_log_group.app,
  ]
}

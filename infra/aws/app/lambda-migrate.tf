resource "aws_lambda_function" "migrate" {
  function_name = "${local.name_prefix}-migrate"
  description   = "Runs prisma migrate deploy against the environment database."
  role          = aws_iam_role.migrate_runtime.arn
  package_type  = "Image"
  image_uri     = "${data.aws_ecr_repository.catherder.repository_url}:${var.migrate_image_tag}"
  architectures = ["arm64"]
  memory_size   = 512
  timeout       = 300

  vpc_config {
    subnet_ids                  = aws_subnet.app[*].id
    security_group_ids          = [aws_security_group.lambda.id]
    ipv6_allowed_for_dual_stack = true
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.migrate.name
  }

  # DATABASE_SSL_CA is baked into the image.
  environment {
    variables = {
      DATABASE_SECRET_ARN = aws_db_instance.postgres.master_user_secret[0].secret_arn
      DATABASE_HOST       = aws_db_instance.postgres.address
      DATABASE_NAME       = aws_db_instance.postgres.db_name
      DATABASE_PORT       = tostring(aws_db_instance.postgres.port)
    }
  }

  # Lambda checks the role's network permissions at creation.
  depends_on = [
    aws_iam_role_policy_attachment.migrate_runtime_vpc,
    aws_cloudwatch_log_group.migrate,
  ]
}

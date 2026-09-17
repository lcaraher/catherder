data "aws_iam_policy_document" "lambda_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "migrate_runtime" {
  name               = "${local.name_prefix}-migrate-runtime"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

# Network interfaces plus basic logging.
resource "aws_iam_role_policy_attachment" "migrate_runtime_vpc" {
  role       = aws_iam_role.migrate_runtime.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# Both secrets use the AWS-managed aws/secretsmanager key, whose key policy grants decrypt via the service, so no kms statement is needed.
data "aws_iam_policy_document" "migrate_runtime_secrets" {
  statement {
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_db_instance.postgres.master_user_secret[0].secret_arn]
  }
}

resource "aws_iam_role_policy" "migrate_runtime_secrets" {
  name   = "read-database-secret"
  role   = aws_iam_role.migrate_runtime.id
  policy = data.aws_iam_policy_document.migrate_runtime_secrets.json
}

resource "aws_iam_role" "app_runtime" {
  name               = "${local.name_prefix}-app-runtime"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

# Network interfaces plus basic logging.
resource "aws_iam_role_policy_attachment" "app_runtime_vpc" {
  role       = aws_iam_role.app_runtime.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

data "aws_iam_policy_document" "app_runtime_secrets" {
  statement {
    effect  = "Allow"
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      aws_db_instance.postgres.master_user_secret[0].secret_arn,
      aws_secretsmanager_secret.session.arn,
    ]
  }
}

resource "aws_iam_role_policy" "app_runtime_secrets" {
  name   = "read-runtime-secrets"
  role   = aws_iam_role.app_runtime.id
  policy = data.aws_iam_policy_document.app_runtime_secrets.json
}

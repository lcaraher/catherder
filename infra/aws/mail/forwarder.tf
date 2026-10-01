# One zip holds both functions; tests and bytecode stay out of it.
data "archive_file" "forwarder" {
  type        = "zip"
  source_dir  = "${path.module}/forwarder"
  output_path = "${path.module}/build/forwarder.zip"
  excludes    = ["test_*.py", "__pycache__", "__pycache__/**", "**/__pycache__/**"]

  # Fixed modes keep the hash the same on Windows and Linux.
  output_file_mode = "0644"
}

locals {
  function_environment = {
    FEEDBACK_ADDRESS  = local.feedback_address
    FORWARD_TO        = join(",", var.forward_to)
    MAIL_BUCKET       = aws_s3_bucket.mail.id
    MAIL_PREFIX       = "inbound/"
    CONFIGURATION_SET = aws_sesv2_configuration_set.mail.configuration_set_name
    STORED_MAIL_DAYS  = tostring(var.stored_mail_days)
  }
}

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

# Created here so retention is never the console default of forever.
resource "aws_cloudwatch_log_group" "forwarder" {
  name              = "/aws/lambda/catherder-mail-forwarder"
  retention_in_days = var.log_days
}

resource "aws_iam_role" "forwarder" {
  name               = "catherder-mail-forwarder"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

# May send only as the feedback address and only to the forward_to inboxes.
data "aws_iam_policy_document" "forwarder" {
  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:GetObjectTagging", "s3:PutObjectTagging"]
    resources = ["${aws_s3_bucket.mail.arn}/inbound/*"]
  }

  statement {
    effect  = "Allow"
    actions = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = concat(
      [aws_sesv2_email_identity.domain.arn, aws_sesv2_configuration_set.mail.arn],
      aws_sesv2_email_identity.forward_to[*].arn,
    )

    condition {
      test     = "StringEquals"
      variable = "ses:FromAddress"
      values   = [local.feedback_address]
    }

    condition {
      test     = "ForAllValues:StringEquals"
      variable = "ses:Recipients"
      values   = var.forward_to
    }
  }

  statement {
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.failures.arn]
  }

  statement {
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.forwarder.arn}:*"]
  }
}

resource "aws_iam_role_policy" "forwarder" {
  name   = "forward-mail"
  role   = aws_iam_role.forwarder.id
  policy = data.aws_iam_policy_document.forwarder.json
}

# Invoked by the receipt rule once SES has stored the message.
resource "aws_lambda_function" "forwarder" {
  function_name    = "catherder-mail-forwarder"
  description      = "Forwards mail received at the feedback address, or sends a notice when it cannot."
  role             = aws_iam_role.forwarder.arn
  runtime          = "python3.14"
  architectures    = ["arm64"]
  handler          = "handler.lambda_handler"
  memory_size      = 256
  timeout          = 30
  filename         = data.archive_file.forwarder.output_path
  source_code_hash = data.archive_file.forwarder.output_base64sha256

  reserved_concurrent_executions = var.forwarder_reserved_concurrency

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.forwarder.name
  }

  environment {
    variables = local.function_environment
  }

  depends_on = [aws_cloudwatch_log_group.forwarder]
}

# SES invokes asynchronously; events that still fail after the retries are kept in the failure queue.
resource "aws_lambda_function_event_invoke_config" "forwarder" {
  function_name                = aws_lambda_function.forwarder.function_name
  maximum_retry_attempts       = 2
  maximum_event_age_in_seconds = 21600

  destination_config {
    on_failure {
      destination = aws_sqs_queue.failures.arn
    }
  }
}

# Only this account's feedback rule may invoke the forwarder.
resource "aws_lambda_permission" "ses_invoke" {
  statement_id   = "AllowSesReceiptRule"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.forwarder.function_name
  principal      = "ses.amazonaws.com"
  source_account = data.aws_caller_identity.current.account_id
  source_arn     = local.rule_arn
}

resource "aws_cloudwatch_log_group" "summary" {
  name              = "/aws/lambda/catherder-mail-summary"
  retention_in_days = var.log_days
}

resource "aws_iam_role" "summary" {
  name               = "catherder-mail-summary"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

# Same sending limits as the forwarder; may list only stored mail.
data "aws_iam_policy_document" "summary" {
  statement {
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.mail.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["inbound/*"]
    }
  }

  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:GetObjectTagging", "s3:PutObjectTagging"]
    resources = ["${aws_s3_bucket.mail.arn}/inbound/*"]
  }

  statement {
    effect  = "Allow"
    actions = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = concat(
      [aws_sesv2_email_identity.domain.arn, aws_sesv2_configuration_set.mail.arn],
      aws_sesv2_email_identity.forward_to[*].arn,
    )

    condition {
      test     = "StringEquals"
      variable = "ses:FromAddress"
      values   = [local.feedback_address]
    }

    condition {
      test     = "ForAllValues:StringEquals"
      variable = "ses:Recipients"
      values   = var.forward_to
    }
  }

  statement {
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.summary.arn}:*"]
  }
}

resource "aws_iam_role_policy" "summary" {
  name   = "summarize-dropped-mail"
  role   = aws_iam_role.summary.id
  policy = data.aws_iam_policy_document.summary.json
}

# Dropped mail gets no notice, so once a day it is listed in one email instead.
resource "aws_lambda_function" "summary" {
  function_name    = "catherder-mail-summary"
  description      = "Sends a daily list of received mail that was dropped as spam, virus or a loop."
  role             = aws_iam_role.summary.arn
  runtime          = "python3.14"
  architectures    = ["arm64"]
  handler          = "summary.summary_handler"
  memory_size      = 256
  timeout          = 60
  filename         = data.archive_file.forwarder.output_path
  source_code_hash = data.archive_file.forwarder.output_base64sha256

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.summary.name
  }

  environment {
    variables = local.function_environment
  }

  depends_on = [aws_cloudwatch_log_group.summary]
}

data "aws_iam_policy_document" "scheduler_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "catherder-mail-summary-schedule"
  assume_role_policy = data.aws_iam_policy_document.scheduler_trust.json
}

data "aws_iam_policy_document" "scheduler" {
  statement {
    effect    = "Allow"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.summary.arn]
  }
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "invoke-summary"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler.json
}

# A time zone, so the summary arrives at the same local hour across daylight saving changes.
resource "aws_scheduler_schedule" "summary" {
  name                         = "catherder-mail-summary"
  schedule_expression          = "cron(0 ${var.summary_hour} * * ? *)"
  schedule_expression_timezone = "America/New_York"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.summary.arn
    role_arn = aws_iam_role.scheduler.arn

    retry_policy {
      maximum_retry_attempts = 2
    }
  }
}

# Pings the health route every five minutes so one copy of the app stays warm.
# The health route touches no database, so the ping costs no connections.

data "aws_iam_policy_document" "warm_ping_trust" {
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

resource "aws_iam_role" "warm_ping" {
  name               = "${local.name_prefix}-warm-ping"
  assume_role_policy = data.aws_iam_policy_document.warm_ping_trust.json
}

data "aws_iam_policy_document" "warm_ping_invoke" {
  statement {
    effect  = "Allow"
    actions = ["lambda:InvokeFunction"]
    resources = [
      aws_lambda_function.app.arn,
      "${aws_lambda_function.app.arn}:*",
    ]
  }
}

resource "aws_iam_role_policy" "warm_ping_invoke" {
  name   = "invoke-app"
  role   = aws_iam_role.warm_ping.id
  policy = data.aws_iam_policy_document.warm_ping_invoke.json
}

resource "aws_scheduler_schedule" "warm_ping" {
  name                = "${local.name_prefix}-warm-ping"
  schedule_expression = "rate(5 minutes)"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.app.arn
    role_arn = aws_iam_role.warm_ping.arn

    # An HTTP API (payload 2.0) event, which the web adapter forwards as GET /api/health.
    input = jsonencode({
      version        = "2.0"
      routeKey       = "$default"
      rawPath        = "/api/health"
      rawQueryString = ""
      headers = {
        host = local.app_hostname
      }
      requestContext = {
        http = {
          method   = "GET"
          path     = "/api/health"
          protocol = "HTTP/1.1"
          sourceIp = "127.0.0.1"
        }
        requestId = "warm-ping"
        stage     = "$default"
      }
      isBase64Encoded = false
    })

    # A missed ping is simply skipped.
    retry_policy {
      maximum_retry_attempts = 0
    }
  }
}

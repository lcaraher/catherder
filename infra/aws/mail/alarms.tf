# Alarms and SES delivery events both arrive here.
resource "aws_sns_topic" "alerts" {
  name = "catherder-mail-alerts"
}

data "aws_iam_policy_document" "alerts_topic" {
  statement {
    sid       = "AllowCloudWatchAlarms"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid       = "AllowSesEvents"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]

    principals {
      type        = "Service"
      identifiers = ["ses.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_sesv2_configuration_set.mail.arn]
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts_topic.json
}

# SNS mails a confirmation link; nothing is delivered until it is clicked.
resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

resource "aws_cloudwatch_metric_alarm" "forwarder_errors" {
  alarm_name          = "catherder-mail-forwarder-errors"
  alarm_description   = "The forwarder raised an error. Check its log group for the messageId, then the failure queue."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.forwarder.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "forwarder_throttles" {
  alarm_name          = "catherder-mail-forwarder-throttles"
  alarm_description   = "The forwarder was throttled. Check the account's Lambda concurrency use and forwarder_reserved_concurrency."
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  dimensions          = { FunctionName = aws_lambda_function.forwarder.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "forwarder_events_dropped" {
  alarm_name          = "catherder-mail-forwarder-events-dropped"
  alarm_description   = "Lambda dropped a forwarder event without running it. Check the failure queue, then the stored mail for messages with no tag."
  namespace           = "AWS/Lambda"
  metric_name         = "AsyncEventsDropped"
  dimensions          = { FunctionName = aws_lambda_function.forwarder.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "forwarder_destination_failures" {
  alarm_name          = "catherder-mail-forwarder-destination-failures"
  alarm_description   = "A failed forwarder event could not be written to the failure queue. Check the queue exists and the forwarder role may send to it."
  namespace           = "AWS/Lambda"
  metric_name         = "DestinationDeliveryFailures"
  dimensions          = { FunctionName = aws_lambda_function.forwarder.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "failure_queue_not_empty" {
  alarm_name          = "catherder-mail-failure-queue-not-empty"
  alarm_description   = "A message failed every forwarder attempt. Read the failure queue for the messageId and error, then the stored mail."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.failures.name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "receipt_publish_failure" {
  alarm_name          = "catherder-mail-receipt-publish-failure"
  alarm_description   = "SES could not run a receipt rule action and will retry. Check the bucket policy and the forwarder's invoke permission."
  namespace           = "AWS/SES"
  metric_name         = "PublishFailure"
  dimensions          = { RuleSetName = local.rule_set_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "receipt_publish_expired" {
  alarm_name          = "catherder-mail-receipt-publish-expired"
  alarm_description   = "SES gave up on a received message, which may not have been stored. Check the bucket policy and the forwarder's invoke permission."
  namespace           = "AWS/SES"
  metric_name         = "PublishExpired"
  dimensions          = { RuleSetName = local.rule_set_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# SES reviews an account at a 5% bounce rate and may pause sending at 10%.
resource "aws_cloudwatch_metric_alarm" "bounce_rate" {
  alarm_name          = "catherder-mail-bounce-rate"
  alarm_description   = "The SES bounce rate reached 5%. Check the bounce notices on this topic for the address that bounced."
  namespace           = "AWS/SES"
  metric_name         = "Reputation.BounceRate"
  statistic           = "Maximum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 0.05
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "ignore"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# SES reviews an account at a 0.1% complaint rate.
resource "aws_cloudwatch_metric_alarm" "complaint_rate" {
  alarm_name          = "catherder-mail-complaint-rate"
  alarm_description   = "The SES complaint rate reached 0.1%. Check the complaint notices on this topic for what was reported."
  namespace           = "AWS/SES"
  metric_name         = "Reputation.ComplaintRate"
  statistic           = "Maximum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 0.001
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "ignore"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# Feedback volume is low, so a burst of sends points at a loop or a leaked SMTP key.
resource "aws_cloudwatch_metric_alarm" "hourly_sends" {
  alarm_name          = "catherder-mail-hourly-sends"
  alarm_description   = "SES sent more mail in an hour than expected. Check the forwarder log for repeated messageIds, then the SMTP user's access keys."
  namespace           = "AWS/SES"
  metric_name         = "Send"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = var.hourly_send_alarm_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "summary_errors" {
  alarm_name          = "catherder-mail-summary-errors"
  alarm_description   = "The daily summary failed, so dropped mail went unreported. Check the summary function's log group."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.summary.function_name }
  statistic           = "Sum"
  period              = 86400
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

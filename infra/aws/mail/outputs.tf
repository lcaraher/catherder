output "mail_bucket" {
  description = "Bucket holding received mail under inbound/."
  value       = aws_s3_bucket.mail.id
}

output "failure_queue_url" {
  description = "Queue holding forwarder events that failed every attempt."
  value       = aws_sqs_queue.failures.url
}

output "forwarder_function_name" {
  description = "Function that forwards received mail."
  value       = aws_lambda_function.forwarder.function_name
}

output "summary_function_name" {
  description = "Function that sends the daily summary of dropped mail."
  value       = aws_lambda_function.summary.function_name
}

output "alerts_topic_arn" {
  description = "Topic receiving alarms and SES delivery events."
  value       = aws_sns_topic.alerts.arn
}

output "smtp_user_name" {
  description = "IAM user allowed to send as the feedback address over SMTP."
  value       = aws_iam_user.smtp.name
}

output "rule_set_name" {
  description = "SES receipt rule set holding the feedback rule."
  value       = aws_ses_receipt_rule_set.inbound.rule_set_name
}

output "receiving_enabled" {
  description = "Whether the MX record exists and the rule set is active."
  value       = var.receiving_enabled
}

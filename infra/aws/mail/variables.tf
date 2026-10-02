variable "domain_name" {
  description = "Apex domain whose public hosted zone already exists; mail is sent from and received at it."
  type        = string
  default     = "catherderapp.com"
}

variable "feedback_local_part" {
  description = "Local part of the address that receives feedback and sends forwarded mail."
  type        = string
  default     = "feedback"
}

variable "forward_to" {
  description = "Inboxes that receive forwarded mail and notices."
  type        = list(string)
  sensitive   = true

  # An inbox at the domain itself would send forwarded mail back into the pipeline.
  validation {
    condition     = length(var.forward_to) > 0 && alltrue([for address in var.forward_to : !endswith(lower(address), lower(var.domain_name))])
    error_message = "forward_to needs at least one address, and none may be at domain_name."
  }
}

variable "alarm_email" {
  description = "Address subscribed to the alarm topic."
  type        = string
  sensitive   = true
}

variable "mail_readers" {
  description = "IAM principal ARNs, besides the functions, allowed to read stored mail and failure records."
  type        = list(string)
  sensitive   = true

  validation {
    condition     = length(var.mail_readers) > 0 && alltrue([for arn in var.mail_readers : startswith(arn, "arn:aws:iam::")])
    error_message = "mail_readers needs at least one IAM principal ARN; the bucket and queue policies refuse reading to everyone else."
  }
}

variable "receiving_enabled" {
  description = "Adds the apex MX record and makes the receipt rule set active."
  type        = bool
  default     = false
}

variable "stored_mail_days" {
  description = "Days stored mail is kept before it expires."
  type        = number
  default     = 30
}

variable "failure_record_days" {
  description = "Days a failed invocation stays in the failure queue."
  type        = number
  default     = 14

  validation {
    condition     = var.failure_record_days <= 14
    error_message = "failure_record_days must be at most 14, the SQS retention maximum."
  }
}

variable "log_days" {
  description = "Retention of the functions' log groups, in days."
  type        = number
  default     = 14
}

variable "forwarder_reserved_concurrency" {
  description = "Reserved concurrency for the forwarder; keeps the forwarder to one message at a time."
  type        = number
  default     = 1
}

variable "hourly_send_alarm_threshold" {
  description = "Sends per hour above which the send-volume alarm fires."
  type        = number
  default     = 20
}

variable "summary_hour" {
  description = "Hour of the day, America/New_York, when the daily summary of dropped mail is sent."
  type        = number
  default     = 8
}

locals {
  feedback_address = "${var.feedback_local_part}@${var.domain_name}"
  rule_set_name    = "catherder-inbound"
  rule_name        = "feedback"

  # Built from parts because the bucket policy and the Lambda permission must exist before the rule.
  rule_arn = "arn:aws:ses:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:receipt-rule-set/${local.rule_set_name}:receipt-rule/${local.rule_name}"
}

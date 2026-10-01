resource "aws_ses_receipt_rule_set" "inbound" {
  rule_set_name = local.rule_set_name
}

# Store first, then forward, then stop; the stored copy survives any forwarding failure.
resource "aws_ses_receipt_rule" "feedback" {
  name          = local.rule_name
  rule_set_name = aws_ses_receipt_rule_set.inbound.rule_set_name
  recipients    = [local.feedback_address]
  enabled       = true
  scan_enabled  = true
  tls_policy    = "Require"

  s3_action {
    position          = 1
    bucket_name       = aws_s3_bucket.mail.id
    object_key_prefix = "inbound/"
  }

  lambda_action {
    position        = 2
    function_arn    = aws_lambda_function.forwarder.arn
    invocation_type = "Event"
  }

  stop_action {
    position = 3
    scope    = "RuleSet"
  }

  # SES test-writes to the bucket and checks the invoke permission when the rule is created.
  depends_on = [
    aws_s3_bucket_policy.mail,
    aws_lambda_permission.ses_invoke,
  ]
}

# Only one rule set is active per account and region; destroying this turns receiving off for the whole account in this region.
resource "aws_ses_active_receipt_rule_set" "inbound" {
  count = var.receiving_enabled ? 1 : 0

  rule_set_name = aws_ses_receipt_rule_set.inbound.rule_set_name
}

# Mail reaches SES only once this record exists.
resource "aws_route53_record" "inbound_mx" {
  count = var.receiving_enabled ? 1 : 0

  zone_id = data.aws_route53_zone.public.zone_id
  name    = var.domain_name
  type    = "MX"
  ttl     = 300
  records = ["10 inbound-smtp.us-east-2.amazonaws.com"]
}

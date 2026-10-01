# Every send goes through this set so bounces and complaints reach the alarm topic.
# Reputation metrics feed the bounce and complaint alarms; no open or click tracking.
resource "aws_sesv2_configuration_set" "mail" {
  configuration_set_name = "catherder-mail"

  reputation_options {
    reputation_metrics_enabled = true
  }
}

# Delivery problems arrive as notifications instead of being found later.
resource "aws_sesv2_configuration_set_event_destination" "alerts" {
  configuration_set_name = aws_sesv2_configuration_set.mail.configuration_set_name
  event_destination_name = "alerts"

  event_destination {
    enabled              = true
    matching_event_types = ["BOUNCE", "COMPLAINT", "REJECT", "DELIVERY_DELAY"]

    sns_destination {
      topic_arn = aws_sns_topic.alerts.arn
    }
  }

  depends_on = [aws_sns_topic_policy.alerts]
}

# Verifies the domain so any address at it may send, signed with its own DKIM key.
resource "aws_sesv2_email_identity" "domain" {
  email_identity         = var.domain_name
  configuration_set_name = aws_sesv2_configuration_set.mail.configuration_set_name

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

# SES always returns three DKIM tokens.
resource "aws_route53_record" "dkim" {
  count = 3

  zone_id = data.aws_route53_zone.public.zone_id
  name    = "${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 1800
  records = ["${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]
}

# A custom MAIL FROM aligns SPF with the domain, which DMARC needs.
resource "aws_sesv2_email_identity_mail_from_attributes" "domain" {
  email_identity         = aws_sesv2_email_identity.domain.email_identity
  mail_from_domain       = "bounce.${var.domain_name}"
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}

# Bounces to the MAIL FROM domain go back to SES.
resource "aws_route53_record" "mail_from_mx" {
  zone_id = data.aws_route53_zone.public.zone_id
  name    = "bounce.${var.domain_name}"
  type    = "MX"
  ttl     = 300
  records = ["10 feedback-smtp.us-east-2.amazonses.com"]
}

resource "aws_route53_record" "mail_from_spf" {
  zone_id = data.aws_route53_zone.public.zone_id
  name    = "bounce.${var.domain_name}"
  type    = "TXT"
  ttl     = 300
  records = ["v=spf1 include:amazonses.com ~all"]
}

# Only SES sends for the domain, so anything failing alignment is someone else.
resource "aws_route53_record" "dmarc" {
  zone_id = data.aws_route53_zone.public.zone_id
  name    = "_dmarc.${var.domain_name}"
  type    = "TXT"
  ttl     = 300
  records = ["v=DMARC1; p=reject;"]
}

# While SES is in the sandbox it only delivers to verified addresses; SES mails each a verification link.
resource "aws_sesv2_email_identity" "forward_to" {
  count = nonsensitive(length(var.forward_to))

  email_identity = var.forward_to[count.index]
}

# Lets the owner send as the feedback address from their preferred email client over SMTP; Terraform creates no access key for it.
resource "aws_iam_user" "smtp" {
  # A script depends on this exact name.
  name = "catherder-feedback-smtp"
}

data "aws_iam_policy_document" "smtp_send" {
  statement {
    effect  = "Allow"
    actions = ["ses:SendRawEmail"]
    resources = [
      aws_sesv2_email_identity.domain.arn,
      aws_sesv2_configuration_set.mail.arn,
    ]

    condition {
      test     = "StringEquals"
      variable = "ses:FromAddress"
      values   = [local.feedback_address]
    }
  }
}

resource "aws_iam_user_policy" "smtp_send" {
  name   = "send-as-feedback"
  user   = aws_iam_user.smtp.name
  policy = data.aws_iam_policy_document.smtp_send.json
}

# Every received message lands here first, so nothing is lost if forwarding fails.
resource "aws_s3_bucket" "mail" {
  bucket = "catherder-mail-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "mail" {
  bucket = aws_s3_bucket.mail.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ACLs off: the bucket policy alone decides who reads mail.
resource "aws_s3_bucket_ownership_controls" "mail" {
  bucket = aws_s3_bucket.mail.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# SSE-S3, so SES needs no KMS key grant to write.
resource "aws_s3_bucket_server_side_encryption_configuration" "mail" {
  bucket = aws_s3_bucket.mail.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Stored mail is personal data, so it is kept only as long as needed.
resource "aws_s3_bucket_lifecycle_configuration" "mail" {
  bucket = aws_s3_bucket.mail.id

  rule {
    id     = "expire-inbound"
    status = "Enabled"

    filter {
      prefix = "inbound/"
    }

    expiration {
      days = var.stored_mail_days
    }
  }

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# SES may write only for this account's feedback rule; only the functions and named readers may read.
data "aws_iam_policy_document" "mail_bucket" {
  statement {
    sid       = "AllowSesWrite"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.mail.arn}/inbound/*"]

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
      values   = [local.rule_arn]
    }
  }

  statement {
    sid       = "DenyReadToOthers"
    effect    = "Deny"
    actions   = ["s3:GetObject", "s3:GetObjectVersion"]
    resources = ["${aws_s3_bucket.mail.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "ArnNotEquals"
      variable = "aws:PrincipalArn"
      values   = concat([aws_iam_role.forwarder.arn, aws_iam_role.summary.arn], var.mail_readers)
    }
  }

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.mail.arn, "${aws_s3_bucket.mail.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "mail" {
  bucket = aws_s3_bucket.mail.id
  policy = data.aws_iam_policy_document.mail_bucket.json

  # S3 refuses concurrent changes to one bucket's settings.
  depends_on = [aws_s3_bucket_public_access_block.mail]
}

# Lambda's on-failure destination: events that still fail after retries are kept here for a person to read.
resource "aws_sqs_queue" "failures" {
  name                      = "catherder-mail-failures"
  message_retention_seconds = var.failure_record_days * 86400
  sqs_managed_sse_enabled   = true
}

# Failure records hold the whole SES event, addresses included, so only named readers may receive them.
data "aws_iam_policy_document" "failures_queue" {
  statement {
    sid       = "DenyReceiveToOthers"
    effect    = "Deny"
    actions   = ["sqs:ReceiveMessage"]
    resources = [aws_sqs_queue.failures.arn]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "ArnNotEquals"
      variable = "aws:PrincipalArn"
      values   = var.mail_readers
    }
  }
}

resource "aws_sqs_queue_policy" "failures" {
  queue_url = aws_sqs_queue.failures.id
  policy    = data.aws_iam_policy_document.failures_queue.json
}

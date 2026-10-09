# Event images: uploads land under pending/, and the resize function writes images/ or failed/.
resource "aws_s3_bucket" "images" {
  bucket = "catherder-${var.environment}-images-${data.aws_caller_identity.current.account_id}"
}

# Nothing in the bucket is public; the app reads pictures and serves them itself, and only uploads use a signed form.
resource "aws_s3_bucket_public_access_block" "images" {
  bucket = aws_s3_bucket.images.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ACLs off: IAM policies alone decide who reads and writes images.
resource "aws_s3_bucket_ownership_controls" "images" {
  bucket = aws_s3_bucket.images.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# SSE-S3, so neither the app nor the resize function needs a KMS key grant.
resource "aws_s3_bucket_server_side_encryption_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Every request must arrive over TLS, signed URLs included.
data "aws_iam_policy_document" "images_bucket" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.images.arn, "${aws_s3_bucket.images.arn}/*"]

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

resource "aws_s3_bucket_policy" "images" {
  bucket = aws_s3_bucket.images.id
  policy = data.aws_iam_policy_document.images_bucket.json

  # S3 refuses concurrent changes to one bucket's settings.
  depends_on = [aws_s3_bucket_public_access_block.images]
}

# Browsers upload straight to the bucket from the app's own pages.
resource "aws_s3_bucket_cors_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  cors_rule {
    allowed_methods = ["POST"]
    allowed_origins = ["https://${local.app_hostname}"]
    max_age_seconds = 3000
  }
}

# Uploads are resized within seconds, so anything still in pending/ or failed/ a day later is abandoned.
resource "aws_s3_bucket_lifecycle_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  rule {
    id     = "expire-pending"
    status = "Enabled"

    filter {
      prefix = "pending/"
    }

    expiration {
      days = 1
    }
  }

  rule {
    id     = "expire-failed"
    status = "Enabled"

    filter {
      prefix = "failed/"
    }

    expiration {
      days = 1
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

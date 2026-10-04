# Licensed files the app serves but the repository must not contain (fonts under fonts/, later images), copied into the app image at build time.

resource "aws_s3_bucket" "assets" {
  bucket = "catherder-assets-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# The image build copies these files into the image, so the build role reads them.
data "aws_iam_policy_document" "github_push_assets" {
  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.assets.arn}/*"]
  }
}

resource "aws_iam_role_policy" "github_push_assets" {
  name   = "read-licensed-assets"
  role   = aws_iam_role.github_push.id
  policy = data.aws_iam_policy_document.github_push_assets.json
}

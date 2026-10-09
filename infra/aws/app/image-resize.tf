# Created here so retention is never the console default of forever.
resource "aws_cloudwatch_log_group" "resize" {
  name              = "/aws/lambda/${local.name_prefix}-resize"
  retention_in_days = 14
}

resource "aws_iam_role" "resize" {
  name               = "${local.name_prefix}-resize"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

# Reads and removes uploads, and writes only resized images and refusals; nothing else in the account.
data "aws_iam_policy_document" "resize" {
  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.images.arn}/pending/*"]
  }

  statement {
    effect  = "Allow"
    actions = ["s3:PutObject"]
    resources = [
      "${aws_s3_bucket.images.arn}/images/*",
      "${aws_s3_bucket.images.arn}/failed/*",
    ]
  }

  statement {
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.resize.arn}:*"]
  }
}

resource "aws_iam_role_policy" "resize" {
  name   = "resize-images"
  role   = aws_iam_role.resize.id
  policy = data.aws_iam_policy_document.resize.json
}

# Invoked by S3 for each upload under pending/; it reaches only S3, so it runs outside the VPC.
resource "aws_lambda_function" "resize" {
  function_name = "${local.name_prefix}-resize"
  description   = "Resizes each uploaded event image to WebP without its metadata, or records why it cannot."
  role          = aws_iam_role.resize.arn
  package_type  = "Image"
  image_uri     = "${data.aws_ecr_repository.catherder.repository_url}:${var.resize_image_tag}"
  architectures = ["arm64"]
  memory_size   = 1024
  timeout       = 30

  reserved_concurrent_executions = var.resize_reserved_concurrency

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.resize.name
  }

  # Terraform sets the image only when the function is created; every deploy changes it through the pipeline, and Terraform must not change it back.
  lifecycle {
    ignore_changes = [image_uri]
  }

  depends_on = [aws_cloudwatch_log_group.resize]
}

# Only this account's images bucket may invoke the function.
resource "aws_lambda_permission" "s3_invoke" {
  statement_id   = "AllowS3Invoke"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.resize.function_name
  principal      = "s3.amazonaws.com"
  source_arn     = aws_s3_bucket.images.arn
  source_account = data.aws_caller_identity.current.account_id
}

# Each upload under pending/ starts one resize; the function writes elsewhere, so it never triggers itself.
resource "aws_s3_bucket_notification" "images" {
  bucket = aws_s3_bucket.images.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.resize.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "pending/"
  }

  # S3 checks that it may invoke the function when the notification is saved.
  depends_on = [aws_lambda_permission.s3_invoke]
}

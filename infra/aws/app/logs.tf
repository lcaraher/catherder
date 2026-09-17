# Created here so retention is never the console default of forever.
resource "aws_cloudwatch_log_group" "migrate" {
  name              = "/aws/lambda/${local.name_prefix}-migrate"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/aws/lambda/${local.name_prefix}-app"
  retention_in_days = 14
}

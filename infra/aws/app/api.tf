resource "aws_apigatewayv2_api" "app" {
  name            = "${local.name_prefix}-app"
  description     = "Public HTTP entry point that proxies every request to the application Lambda."
  protocol_type   = "HTTP"
  ip_address_type = "dualstack"
}

resource "aws_apigatewayv2_integration" "app" {
  api_id                 = aws_apigatewayv2_api.app.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.app.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.app.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.app.id}"
}

# No access logging yet; that arrives with the observability work.
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.app.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "api_invoke_app" {
  statement_id  = "AllowHttpApiInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.app.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.app.execution_arn}/*/*"
}

resource "aws_apigatewayv2_domain_name" "app" {
  domain_name = local.app_hostname

  domain_name_configuration {
    certificate_arn = aws_acm_certificate_validation.app.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
    ip_address_type = "dualstack"
  }
}

resource "aws_apigatewayv2_api_mapping" "app" {
  api_id      = aws_apigatewayv2_api.app.id
  domain_name = aws_apigatewayv2_domain_name.app.id
  stage       = aws_apigatewayv2_stage.default.id
}

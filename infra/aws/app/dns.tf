data "aws_route53_zone" "public" {
  name         = var.domain_name
  private_zone = false
}

# Alias to the API's regional domain; login.<env> hangs beneath this name, so it must exist first.
resource "aws_route53_record" "app" {
  zone_id = data.aws_route53_zone.public.zone_id
  name    = local.app_hostname
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.app.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.app.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "app_aaaa" {
  zone_id = data.aws_route53_zone.public.zone_id
  name    = local.app_hostname
  type    = "AAAA"

  alias {
    name                   = aws_apigatewayv2_domain_name.app.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.app.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

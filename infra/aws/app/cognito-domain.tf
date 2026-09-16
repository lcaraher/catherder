resource "aws_acm_certificate" "login" {
  provider = aws.us_east_1

  domain_name       = local.login_hostname
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "login_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.login.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id         = data.aws_route53_zone.public.zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "login" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.login.arn
  validation_record_fqdns = [for record in aws_route53_record.login_cert_validation : record.fqdn]
}

# Cognito requires the parent name to resolve before a custom domain can hang beneath it.
resource "aws_cognito_user_pool_domain" "login" {
  domain                = local.login_hostname
  user_pool_id          = aws_cognito_user_pool.users.id
  certificate_arn       = aws_acm_certificate_validation.login.certificate_arn
  managed_login_version = 2

  depends_on = [
    aws_acm_certificate_validation.login,
    aws_route53_record.app,
  ]
}

resource "aws_route53_record" "login_a" {
  zone_id = data.aws_route53_zone.public.zone_id
  name    = local.login_hostname
  type    = "A"

  alias {
    name                   = aws_cognito_user_pool_domain.login.cloudfront_distribution
    zone_id                = "Z2FDTNDATAQYW2"
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "login_aaaa" {
  zone_id = data.aws_route53_zone.public.zone_id
  name    = local.login_hostname
  type    = "AAAA"

  alias {
    name                   = aws_cognito_user_pool_domain.login.cloudfront_distribution
    zone_id                = "Z2FDTNDATAQYW2"
    evaluate_target_health = false
  }
}

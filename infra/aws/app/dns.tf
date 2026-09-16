data "aws_route53_zone" "public" {
  name         = var.domain_name
  private_zone = false
}

# Placeholder so the name exists before login.<env> hangs beneath it; replaced later by an alias to the API.
resource "aws_route53_record" "app" {
  zone_id = data.aws_route53_zone.public.zone_id
  name    = local.app_hostname
  type    = "A"
  ttl     = 60
  records = ["192.0.2.1"]
}

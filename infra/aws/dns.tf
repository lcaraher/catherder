# Public hosted zone for the project domain; the registrar's NS records
# point at the `hosted_zone_name_servers` output.

resource "aws_route53_zone" "public" {
  name = var.domain_name
}

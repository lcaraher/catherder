# Public hosted zone for the project domain. After the first apply, point the
# domain registrar's NS records at the name servers in the
# `hosted_zone_name_servers` output.

resource "aws_route53_zone" "public" {
  name = var.domain_name
}

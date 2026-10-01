provider "aws" {
  region = "us-east-2"

  default_tags {
    tags = {
      Project   = "catherder"
      Component = "mail"
      ManagedBy = "terraform"
    }
  }
}

# Account id and region build the bucket name and the receipt rule ARN.
data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

# The zone is owned by infra/aws; this stack only adds records to it.
data "aws_route53_zone" "public" {
  name         = var.domain_name
  private_zone = false
}

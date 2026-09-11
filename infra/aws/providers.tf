provider "aws" {
  region = "us-east-2"
}

# Used to build a globally-unique state bucket name and the OIDC role ARN.
data "aws_caller_identity" "current" {}

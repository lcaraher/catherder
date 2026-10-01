terraform {
  # A variable's validation refers to another variable, which needs Terraform 1.9.
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.64"
    }
    # Glob patterns in archive_file excludes need 2.5 or later.
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.8"
    }
  }

  backend "s3" {
    bucket       = "catherder-tfstate-567487920465"
    key          = "infra/aws/mail/terraform.tfstate"
    region       = "us-east-2"
    encrypt      = true
    use_lockfile = true
  }
}

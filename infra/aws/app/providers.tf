provider "aws" {
  region = "us-east-2"

  default_tags {
    tags = {
      Project     = "catherder"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Cognito custom-domain certificates must live in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "catherder"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

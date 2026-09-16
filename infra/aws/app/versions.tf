terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.64"
    }
  }

  # Partial backend: the state key comes from backend.<env>.hcl at init time.
  backend "s3" {
    bucket       = "catherder-tfstate-567487920465"
    region       = "us-east-2"
    encrypt      = true
    use_lockfile = true
  }
}

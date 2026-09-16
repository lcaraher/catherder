variable "environment" {
  description = "Deployment environment; selects hostnames, names, and tags."
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be \"dev\" or \"prod\"."
  }
}

variable "domain_name" {
  description = "Apex domain whose public hosted zone already exists (e.g. example.com)."
  type        = string
}

variable "vpc_cidr" {
  description = "IPv4 CIDR block for the application VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones for the app and database subnets, one subnet of each per zone."
  type        = list(string)
  default     = ["us-east-2a", "us-east-2b"]
}

variable "app_callback_urls" {
  description = "OAuth redirect URIs the Cognito app client may send the code to."
  type        = list(string)
}

variable "app_logout_urls" {
  description = "URLs the Cognito hosted logout endpoint may redirect back to."
  type        = list(string)
}

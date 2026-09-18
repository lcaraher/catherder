variable "domain_name" {
  description = "Apex domain for the Route 53 public hosted zone (e.g. example.com)."
  type        = string
}

variable "github_org" {
  description = "GitHub organization or username that owns the deploy repository."
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name allowed to assume the deploy role."
  type        = string
}

variable "budget_email" {
  description = "Email address that receives AWS budget alerts."
  type        = string
}

variable "github_owner_id" {
  description = "Numeric id of the GitHub owner, as GitHub puts it in the immutable OIDC subject."
  type        = string
}

variable "github_repo_id" {
  description = "Numeric id of the GitHub repository, as GitHub puts it in the immutable OIDC subject."
  type        = string
}

variable "deploy_environments" {
  description = "GitHub Environment names whose approved deploy jobs may assume the deploy role."
  type        = list(string)
  default     = ["dev"]
}

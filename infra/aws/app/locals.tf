locals {
  # prod is app.<domain>; every other environment is <env>.<domain>.
  app_hostname   = var.environment == "prod" ? "app.${var.domain_name}" : "${var.environment}.${var.domain_name}"
  login_hostname = var.environment == "prod" ? "login.${var.domain_name}" : "login.${var.environment}.${var.domain_name}"
  name_prefix    = "catherder-${var.environment}"
}

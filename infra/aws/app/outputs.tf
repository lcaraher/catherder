output "vpc_id" {
  description = "ID of the application VPC."
  value       = aws_vpc.this.id
}

output "app_subnet_ids" {
  description = "IDs of the app subnets, in availability-zone order."
  value       = aws_subnet.app[*].id
}

output "db_subnet_ids" {
  description = "IDs of the database subnets, in availability-zone order."
  value       = aws_subnet.db[*].id
}

output "db_subnet_group_name" {
  description = "Name of the RDS subnet group over the database subnets."
  value       = aws_db_subnet_group.db.name
}

output "lambda_security_group_id" {
  description = "Security group for the application Lambda functions."
  value       = aws_security_group.lambda.id
}

output "database_security_group_id" {
  description = "Security group for the PostgreSQL database."
  value       = aws_security_group.database.id
}

output "app_hostname" {
  description = "Hostname the application is served at."
  value       = local.app_hostname
}

output "login_hostname" {
  description = "Hostname for the login (Cognito) domain."
  value       = local.login_hostname
}

output "cognito_user_pool_id" {
  description = "ID of the Cognito user pool."
  value       = aws_cognito_user_pool.users.id
}

output "cognito_issuer" {
  description = "OIDC issuer URL of the user pool."
  value       = "https://cognito-idp.${data.aws_region.current.region}.amazonaws.com/${aws_cognito_user_pool.users.id}"
}

output "cognito_jwks_url" {
  description = "JWKS endpoint the app verifies tokens against."
  value       = "https://cognito-idp.${data.aws_region.current.region}.amazonaws.com/${aws_cognito_user_pool.users.id}/.well-known/jwks.json"
}

output "cognito_client_id" {
  description = "ID of the public app client."
  value       = aws_cognito_user_pool_client.app.id
}

output "cognito_login_domain" {
  description = "Custom domain serving the Cognito managed login pages."
  value       = local.login_hostname
}

output "database_host" {
  description = "Hostname of the PostgreSQL instance."
  value       = aws_db_instance.postgres.address
}

output "database_port" {
  description = "Port of the PostgreSQL instance."
  value       = aws_db_instance.postgres.port
}

output "database_name" {
  description = "Name of the application database."
  value       = aws_db_instance.postgres.db_name
}

output "database_secret_arn" {
  description = "ARN of the RDS-managed master user secret."
  value       = aws_db_instance.postgres.master_user_secret[0].secret_arn
}

output "database_username" {
  description = "Master username of the PostgreSQL instance."
  value       = aws_db_instance.postgres.username
}

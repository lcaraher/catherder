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

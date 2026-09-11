output "hosted_zone_name_servers" {
  description = "Route 53 name servers to configure at the domain registrar."
  value       = aws_route53_zone.public.name_servers
}

output "deploy_role_arn" {
  description = "ARN of the github-deploy role for GitHub Actions (role-to-assume)."
  value       = aws_iam_role.github_deploy.arn
}

output "state_bucket_name" {
  description = "Name of the Terraform state bucket (paste into the S3 backend block)."
  value       = aws_s3_bucket.tf_state.bucket
}

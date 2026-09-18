output "hosted_zone_name_servers" {
  description = "Route 53 name servers to configure at the domain registrar."
  value       = aws_route53_zone.public.name_servers
}

output "deploy_role_arn" {
  description = "ARN of the github-deploy role for GitHub Actions (role-to-assume)."
  value       = aws_iam_role.github_deploy.arn
}

output "plan_role_arn" {
  description = "ARN of the github-plan role for pull-request jobs (role-to-assume)."
  value       = aws_iam_role.github_plan.arn
}

output "push_role_arn" {
  description = "ARN of the github-push role for push-to-main image builds (role-to-assume)."
  value       = aws_iam_role.github_push.arn
}

output "state_bucket_name" {
  description = "Name of the Terraform state bucket (paste into the S3 backend block)."
  value       = aws_s3_bucket.tf_state.bucket
}

output "ecr_repository_url" {
  description = "URL of the catherder ECR repository (docker push target and image base for environment roots)."
  value       = aws_ecr_repository.catherder.repository_url
}

output "ecr_repository_arn" {
  description = "ARN of the catherder ECR repository (for IAM policies that push or pull images)."
  value       = aws_ecr_repository.catherder.arn
}

output "ecr_repository_name" {
  description = "Name of the catherder ECR repository (for lifecycle and scanning references)."
  value       = aws_ecr_repository.catherder.name
}

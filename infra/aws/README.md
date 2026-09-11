# infra/aws

Account-level plumbing for the catherder project — no application resources. Region: `us-east-2`.

## Files

- `versions.tf` — Terraform/provider version constraints and the commented-out S3 backend block (with migration instructions).
- `providers.tf` — AWS provider pinned to `us-east-2`, plus the caller-identity data source.
- `variables.tf` — input variables: `domain_name`, `github_org`, `github_repo`, `budget_email`.
- `state-bucket.tf` — versioned, encrypted, fully-private S3 bucket for Terraform state.
- `github-oidc.tf` — GitHub Actions OIDC provider and the `github-deploy` role restricted to this repo's `main` branch.
- `dns.tf` — Route 53 public hosted zone for `domain_name`.
- `budgets.tf` — $10 and $25 monthly cost budgets emailing `budget_email` at 100% actual spend.
- `outputs.tf` — hosted zone name servers, deploy role ARN, and state bucket name.
- `terraform.tfvars.example` — placeholder variable values; copy to `terraform.tfvars` (gitignored) and fill in.

## First apply

1. `cp terraform.tfvars.example terraform.tfvars` and fill in real values.
2. `terraform init && terraform apply` (local backend — state stays on disk).
3. Follow the instructions in `versions.tf` to migrate state into the new S3 bucket.
4. Point the domain registrar at the `hosted_zone_name_servers` output.

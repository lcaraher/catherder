# GitHub Actions OIDC federation, three roles for three workflow contexts:
# github-plan is assumed by pull-request jobs and can only read;
# github-push is assumed by push-to-main jobs and can only push the image to ECR;
# github-deploy is assumed by jobs that named an approved GitHub Environment and deploys.

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  # AWS validates GitHub's OIDC cert against its own trusted CA list and
  # ignores this value, but the argument is still required by the API.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

locals {
  # GitHub's immutable subject form: owner and repository names carry their
  # numeric ids, so a renamed or re-created repository cannot inherit the trust.
  github_subject_prefix = "repo:${var.github_org}@${var.github_owner_id}/${var.github_repo}@${var.github_repo_id}"
}

data "aws_iam_policy_document" "github_deploy_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Only a deploy job that named a GitHub Environment, and so passed its required-reviewer rule, may assume this role.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [for e in var.deploy_environments : "${local.github_subject_prefix}:environment:${e}"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_deploy_trust.json
}

# TODO: narrow to least-privilege deploy permissions; AdministratorAccess
# is a temporary bootstrap convenience only.
resource "aws_iam_role_policy_attachment" "github_deploy_admin" {
  role       = aws_iam_role.github_deploy.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

data "aws_iam_policy_document" "github_plan_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Only pull-request jobs of this exact repo may assume this role.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${local.github_subject_prefix}:pull_request"]
    }
  }
}

resource "aws_iam_role" "github_plan" {
  name               = "github-plan"
  assume_role_policy = data.aws_iam_policy_document.github_plan_trust.json
}

resource "aws_iam_role_policy_attachment" "github_plan_readonly" {
  role       = aws_iam_role.github_plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# A plan never needs a secret's value, so make that impossible even though ReadOnlyAccess is broad.
data "aws_iam_policy_document" "github_plan_deny_secrets" {
  statement {
    effect    = "Deny"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_plan_deny_secrets" {
  name   = "deny-secret-values"
  role   = aws_iam_role.github_plan.id
  policy = data.aws_iam_policy_document.github_plan_deny_secrets.json
}

data "aws_iam_policy_document" "github_push_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Only push-to-main jobs of this exact repo, outside any Environment, may assume this role.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${local.github_subject_prefix}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_push" {
  name               = "github-push"
  assume_role_policy = data.aws_iam_policy_document.github_push_trust.json
}

data "aws_iam_policy_document" "github_push_ecr" {
  # GetAuthorizationToken accepts no narrower resource than "*".
  statement {
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:CompleteLayerUpload",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
      "ecr:DescribeImages",
    ]
    resources = [aws_ecr_repository.catherder.arn]
  }
}

resource "aws_iam_role_policy" "github_push_ecr" {
  name   = "push-catherder-image"
  role   = aws_iam_role.github_push.id
  policy = data.aws_iam_policy_document.github_push_ecr.json
}

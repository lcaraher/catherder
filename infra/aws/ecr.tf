# Container registry for the application image.

resource "aws_ecr_repository" "catherder" {
  name                 = "catherder"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false

  encryption_configuration {
    encryption_type = "AES256"
  }

  # No image_scanning_configuration: AWS deprecated repository-level scan settings in favour of the registry-level configuration below.
}

resource "aws_ecr_lifecycle_policy" "catherder" {
  repository = aws_ecr_repository.catherder.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep only the last 5 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 5
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# Per-account, per-region setting, so it lives in the foundations root, not an environment root.
resource "aws_ecr_registry_scanning_configuration" "this" {
  scan_type = "BASIC"

  rule {
    scan_frequency = "SCAN_ON_PUSH"

    repository_filter {
      filter      = "catherder"
      filter_type = "WILDCARD"
    }
  }
}

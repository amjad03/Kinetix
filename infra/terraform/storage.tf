# Objects (lesson recordings today): private, KMS-encrypted, versioned, TLS-only, in India.
resource "aws_s3_bucket" "objects" {
  # The account id keeps the global bucket name unique without hard-coding it.
  bucket        = "${local.name}-objects-${local.account_id}"
  force_destroy = false
}

resource "aws_s3_bucket_ownership_controls" "objects" {
  bucket = aws_s3_bucket.objects.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "objects" {
  bucket                  = aws_s3_bucket.objects.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "objects" {
  bucket = aws_s3_bucket.objects.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "objects" {
  bucket = aws_s3_bucket.objects.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.data.arn
    }
    bucket_key_enabled = true
  }
}

data "aws_iam_policy_document" "objects" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.objects.arn, "${aws_s3_bucket.objects.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "objects" {
  bucket     = aws_s3_bucket.objects.id
  policy     = data.aws_iam_policy_document.objects.json
  depends_on = [aws_s3_bucket_public_access_block.objects]
}

resource "aws_s3_bucket_lifecycle_configuration" "objects" {
  bucket = aws_s3_bucket.objects.id

  # Recordings are kept under tenants/<tenant>/recordings/<id>/...
  rule {
    id     = "recordings-tiering"
    status = "Enabled"
    filter {
      prefix = "tenants/"
    }

    transition {
      days          = var.recordings_ia_after_days
      storage_class = "STANDARD_IA"
    }

    dynamic "transition" {
      for_each = var.recordings_glacier_after_days > 0 ? [1] : []
      content {
        days          = var.recordings_glacier_after_days
        storage_class = "GLACIER_IR"
      }
    }

    dynamic "expiration" {
      for_each = var.recordings_expire_after_days > 0 ? [1] : []
      content {
        days = var.recordings_expire_after_days
      }
    }

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_versions_expire_after_days
    }
  }

  rule {
    id     = "housekeeping"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
    expiration {
      expired_object_delete_marker = true
    }
  }

  depends_on = [aws_s3_bucket_versioning.objects]
}

# ---------------------------------------------------------------------------------------------
# Container registries (pushed by .github/workflows/docker.yml)
# ---------------------------------------------------------------------------------------------
resource "aws_ecr_repository" "app" {
  for_each             = toset(["api", "erp"])
  name                 = "${local.name}-${each.key}"
  image_tag_mutability = "MUTABLE" # :main moves; deploy by the immutable git-SHA tag
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.data.arn
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  for_each   = aws_ecr_repository.app
  repository = each.value.name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Drop untagged layers after 7 days"
        selection    = { tagStatus = "untagged", countType = "sinceImagePushed", countUnit = "days", countNumber = 7 }
        action       = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep the last 50 images (rollback targets)"
        selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 50 }
        action       = { type = "expire" }
      },
    ]
  })
}

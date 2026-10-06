# PhET Interactive Simulations mirror (docs/operations/phet.md): unmodified copies of PhET's
# HTML5 sims (University of Colorado Boulder, CC BY 4.0), uploaded by tools/phet/mirror.mjs to a
# bucket in var.aws_region and served through CloudFront, so boards download them from India
# rather than from Colorado. Public, openly licensed content only: no personal or school data is
# ever written here. The API redirects GET /v1/content/sims/phet/:id to PHET_MIRROR_URL.

resource "aws_s3_bucket" "phet" {
  count         = var.phet_mirror_enabled ? 1 : 0
  bucket        = "${local.name}-phet-${local.account_id}"
  force_destroy = true # a cache of public files; mirror.mjs refills it
}

resource "aws_s3_bucket_ownership_controls" "phet" {
  count  = var.phet_mirror_enabled ? 1 : 0
  bucket = aws_s3_bucket.phet[0].id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Private: only CloudFront (by origin access control) reads it.
resource "aws_s3_bucket_public_access_block" "phet" {
  count                   = var.phet_mirror_enabled ? 1 : 0
  bucket                  = aws_s3_bucket.phet[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# SSE-S3 rather than the data KMS key: the files are public, and CloudFront reads them directly.
resource "aws_s3_bucket_server_side_encryption_configuration" "phet" {
  count  = var.phet_mirror_enabled ? 1 : 0
  bucket = aws_s3_bucket.phet[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "phet" {
  count                             = var.phet_mirror_enabled ? 1 : 0
  name                              = "${local.name}-phet"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "phet" {
  count           = var.phet_mirror_enabled ? 1 : 0
  enabled         = true
  comment         = "${local.name} PhET sims mirror (CC BY 4.0)"
  is_ipv6_enabled = true
  # Price class 200 includes the edge locations in India.
  price_class = "PriceClass_200"

  origin {
    domain_name              = aws_s3_bucket.phet[0].bucket_regional_domain_name
    origin_id                = "phet"
    origin_access_control_id = aws_cloudfront_origin_access_control.phet[0].id
  }

  default_cache_behavior {
    target_origin_id       = "phet"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    # Managed "CachingOptimized": honours the objects' Cache-Control; ?locale= is read by the
    # page itself, so it is not part of the cache key.
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  restrictions {
    geo_restriction {
      restriction_type = length(var.phet_mirror_countries) > 0 ? "whitelist" : "none"
      locations        = var.phet_mirror_countries
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

data "aws_iam_policy_document" "phet" {
  count = var.phet_mirror_enabled ? 1 : 0
  statement {
    sid       = "CloudFrontReads"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.phet[0].arn}/phet/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.phet[0].arn]
    }
  }
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.phet[0].arn, "${aws_s3_bucket.phet[0].arn}/*"]
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

resource "aws_s3_bucket_policy" "phet" {
  count      = var.phet_mirror_enabled ? 1 : 0
  bucket     = aws_s3_bucket.phet[0].id
  policy     = data.aws_iam_policy_document.phet[0].json
  depends_on = [aws_s3_bucket_public_access_block.phet]
}

locals {
  phet_mirror_url = var.phet_mirror_enabled ? "https://${aws_cloudfront_distribution.phet[0].domain_name}/phet" : ""
}

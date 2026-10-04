# KINETIX on AWS, ap-south-1 (Mumbai). One root module, one state per environment:
#   terraform init -backend-config=environments/staging.backend.hcl
#   terraform plan -var-file=environments/staging.tfvars
# See docs/operations/deploy.md. Nothing here leaves India: every resource is in var.aws_region,
# which must be an ap-south-* region.
terraform {
  required_version = ">= 1.10" # S3 backend native locking (use_lockfile)

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Partial configuration: bucket/key/region come from environments/<env>.backend.hcl.
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(var.tags, {
      Project     = "kinetix"
      Environment = var.environment
      ManagedBy   = "terraform"
      DataRegion  = var.aws_region
    })
  }
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name       = "kinetix-${var.environment}"
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition
  azs        = slice(data.aws_availability_zones.available.names, 0, var.az_count)
  is_prod    = var.environment == "prod"
}

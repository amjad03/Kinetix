# ---------------------------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------------------------
variable "environment" {
  description = "staging or prod. Names every resource (kinetix-<environment>-...)."
  type        = string
  validation {
    condition     = contains(["staging", "prod"], var.environment)
    error_message = "environment must be staging or prod."
  }
}

variable "aws_region" {
  description = "Student data stays in India: ap-south-1 (Mumbai), or ap-south-2 (Hyderabad)."
  type        = string
  default     = "ap-south-1"
  validation {
    condition     = can(regex("^ap-south-[12]$", var.aws_region))
    error_message = "aws_region must be in India (ap-south-1 or ap-south-2)."
  }
}

variable "tags" {
  description = "Extra tags for every resource."
  type        = map(string)
  default     = {}
}

# ---------------------------------------------------------------------------------------------
# Network
# ---------------------------------------------------------------------------------------------
variable "vpc_cidr" {
  description = "VPC range. Split into public, private (app) and data subnets per AZ."
  type        = string
  default     = "10.40.0.0/16"
}

variable "az_count" {
  description = "Availability zones (2 is enough for a pilot; RDS Multi-AZ and the ALB need 2)."
  type        = number
  default     = 2
  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "az_count must be 2 or 3."
  }
}

variable "single_nat_gateway" {
  description = "One NAT gateway for all private subnets (cheaper, one AZ is a single point of failure for outbound calls) instead of one per AZ."
  type        = bool
  default     = true
}

# ---------------------------------------------------------------------------------------------
# DNS and TLS
# ---------------------------------------------------------------------------------------------
variable "api_domain" {
  description = "Host name of the API (apps, boards and the ERP server call it), e.g. api.staging.kinetix.in."
  type        = string
}

variable "erp_domain" {
  description = "Host name of the ERP, e.g. erp.staging.kinetix.in."
  type        = string
}

variable "acm_certificate_arn" {
  description = "ACM certificate in the same region covering api_domain and erp_domain (issued/validated outside Terraform)."
  type        = string
  validation {
    condition     = can(regex("^arn:aws[a-z-]*:acm:ap-south-[12]:[0-9]{12}:certificate/.+$", var.acm_certificate_arn))
    error_message = "acm_certificate_arn must be an ACM certificate ARN in ap-south-1/ap-south-2."
  }
}

variable "route53_zone_id" {
  description = "Optional Route 53 hosted zone id: when set, alias records for api_domain and erp_domain are created. Leave empty to point DNS at the ALB yourself."
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------------------------------
# Containers
# ---------------------------------------------------------------------------------------------
variable "image_tag" {
  description = "Image tag deployed for the api, erp and one-off tasks (the 12-character git SHA pushed by .github/workflows/docker.yml)."
  type        = string
  default     = "main"
}

variable "api_cpu" {
  type    = number
  default = 512
}

variable "api_memory" {
  type    = number
  default = 1024
}

variable "api_desired_count" {
  description = "API tasks. More than one needs Redis (always provisioned here)."
  type        = number
  default     = 1
}

variable "api_max_count" {
  description = "Upper bound for CPU-based autoscaling of the API."
  type        = number
  default     = 2
}

variable "erp_cpu" {
  type    = number
  default = 256
}

variable "erp_memory" {
  type    = number
  default = 512
}

variable "erp_desired_count" {
  type    = number
  default = 1
}

variable "enable_ecs_exec" {
  description = "Allow `aws ecs execute-command` into running tasks (break-glass production access; audited in CloudTrail)."
  type        = bool
  default     = false
}

variable "container_insights" {
  description = "ECS Container Insights (per-task metrics; extra CloudWatch cost)."
  type        = bool
  default     = false
}

# ---------------------------------------------------------------------------------------------
# Database (RDS PostgreSQL)
# ---------------------------------------------------------------------------------------------
variable "db_engine_version" {
  description = "PostgreSQL major version (RDS picks the current minor; minor upgrades are automatic in the maintenance window)."
  type        = string
  default     = "16"
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.small"
}

variable "db_allocated_storage" {
  description = "Initial gp3 storage in GiB."
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Storage autoscaling ceiling in GiB."
  type        = number
  default     = 100
}

variable "db_multi_az" {
  description = "Standby in a second AZ with automatic failover (roughly doubles the RDS instance cost)."
  type        = bool
  default     = false
}

variable "db_backup_retention_days" {
  description = "Automated backups and point-in-time recovery window, in days (14-35)."
  type        = number
  default     = 14
  validation {
    condition     = var.db_backup_retention_days >= 14 && var.db_backup_retention_days <= 35
    error_message = "db_backup_retention_days must be between 14 and 35."
  }
}

variable "db_performance_insights" {
  description = "Performance Insights (free 7-day retention; not available on the smallest classes)."
  type        = bool
  default     = false
}

variable "db_deletion_protection" {
  type    = bool
  default = true
}

# ---------------------------------------------------------------------------------------------
# Redis (ElastiCache)
# ---------------------------------------------------------------------------------------------
variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}

variable "redis_nodes" {
  description = "1 = single node; 2 = primary + replica with automatic failover (Multi-AZ)."
  type        = number
  default     = 1
  validation {
    condition     = var.redis_nodes >= 1 && var.redis_nodes <= 3
    error_message = "redis_nodes must be 1-3."
  }
}

# ---------------------------------------------------------------------------------------------
# Object storage (recordings)
# ---------------------------------------------------------------------------------------------
variable "recordings_ia_after_days" {
  description = "Move recordings to S3 Standard-IA after this many days."
  type        = number
  default     = 30
}

variable "recordings_glacier_after_days" {
  description = "Move recordings to Glacier Instant Retrieval after this many days (0 = never)."
  type        = number
  default     = 180
}

variable "recordings_expire_after_days" {
  description = "Delete recordings after this many days (0 = keep). The retention period is a policy decision for each institution; the API also deletes recordings itself."
  type        = number
  default     = 0
}

variable "noncurrent_versions_expire_after_days" {
  description = "How long overwritten/deleted object versions are kept (the undo window for accidental deletes)."
  type        = number
  default     = 30
}

# ---------------------------------------------------------------------------------------------
# Application settings (plain environment variables)
# ---------------------------------------------------------------------------------------------
variable "ai_base_url" {
  description = "Primary, self-hosted OpenAI-compatible model server (vLLM on a college GPU box or an E2E Networks GPU). Must be in India. Empty = Sarvam alone if ai_fallback_provider = sarvam, else labelled previews. No GPU infrastructure is created here (docs/operations/ai-hosting.md)."
  type        = string
  default     = ""
}

variable "ai_model" {
  type    = string
  default = "kinetix-llm"
}

variable "asr_base_url" {
  description = "Primary, self-hosted OpenAI-compatible speech-to-text server (faster-whisper / IndicConformer). Must be in India. Empty = Sarvam alone if asr_fallback_provider = sarvam, else no transcripts."
  type        = string
  default     = ""
}

variable "asr_model" {
  type    = string
  default = "whisper"
}

variable "ai_fallback_provider" {
  description = "Pay-per-use fallback for AI tasks when the primary is down or unset: none or sarvam (fill in the sarvam secret first)."
  type        = string
  default     = "none"
  validation {
    condition     = contains(["none", "sarvam"], var.ai_fallback_provider)
    error_message = "ai_fallback_provider must be none or sarvam."
  }
}

variable "asr_fallback_provider" {
  description = "Pay-per-use fallback for lesson transcripts: none or sarvam (fill in the sarvam secret first)."
  type        = string
  default     = "none"
  validation {
    condition     = contains(["none", "sarvam"], var.asr_fallback_provider)
    error_message = "asr_fallback_provider must be none or sarvam."
  }
}

variable "asr_monthly_hours" {
  description = "Hours of lesson audio each institution may transcribe per month (0 = no cap)."
  type        = number
  default     = 300
}

variable "sms_provider" {
  description = "console (codes go to the logs: staging only) or msg91 (needs the msg91 secret filled in)."
  type        = string
  default     = "console"
  validation {
    condition     = contains(["console", "msg91"], var.sms_provider)
    error_message = "sms_provider must be console or msg91."
  }
}

variable "payments_provider" {
  description = "none, demo (no money moves: staging only) or razorpay (each institution enters its own Razorpay keys in the ERP; fees go to its account)."
  type        = string
  default     = "none"
  validation {
    condition     = contains(["none", "demo", "razorpay"], var.payments_provider)
    error_message = "payments_provider must be none, demo or razorpay."
  }
}

variable "secrets_encryption_key_version" {
  description = "Version of SECRETS_ENCRYPTION_KEY (random_bytes.secrets_encryption). Raise it when replacing the key (docs/operations/security.md)."
  type        = number
  default     = 1
}

variable "secrets_encryption_old_keys" {
  description = "During a key rotation only: the previous master key(s) as \"<version>:<base64>\", until rotate-secrets has run. Empty otherwise."
  type        = string
  default     = ""
  sensitive   = true
}

variable "push_enabled" {
  description = "Inject FCM_SERVICE_ACCOUNT from the fcm secret (fill it in first)."
  type        = bool
  default     = false
}

variable "extra_api_environment" {
  description = "Additional plain environment variables for the API (e.g. AI_DAILY_LIMIT)."
  type        = map(string)
  default     = {}
}

# ---------------------------------------------------------------------------------------------
# Operations
# ---------------------------------------------------------------------------------------------
variable "alarm_emails" {
  description = "Addresses subscribed to the alarm topic (each must confirm the subscription email)."
  type        = list(string)
  default     = []
}

variable "log_retention_days" {
  type    = number
  default = 90
}

variable "github_repository" {
  description = "owner/repo allowed to push images to this environment's ECR repositories via GitHub OIDC (empty = no role)."
  type        = string
  default     = ""
}

variable "github_oidc_provider_arn" {
  description = "Existing GitHub OIDC provider in this account (there can be only one). Empty = create it (do that in one environment only)."
  type        = string
  default     = ""
}

variable "code_runner_cpu" {
  description = "The code runner's CPU units (C, C++ and Java for the code lab)."
  type        = number
  default     = 1024
}

variable "code_runner_memory" {
  type    = number
  default = 2048
}

variable "code_runner_count" {
  description = "Code runner tasks. Each runs code_runner_concurrency programs at once."
  type        = number
  default     = 1
}

variable "code_runner_concurrency" {
  type    = number
  default = 2
}

variable "code_run_tenant_per_minute" {
  description = "Code runs (C, C++, Java) each institution may start per minute."
  type        = number
  default     = 120
}

variable "phet_mirror_enabled" {
  description = "Mirror PhET's sims in India (phet.tf). Off: the API sends boards to phet.colorado.edu."
  type        = bool
  default     = true
}

variable "phet_mirror_countries" {
  description = "Countries (ISO 3166-1 alpha-2) the PhET mirror serves; empty = everywhere."
  type        = list(string)
  default     = ["IN"]
}

# ---------------------------------------------------------------------------------------------
# Observability and upload scanning (docs/operations/observability.md)
# ---------------------------------------------------------------------------------------------

variable "otel_exporter_endpoint" {
  description = "OTLP/HTTP collector base URL for API traces (e.g. http://otel-collector.kinetix.internal:4318). Empty = tracing off."
  type        = string
  default     = ""
}

variable "upload_scan" {
  description = "Virus scanning of uploaded documents: off, or clamav (quarantine until a clamd at clamav_host says clean)."
  type        = string
  default     = "off"

  validation {
    condition     = contains(["off", "clamav"], var.upload_scan)
    error_message = "upload_scan must be off or clamav."
  }
}

variable "clamav_host" {
  description = "Host of the clamd service (port 3310) when upload_scan = clamav."
  type        = string
  default     = ""
}

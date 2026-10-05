# Staging: smallest sizes, single AZ for data, demo payments and console SMS allowed.
environment         = "staging"
aws_region          = "ap-south-1"
api_domain          = "api.staging.example.in"                                    # CHANGE
erp_domain          = "erp.staging.example.in"                                    # CHANGE
acm_certificate_arn = "arn:aws:acm:ap-south-1:000000000000:certificate/CHANGE-ME" # CHANGE
# route53_zone_id   = "Z..."

image_tag         = "main"
api_cpu           = 512
api_memory        = 1024
api_desired_count = 1
api_max_count     = 2
erp_cpu           = 256
erp_memory        = 512
erp_desired_count = 1

db_instance_class        = "db.t4g.small"
db_allocated_storage     = 20
db_max_allocated_storage = 50
db_multi_az              = false
db_backup_retention_days = 14
db_deletion_protection   = false

redis_node_type = "cache.t4g.micro"
redis_nodes     = 1

single_nat_gateway = true
log_retention_days = 30

sms_provider      = "console"
payments_provider = "demo"
push_enabled      = false

# Self-hosted AI (vLLM / faster-whisper on a college or E2E Networks GPU); must be in India.
ai_base_url  = ""
asr_base_url = ""
# Pay-per-use fallback (and the only provider while the URLs above are empty). Fill in the
# kinetix/<env>/sarvam secret first. See docs/operations/ai-hosting.md.
ai_fallback_provider  = "none"
asr_fallback_provider = "none"

alarm_emails      = [] # e.g. ["ops@example.in"]
github_repository = "" # e.g. "your-org/Kinetix"

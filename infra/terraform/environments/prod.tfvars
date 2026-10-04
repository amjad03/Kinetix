# Production pilot (one or two institutions): Multi-AZ database, two API tasks, real SMS.
environment         = "prod"
aws_region          = "ap-south-1"
api_domain          = "api.example.in"                                            # CHANGE
erp_domain          = "erp.example.in"                                            # CHANGE
acm_certificate_arn = "arn:aws:acm:ap-south-1:000000000000:certificate/CHANGE-ME" # CHANGE
# route53_zone_id   = "Z..."

image_tag         = "CHANGE-to-git-sha" # deploy an immutable SHA tag, never :main
api_cpu           = 1024
api_memory        = 2048
api_desired_count = 2
api_max_count     = 4
erp_cpu           = 512
erp_memory        = 1024
erp_desired_count = 2

db_instance_class        = "db.t4g.medium"
db_allocated_storage     = 50
db_max_allocated_storage = 200
db_multi_az              = true
db_backup_retention_days = 14
db_performance_insights  = true
db_deletion_protection   = true

redis_node_type = "cache.t4g.small"
redis_nodes     = 2

single_nat_gateway = true # set false for a NAT gateway per AZ (+ ~USD 35/month each)
log_retention_days = 90
enable_ecs_exec    = false

sms_provider      = "msg91"    # fill in kinetix/prod/msg91 first
payments_provider = "razorpay" # fill in kinetix/prod/razorpay first, or "none"
push_enabled      = true       # fill in kinetix/prod/fcm first

ai_base_url  = ""
asr_base_url = ""

alarm_emails      = [] # CHANGE
github_repository = "" # e.g. "your-org/Kinetix"
# github_oidc_provider_arn = "" # set if staging already created the GitHub OIDC provider in this account

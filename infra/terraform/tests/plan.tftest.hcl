# Offline checks of the configuration logic (no AWS account needed):
#   terraform init -backend=false && terraform test
mock_provider "aws" {
  mock_data "aws_availability_zones" {
    defaults = { names = ["ap-south-1a", "ap-south-1b", "ap-south-1c"] }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111111111111" }
  }
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}" }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:ap-south-1:111111111111:secret:kinetix/x" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:ap-south-1:111111111111:key/x" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111111111111:role/x" }
  }
  mock_resource "aws_ecs_task_definition" {
    defaults = { arn = "arn:aws:ecs:ap-south-1:111111111111:task-definition/x:1" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:ap-south-1:111111111111:targetgroup/x/1" }
  }
  mock_resource "aws_lb" {
    defaults = { arn = "arn:aws:elasticloadbalancing:ap-south-1:111111111111:loadbalancer/app/x/1" }
  }
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:ap-south-1:111111111111:x" }
  }
  mock_resource "aws_elasticache_replication_group" {
    defaults = { member_clusters = ["kinetix-001"], primary_endpoint_address = "redis.internal" }
  }
}

mock_provider "random" {}

variables {
  environment         = "staging"
  api_domain          = "api.staging.example.in"
  erp_domain          = "erp.staging.example.in"
  acm_certificate_arn = "arn:aws:acm:ap-south-1:111111111111:certificate/abc"
}

run "staging_defaults" {
  command = plan

  assert {
    condition     = aws_db_instance.main.storage_encrypted && aws_db_instance.main.backup_retention_period >= 14 && !aws_db_instance.main.publicly_accessible
    error_message = "RDS must be encrypted, private, with >= 14 days of backups"
  }
  assert {
    condition     = length(aws_nat_gateway.main) == 1 && length(aws_subnet.private) == 2
    error_message = "staging uses one NAT gateway and two private subnets"
  }
  assert {
    condition     = !contains(keys(local.api_secrets), "MSG91_AUTH_KEY") && !contains(keys(local.api_secrets), "FCM_SERVICE_ACCOUNT") && !contains(keys(local.api_secrets), "SARVAM_API_KEY")
    error_message = "optional secrets are only injected when their provider is enabled"
  }
  assert {
    condition     = local.api_environment.S3_REGION == "ap-south-1" && local.api_environment.STORAGE_DRIVER == "s3" && !contains(keys(local.api_environment), "AI_BASE_URL")
    error_message = "objects in India via S3; no AI server unless configured"
  }
  assert {
    condition     = aws_lb_target_group.api.health_check[0].path == "/ready"
    error_message = "the API target group checks readiness"
  }
  assert {
    condition     = length(aws_iam_role.github_ecr) == 0
    error_message = "no GitHub role without github_repository"
  }
  assert {
    condition     = aws_ecs_service.code_runner.network_configuration[0].assign_public_ip == false && contains(keys(local.api_environment), "CODE_RUNNER_URL") && contains(keys(local.api_secrets), "CODE_RUNNER_TOKEN")
    error_message = "the code runner is private, found by the API, and keyed"
  }
}

run "prod_providers_and_github" {
  command = plan
  variables {
    environment          = "prod"
    sms_provider         = "msg91"
    payments_provider    = "razorpay"
    push_enabled         = true
    db_multi_az          = true
    redis_nodes          = 2
    ai_base_url          = "http://10.40.30.10:8000/v1"
    ai_fallback_provider = "sarvam"
    github_repository    = "example/Kinetix"
  }

  assert {
    condition     = contains(keys(local.api_secrets), "SARVAM_API_KEY") && local.api_environment.AI_FALLBACK_PROVIDER == "sarvam" && local.api_environment.ASR_FALLBACK_PROVIDER == "none"
    error_message = "the Sarvam key is injected from Secrets Manager when Sarvam is a fallback"
  }

  assert {
    condition     = alltrue([for k in ["MSG91_AUTH_KEY", "MSG91_TEMPLATE_ID", "MSG91_SENDER_ID", "SECRETS_ENCRYPTION_KEY", "FCM_SERVICE_ACCOUNT"] : contains(keys(local.api_secrets), k)])
    error_message = "provider secrets are injected in prod"
  }
  assert {
    condition     = !anytrue([for k in keys(local.api_secrets) : startswith(k, "RAZORPAY_")])
    error_message = "there are no platform Razorpay keys: each institution has its own account"
  }
  assert {
    condition     = aws_elasticache_replication_group.main.automatic_failover_enabled && aws_db_instance.main.multi_az
    error_message = "prod data stores fail over"
  }
  assert {
    condition     = local.api_environment.AI_BASE_URL == "http://10.40.30.10:8000/v1"
    error_message = "AI_BASE_URL is passed through as a plain variable"
  }
  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 1 && length(aws_iam_role.github_ecr) == 1
    error_message = "GitHub OIDC role created"
  }
}

run "rejects_short_backups" {
  command = plan
  variables {
    db_backup_retention_days = 7
  }
  expect_failures = [var.db_backup_retention_days]
}

run "rejects_region_outside_india" {
  command = plan
  variables {
    aws_region = "eu-west-1"
  }
  expect_failures = [var.aws_region]
}

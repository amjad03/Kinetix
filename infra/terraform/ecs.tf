# ECS Fargate: the API and ERP services behind the ALB, plus one-off task definitions that are
# run by hand (aws ecs run-task, see docs/operations/deploy.md): migrate, db-bootstrap
# (command override: content-import).
resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = var.container_insights ? "enabled" : "disabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE"]
  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

resource "aws_cloudwatch_log_group" "app" {
  for_each          = toset(["api", "erp", "jobs"])
  name              = "/kinetix/${var.environment}/${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.data.arn
}

locals {
  api_image = "${aws_ecr_repository.app["api"].repository_url}:${var.image_tag}"
  erp_image = "${aws_ecr_repository.app["erp"].repository_url}:${var.image_tag}"

  # RDS's CA bundle ships in the API image, so sslmode=verify-full can check the server.
  rds_ca_env = { NODE_EXTRA_CA_CERTS = "/app/certs/rds-${var.aws_region}-bundle.pem" }

  api_environment = merge(
    local.rds_ca_env,
    {
      NODE_ENV          = "production"
      PORT              = "4000"
      DEFAULT_TIMEZONE  = "Asia/Kolkata"
      LOG_FORMAT        = "json"
      TRUST_PROXY       = "1" # the ALB
      STORAGE_DRIVER    = "s3"
      S3_BUCKET         = aws_s3_bucket.objects.bucket
      S3_REGION         = var.aws_region
      SMS_PROVIDER      = var.sms_provider
      PAYMENTS_PROVIDER = var.payments_provider
      AI_MODEL          = var.ai_model
      ASR_MODEL         = var.asr_model
      # Institutions' Razorpay secrets are encrypted with SECRETS_ENCRYPTION_KEY (secrets.tf).
      SECRETS_ENCRYPTION_KEY_VERSION = tostring(var.secrets_encryption_key_version)
      # Local first, then the pay-per-use fallback (docs/operations/ai-hosting.md).
      AI_FALLBACK_PROVIDER  = var.ai_fallback_provider
      ASR_FALLBACK_PROVIDER = var.asr_fallback_provider
      ASR_MONTHLY_HOURS     = tostring(var.asr_monthly_hours)
      # C, C++ and Java for the code lab (code_runner.tf).
      CODE_RUNNER_URL            = local.code_runner_url
      CODE_RUN_TENANT_PER_MINUTE = tostring(var.code_run_tenant_per_minute)
    },
    var.ai_base_url != "" ? { AI_BASE_URL = var.ai_base_url } : {},
    var.asr_base_url != "" ? { ASR_BASE_URL = var.asr_base_url } : {},
    # PhET sims from our mirror in India (phet.tf); without it boards fetch from phet.colorado.edu.
    var.phet_mirror_enabled ? { PHET_MIRROR_URL = local.phet_mirror_url } : {},
    var.extra_api_environment,
  )

  log_config = {
    for k in ["api", "erp", "jobs"] : k => {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app[k].name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = k
      }
    }
  }

  api_env_list    = [for k, v in local.api_environment : { name = k, value = v }]
  api_secret_list = [for k, v in local.api_secrets : { name = k, valueFrom = v }]
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.api_task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name         = "api"
    image        = local.api_image
    essential    = true
    command      = ["serve"]
    portMappings = [{ containerPort = 4000, protocol = "tcp" }]
    environment  = local.api_env_list
    secrets      = local.api_secret_list
    # Graceful shutdown (jobs, sockets, pools) gets up to 60 s after SIGTERM.
    stopTimeout      = 60
    linuxParameters  = { initProcessEnabled = true }
    logConfiguration = local.log_config["api"]
    healthCheck = {
      command     = ["CMD", "node", "-e", "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
  }])
}

# One-off: apply migrations as kinetix_owner, then exit. Run before every API deploy.
resource "aws_ecs_task_definition" "migrate" {
  family                   = "${local.name}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.api_task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name             = "migrate"
    image            = local.api_image
    essential        = true
    command          = ["migrate"]
    environment      = [for k, v in local.rds_ca_env : { name = k, value = v }]
    secrets          = [{ name = "DATABASE_URL", valueFrom = local.api_secrets.DATABASE_URL }]
    logConfiguration = local.log_config["jobs"]
  }])
}

# One-off: create/update the kinetix_owner and kinetix_app roles and the kinetix database as the
# RDS master user (first deploy, and after rotating the database passwords). Override the
# command with ["content-import"] to load the global content library (needs DATABASE_URL only).
resource "aws_ecs_task_definition" "db_admin" {
  family                   = "${local.name}-db-admin"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.api_task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name        = "db-admin"
    image       = local.api_image
    essential   = true
    command     = ["db-bootstrap"]
    environment = [for k, v in local.rds_ca_env : { name = k, value = v }]
    secrets = [
      { name = "ADMIN_DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.db.arn}:ADMIN_DATABASE_URL::" },
      { name = "DATABASE_URL", valueFrom = local.api_secrets.DATABASE_URL },
      { name = "APP_DATABASE_URL", valueFrom = local.api_secrets.APP_DATABASE_URL },
    ]
    logConfiguration = local.log_config["jobs"]
  }])
}

resource "aws_ecs_task_definition" "erp" {
  family                   = "${local.name}-erp"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.erp_cpu
  memory                   = var.erp_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.erp_task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name         = "erp"
    image        = local.erp_image
    essential    = true
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]
    environment = [
      { name = "KINETIX_API_URL", value = "https://${var.api_domain}" },
      { name = "KINETIX_TIMEZONE", value = "Asia/Kolkata" },
    ]
    stopTimeout      = 30
    linuxParameters  = { initProcessEnabled = true }
    logConfiguration = local.log_config["erp"]
    healthCheck = {
      command     = ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
  }])
}

resource "aws_ecs_service" "api" {
  name                              = "api"
  cluster                           = aws_ecs_cluster.main.id
  task_definition                   = aws_ecs_task_definition.api.arn
  desired_count                     = var.api_desired_count
  launch_type                       = "FARGATE"
  enable_execute_command            = var.enable_ecs_exec
  health_check_grace_period_seconds = 60
  propagate_tags                    = "SERVICE"

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  # A task that never turns ready (e.g. migrations not applied) stops the rollout and rolls back.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 4000
  }

  lifecycle {
    ignore_changes = [desired_count] # autoscaling owns it after creation
  }
  depends_on = [aws_lb_listener.https]
}

resource "aws_ecs_service" "erp" {
  name                              = "erp"
  cluster                           = aws_ecs_cluster.main.id
  task_definition                   = aws_ecs_task_definition.erp.arn
  desired_count                     = var.erp_desired_count
  launch_type                       = "FARGATE"
  enable_execute_command            = var.enable_ecs_exec
  health_check_grace_period_seconds = 60
  propagate_tags                    = "SERVICE"

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.erp.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.erp.arn
    container_name   = "erp"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.https]
}

resource "aws_appautoscaling_target" "api" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.api_desired_count
  max_capacity       = max(var.api_max_count, var.api_desired_count)
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${local.name}-api-cpu"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  policy_type        = "TargetTrackingScaling"
  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

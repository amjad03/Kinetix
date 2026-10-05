# The code runner (services/code-runner): compiles and runs students' C, C++ and Java for the
# code lab, behind the API (POST /v1/code/run). It is its own ECS service so that untrusted
# programs never share a task, a network or credentials with the API:
# - in the data subnets, which have no route to the internet (no NAT); it reaches only the VPC
#   endpoints it needs to start (ECR, CloudWatch Logs, S3 for image layers)
# - its security group takes TCP 8080 from the API only, and sends only HTTPS to those endpoints
# - no task role (no AWS credentials inside), read-only root file system, non-root user, every
#   Linux capability dropped, /tmp an ephemeral volume; the runner limits each program itself
#   (CPU, wall time, memory, processes, files, output) and only answers the API's shared token
# Fargate applies its own default seccomp profile; custom profiles (infra/docker/
# code-runner-seccomp.json) apply where the runner is on Docker (docker-compose.yml).
# See docs/operations/code-runner.md.

locals {
  code_runner_image = "${aws_ecr_repository.app["code-runner"].repository_url}:${var.image_tag}"
  code_runner_url   = "http://code-runner.${local.name}.internal:8080"
}

resource "random_password" "code_runner" {
  length  = 48
  special = false
}

resource "aws_cloudwatch_log_group" "code_runner" {
  name              = "/kinetix/${var.environment}/code-runner"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.data.arn
}

resource "aws_security_group" "code_runner" {
  name        = "${local.name}-code-runner"
  description = "Code runner: from the API on 8080; out only to the VPC endpoints"
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "code_runner_from_api" {
  security_group_id            = aws_security_group.code_runner.id
  referenced_security_group_id = aws_security_group.api.id
  ip_protocol                  = "tcp"
  from_port                    = 8080
  to_port                      = 8080
}

resource "aws_vpc_security_group_egress_rule" "code_runner_endpoints" {
  security_group_id            = aws_security_group.code_runner.id
  description                  = "ECR and CloudWatch Logs interface endpoints (image pull, logs)"
  referenced_security_group_id = aws_security_group.endpoints.id
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
}

resource "aws_vpc_security_group_egress_rule" "code_runner_s3" {
  security_group_id = aws_security_group.code_runner.id
  description       = "S3 gateway endpoint (ECR image layers)"
  prefix_list_id    = aws_vpc_endpoint.s3.prefix_list_id
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

# Interface endpoints so tasks in the data subnets can start without a NAT gateway.
resource "aws_security_group" "endpoints" {
  name        = "${local.name}-endpoints"
  description = "VPC interface endpoints: HTTPS from inside the VPC"
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "endpoints_https" {
  security_group_id = aws_security_group.endpoints.id
  cidr_ipv4         = var.vpc_cidr
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_endpoint" "interface" {
  for_each            = toset(["ecr.api", "ecr.dkr", "logs"])
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.${each.key}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.data[*].id
  security_group_ids  = [aws_security_group.endpoints.id]
  private_dns_enabled = true
  tags                = { Name = "${local.name}-${replace(each.key, ".", "-")}" }
}

resource "aws_vpc_endpoint_route_table_association" "s3_data" {
  vpc_endpoint_id = aws_vpc_endpoint.s3.id
  route_table_id  = aws_route_table.data.id
}

resource "aws_vpc_security_group_egress_rule" "api_to_code_runner" {
  security_group_id            = aws_security_group.api.id
  description                  = "The code runner"
  referenced_security_group_id = aws_security_group.code_runner.id
  ip_protocol                  = "tcp"
  from_port                    = 8080
  to_port                      = 8080
}

resource "aws_service_discovery_private_dns_namespace" "internal" {
  name = "${local.name}.internal"
  vpc  = aws_vpc.main.id
}

resource "aws_service_discovery_service" "code_runner" {
  name = "code-runner"
  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.internal.id
    routing_policy = "MULTIVALUE"
    dns_records {
      ttl  = 10
      type = "A"
    }
  }
  health_check_custom_config {
    failure_threshold = 1
  }
}

resource "aws_ecs_task_definition" "code_runner" {
  family                   = "${local.name}-code-runner"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.code_runner_cpu
  memory                   = var.code_runner_memory
  execution_role_arn       = aws_iam_role.execution.arn
  # No task role: nothing inside the container holds AWS credentials.
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  volume {
    name = "tmp"
  }

  container_definitions = jsonencode([{
    name                   = "code-runner"
    image                  = local.code_runner_image
    essential              = true
    user                   = "10001:10001"
    readonlyRootFilesystem = true
    portMappings           = [{ containerPort = 8080, protocol = "tcp" }]
    mountPoints            = [{ sourceVolume = "tmp", containerPath = "/tmp", readOnly = false }]
    environment = [
      { name = "PORT", value = "8080" },
      { name = "CODE_RUNNER_SOCKET", value = "" },
      { name = "RUN_CONCURRENCY", value = tostring(var.code_runner_concurrency) },
    ]
    secrets = [{ name = "CODE_RUNNER_TOKEN", valueFrom = "${aws_secretsmanager_secret.app.arn}:CODE_RUNNER_TOKEN::" }]
    linuxParameters = {
      initProcessEnabled = true
      capabilities       = { drop = ["ALL"] }
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.code_runner.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "code-runner"
      }
    }
  }])
}

resource "aws_ecs_service" "code_runner" {
  name            = "code-runner"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.code_runner.arn
  desired_count   = var.code_runner_count
  launch_type     = "FARGATE"
  propagate_tags  = "SERVICE"

  network_configuration {
    subnets          = aws_subnet.data[*].id
    security_groups  = [aws_security_group.code_runner.id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.code_runner.arn
  }
}

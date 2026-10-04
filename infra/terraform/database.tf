# RDS PostgreSQL: encrypted, private, automated backups with point-in-time recovery.
# Roles: the master user only runs `kinetix-api db-bootstrap` (creates kinetix_owner and the
# RLS-bound kinetix_app, and the kinetix database). Migrations run as kinetix_owner; every
# request runs as kinetix_app. See docs/operations/deploy.md.
resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.data[*].id
}

resource "aws_db_parameter_group" "main" {
  name_prefix = "${local.name}-pg${var.db_engine_version}-"
  family      = "postgres${var.db_engine_version}"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "log_min_duration_statement"
    value = "1000" # log statements slower than 1 s (no parameters: log_parameter_max_length stays default)
  }
  parameter {
    name  = "log_connections"
    value = "1"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Passwords live in Secrets Manager (and in the encrypted Terraform state). URL-safe characters
# only, because they are embedded in connection URLs.
resource "random_password" "db_master" {
  length  = 32
  special = false
}

resource "random_password" "db_owner" {
  length  = 32
  special = false
}

resource "random_password" "db_app" {
  length  = 32
  special = false
}

resource "aws_db_instance" "main" {
  identifier     = local.name
  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.data.arn

  username = "kinetix_admin"
  password = random_password.db_master.result
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  parameter_group_name   = aws_db_parameter_group.main.name
  publicly_accessible    = false
  multi_az               = var.db_multi_az
  ca_cert_identifier     = "rds-ca-rsa2048-g1"

  # Automated backups = daily snapshot + transaction logs: restore to any second in the window.
  backup_retention_period  = var.db_backup_retention_days
  backup_window            = "20:30-21:30"         # UTC = 02:00-03:00 IST
  maintenance_window       = "sun:21:45-sun:22:45" # UTC = Mon 03:15-04:15 IST
  copy_tags_to_snapshot    = true
  delete_automated_backups = false

  auto_minor_version_upgrade  = true
  allow_major_version_upgrade = false
  apply_immediately           = false

  deletion_protection       = var.db_deletion_protection
  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.name}-final"

  enabled_cloudwatch_logs_exports       = ["postgresql"]
  performance_insights_enabled          = var.db_performance_insights
  performance_insights_kms_key_id       = var.db_performance_insights ? aws_kms_key.data.arn : null
  performance_insights_retention_period = var.db_performance_insights ? 7 : null

  lifecycle {
    ignore_changes = [final_snapshot_identifier]
  }
}

locals {
  db_host   = aws_db_instance.main.address
  db_ssl    = "sslmode=verify-full"
  db_name   = "kinetix"
  owner_url = "postgres://kinetix_owner:${random_password.db_owner.result}@${local.db_host}:5432/${local.db_name}?${local.db_ssl}"
  app_url   = "postgres://kinetix_app:${random_password.db_app.result}@${local.db_host}:5432/${local.db_name}?${local.db_ssl}"
  admin_url = "postgres://kinetix_admin:${random_password.db_master.result}@${local.db_host}:5432/postgres?${local.db_ssl}"
}

# ---------------------------------------------------------------------------------------------
# Redis (ElastiCache): shared rate limits, live-classroom state and the Socket.IO adapter.
# Ephemeral by design, so no backups. TLS in transit + AUTH token; REDIS_URL is rediss://.
# ---------------------------------------------------------------------------------------------
resource "aws_elasticache_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.data[*].id
}

resource "random_password" "redis_auth" {
  length  = 48
  special = false
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = local.name
  description          = "KINETIX ${var.environment} shared state"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  num_cache_clusters   = var.redis_nodes
  port                 = 6379

  automatic_failover_enabled = var.redis_nodes > 1
  multi_az_enabled           = var.redis_nodes > 1

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  kms_key_id                 = aws_kms_key.data.arn
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth.result

  snapshot_retention_limit = 0
  maintenance_window       = "sun:22:45-sun:23:45"
  apply_immediately        = false
}

locals {
  redis_url = "rediss://:${random_password.redis_auth.result}@${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"
}

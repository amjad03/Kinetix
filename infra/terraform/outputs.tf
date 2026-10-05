output "alb_dns_name" {
  description = "Point api_domain and erp_domain here (CNAME/alias) unless route53_zone_id is set."
  value       = aws_lb.main.dns_name
}

output "ecr_repositories" {
  value = { for k, r in aws_ecr_repository.app : k => r.repository_url }
}

output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}

output "task_definitions" {
  description = "Families for aws ecs run-task (migrate, db-admin) and the services."
  value = {
    api      = aws_ecs_task_definition.api.family
    erp      = aws_ecs_task_definition.erp.family
    migrate  = aws_ecs_task_definition.migrate.family
    db_admin = aws_ecs_task_definition.db_admin.family
  }
}

output "run_task_network" {
  description = "awsvpcConfiguration for one-off tasks (private subnets, API security group)."
  value = {
    subnets        = aws_subnet.private[*].id
    securityGroups = [aws_security_group.api.id]
    assignPublicIp = "DISABLED"
  }
}

output "objects_bucket" {
  value = aws_s3_bucket.objects.bucket
}

output "db_endpoint" {
  value = aws_db_instance.main.address
}

output "db_instance_id" {
  value = aws_db_instance.main.identifier
}

output "redis_endpoint" {
  value = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "secrets" {
  description = "Secrets Manager names. Fill in msg91, fcm and sarvam by hand (Razorpay keys are per institution, in the ERP)."
  value = merge(
    { db = aws_secretsmanager_secret.db.name, app = aws_secretsmanager_secret.app.name, redis = aws_secretsmanager_secret.redis.name },
    { for k, s in aws_secretsmanager_secret.manual : k => s.name },
  )
}

output "alarm_topic_arn" {
  value = aws_sns_topic.alarms.arn
}

output "github_ecr_role_arn" {
  description = "Set as the AWS_ECR_ROLE_ARN secret of the matching GitHub environment."
  value       = local.github_enabled ? aws_iam_role.github_ecr[0].arn : null
}

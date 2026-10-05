# Monitoring

Everything is in CloudWatch in ap-south-1. Alarms notify the SNS topic `kinetix-<env>-alarms`
(subscribe on-call emails with `alarm_emails` in the tfvars; each address must confirm). Add a
chat/pager integration (e.g. AWS Chatbot to Slack) to that topic when there is an on-call rota.

## Probes

| Endpoint | Meaning | Used by |
| --- | --- | --- |
| `GET /health` | **Liveness**: the process serves HTTP. Always `200 {"status":"ok"}` while it runs. | Container health check (ECS restarts the task after 3 failures); Docker `HEALTHCHECK` |
| `GET /ready` | **Readiness**: `200 {"status":"ready","checks":{…}}` when the database answers, every migration shipped with this build is applied and Redis answers; otherwise `503 {"status":"not_ready","checks":{database,migrations,redis}}` with `ok` / `failed` / `pending` / `not_configured`. | ALB target group health check (a task gets traffic only when ready) |
| ERP `GET /login` | The ERP server renders. | ERP container and target group health checks |

Neither probe needs authentication or reveals data. Check by hand:

```bash
curl -s https://<api_domain>/ready | jq
```

## Alarms (infra/terraform/monitoring.tf)

| Alarm | Fires when | First things to check |
| --- | --- | --- |
| `…-api-not-ready` | An API task fails `/ready` for 3 minutes | `/ready` body: `migrations: pending` → run the migrate task (deploy.md); `database: failed` → RDS status/events, connections, security groups; `redis: failed` → ElastiCache status (rate limits fall back to per-instance memory meanwhile) |
| `…-api-down` / `…-erp-down` | No healthy task behind the load balancer for 2 minutes | ECS service events (`aws ecs describe-services`), stopped-task reasons (image pull, secret not found, out of memory), the last deployment |
| `…-target-5xx` | > 10 server errors from the apps in 5 minutes | API logs around the time (`level = "error"`), recent deploy → rollback |
| `…-alb-5xx` | > 10 load-balancer errors in 5 minutes | Usually no healthy targets or timeouts: see the two above |
| `…-api-error-logs` | > 20 error log lines in 5 minutes | Logs Insights query below |
| `…-api-cpu` / `…-erp-cpu` | > 80 % CPU for 15 minutes | Autoscaling (API: 60 % target, up to `api_max_count`); raise task size or count |
| `…-api-memory` / `…-erp-memory` | > 85 % memory for 15 minutes | Leak after a deploy? Raise `*_memory` |
| `…-rds-free-storage` | Free storage < 20 % of the initial size | Storage autoscaling grows up to `db_max_allocated_storage`; raise it, or find the growth (large tables) |
| `…-rds-cpu` / `…-rds-freeable-memory` | Database CPU > 80 % for 15 min / memory < 128 MiB | Slow queries in the RDS log (> 1 s are logged), Performance Insights (prod); larger class |
| `…-redis-cpu` | Redis engine CPU > 80 % for 15 minutes | Live-classroom traffic; larger node |

All alarms also send an OK notification when they clear (except the error-log alarm).

## Logs

| Log group | Contents |
| --- | --- |
| `/kinetix/<env>/api` | API, one JSON object per line (`LOG_FORMAT=json`): `level`, `context`, `message`, `timestamp`, `pid` |
| `/kinetix/<env>/erp` | Next.js server |
| `/kinetix/<env>/jobs` | One-off tasks: migrate, db-bootstrap, content-import, seed |
| `/aws/rds/instance/kinetix-<env>/postgresql` | PostgreSQL log (slow statements > 1 s, connections, errors) |

Retention: 30 days staging, 90 days prod (`log_retention_days`); encrypted with the environment
key. Logs never contain sign-in codes (outside the console SMS sender, which prod does not use) and
phone numbers are masked. Do not add personal data to log messages.

Useful Logs Insights queries (log group `/kinetix/prod/api`):

```
fields @timestamp, context, message
| filter level = "error"
| sort @timestamp desc
| limit 100
```

```
fields @timestamp, message
| filter context like /Redis/ or message like /ready/
| sort @timestamp desc
```

ALB request logs are not enabled (cost); turn them on to an S3 bucket in ap-south-1 if per-request
investigation is needed.

## Dashboards

Start with the automatic ones: ECS (per service CPU/memory; Container Insights if enabled), RDS,
ElastiCache, Application ELB (requests, latency, 5xx per target group). A custom dashboard with
request count, p95 latency (`TargetResponseTime`), 5xx, healthy hosts, RDS CPU/connections/storage
and the error-log metric is worth adding once traffic is real.

## What is not monitored yet

- External uptime check from outside AWS (e.g. a CloudWatch Synthetics canary or a third-party
  pinger against `/ready` and the ERP login page) — recommended before go-live (small cost).
- SMS delivery (MSG91 dashboard), push delivery (Firebase console), Razorpay webhooks (each
  institution's own Razorpay dashboard, so ask the accounts office; 401s on
  `/v1/fees/webhooks/razorpay/<slug>` in the API logs mean the webhook secret there differs from
  the one saved in ERP → Settings): check those consoles weekly during the pilot.
- AI/ASR servers: hosted outside this stack; monitor them where they run.

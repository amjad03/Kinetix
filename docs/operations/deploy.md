# Deploying KINETIX

Production runs on AWS in **ap-south-1 (Mumbai)**: ECS Fargate (API + ERP) behind an HTTPS
load balancer, RDS PostgreSQL, ElastiCache Redis, S3 for recordings, Secrets Manager. Everything is
defined in [`infra/terraform`](../../infra/terraform) with one state per environment (`staging`,
`prod`). Images are built by [`.github/workflows/docker.yml`](../../.github/workflows/docker.yml).
Data and AI stay in India: the Terraform refuses any region other than `ap-south-1`/`ap-south-2`,
and `AI_BASE_URL`/`ASR_BASE_URL` must point at servers hosted in India.

Related: [backups-and-restore.md](backups-and-restore.md) · [monitoring.md](monitoring.md) ·
[security.md](security.md) · [mobile-release.md](mobile-release.md).

## What runs where

| Piece | Where | Notes |
| --- | --- | --- |
| API (`kinetix-api serve`) | ECS service `api`, private subnets, port 4000 | `https://<api_domain>`; ALB health check is `GET /ready` |
| ERP (Next.js standalone) | ECS service `erp`, port 3000 | `https://<erp_domain>`; calls the API at `https://<api_domain>` |
| Migrations | one-off task `kinetix-<env>-migrate` (`kinetix-api migrate`) | owner role `kinetix_owner`; run **before** each API rollout |
| DB roles / content library | one-off task `kinetix-<env>-db-admin` (`db-bootstrap`, or `content-import`) | RDS master user only here |
| PostgreSQL 16 | RDS, data subnets, encrypted, TLS required | requests run as `kinetix_app` (NOBYPASSRLS), so row-level security always applies |
| Redis 7 | ElastiCache, TLS + AUTH | shared rate limits, live-classroom state, Socket.IO adapter |
| Recordings | S3 `kinetix-<env>-objects-<account>` | KMS, versioned, public access blocked, lifecycle to IA/Glacier IR |

The image modes are documented in `services/api/docker-entrypoint.sh`:
`serve` (default), `migrate`, `seed` (demo data — **never in prod**), `content-import`, `db-bootstrap`.

## One-time setup (per AWS account)

1. **AWS account and access.** Use a dedicated account (or one for staging, one for prod) in an AWS
   Organization. People sign in through IAM Identity Center; no IAM users with long-lived keys.
2. **Terraform state bucket** (once, ap-south-1):
   ```bash
   ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
   BUCKET=kinetix-tfstate-$ACCOUNT
   aws s3api create-bucket --bucket $BUCKET --region ap-south-1 \
     --create-bucket-configuration LocationConstraint=ap-south-1
   aws s3api put-bucket-versioning --bucket $BUCKET --versioning-configuration Status=Enabled
   aws s3api put-bucket-encryption --bucket $BUCKET --server-side-encryption-configuration \
     '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms"},"BucketKeyEnabled":true}]}'
   aws s3api put-public-access-block --bucket $BUCKET --public-access-block-configuration \
     BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
   ```
   Put the bucket name in `infra/terraform/environments/<env>.backend.hcl`. The state contains the
   generated database/Redis passwords: only the deploy role may read this bucket.
3. **Domains and certificate.** Request one ACM certificate **in ap-south-1** for the API and ERP
   host names (e.g. `api.kinetix.in`, `erp.kinetix.in`, or a wildcard), validate it by DNS, and put its
   ARN, the host names and (optionally) the Route 53 zone id in `environments/<env>.tfvars`.
4. **Terraform** (≥ 1.10):
   ```bash
   cd infra/terraform
   terraform init -backend-config=environments/staging.backend.hcl
   terraform plan  -var-file=environments/staging.tfvars -out=staging.tfplan
   terraform apply staging.tfplan
   terraform output
   ```
   The services will not become healthy yet: there is no image and no database. That is expected.
5. **GitHub.** Set `github_repository = "<org>/<repo>"` in the tfvars (and, for the second
   environment in the same account, `github_oidc_provider_arn` from the first), apply, then create a
   GitHub environment named `staging` / `prod` with the secret `AWS_ECR_ROLE_ARN` = the
   `github_ecr_role_arn` output. Protect the `prod` environment with required reviewers.
6. **Images.** Push to `main` (or run *Docker images* by hand, choosing the environment). The
   workflow pushes `kinetix-<env>-api:<sha12>` and `:main` (same for `erp`). Without the secret it
   only builds.
7. **Provider secrets** (fill in before switching the providers on in tfvars):
   ```bash
   aws secretsmanager put-secret-value --secret-id kinetix/prod/msg91 --secret-string \
     '{"MSG91_AUTH_KEY":"…","MSG91_TEMPLATE_ID":"…","MSG91_SENDER_ID":"KINTIX"}'
   aws secretsmanager put-secret-value --secret-id kinetix/prod/razorpay --secret-string \
     '{"RAZORPAY_KEY_ID":"rzp_live_…","RAZORPAY_KEY_SECRET":"…","RAZORPAY_WEBHOOK_SECRET":"…"}'
   aws secretsmanager put-secret-value --secret-id kinetix/prod/fcm \
     --secret-string "$(jq -n --rawfile sa service-account.json '{FCM_SERVICE_ACCOUNT:$sa}')"
   ```
   The Razorpay webhook URL is `https://<api_domain>/v1/fees/webhooks/razorpay`.

## First deploy of an environment

Use the helper variables below in every command:

```bash
ENV=staging
CLUSTER=$(terraform output -raw ecs_cluster)
NET=$(terraform output -json run_task_network | jq -c '{awsvpcConfiguration: .}')
run_task() {  # run_task <family> [command-override-json]
  local overrides='{}'
  [ -n "${2:-}" ] && overrides=$(jq -nc --argjson c "$2" --arg n "$3" '{containerOverrides:[{name:$n,command:$c}]}')
  local arn=$(aws ecs run-task --cluster "$CLUSTER" --launch-type FARGATE --task-definition "$1" \
    --network-configuration "$NET" --overrides "$overrides" --query 'tasks[0].taskArn' --output text)
  aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$arn"
  aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$arn" --query 'tasks[0].containers[0].exitCode'
}
```

1. Set `image_tag` to the pushed SHA in the tfvars and `terraform apply` (task definitions point at it).
2. **Database roles and database** (as the RDS master user; idempotent):
   `run_task kinetix-$ENV-db-admin` → exit code `0`. Logs: `/kinetix/$ENV/jobs`
   (`Created role kinetix_owner … Database kinetix is ready`).
3. **Migrations**: `run_task kinetix-$ENV-migrate` → `Migrations applied.`
4. **Global content library** (idempotent):
   `run_task kinetix-$ENV-db-admin '["content-import"]' db-admin`
5. **Staging only — demo data**: `run_task kinetix-$ENV-api '["seed"]' api` with `ALLOW_DEMO_SEED=yes` set on the task (the seed refuses to run in production images otherwise) (the seed validates
   the full API environment, so it runs on the API task definition). Never on prod: it creates
   accounts with a known password.
6. Force the services to start on the new image:
   `aws ecs update-service --cluster $CLUSTER --service api --force-new-deployment` (and `erp`), then
   `aws ecs wait services-stable --cluster $CLUSTER --services api erp`.
7. Smoke test:
   ```bash
   curl -fsS https://<api_domain>/health      # {"status":"ok"}
   curl -fsS https://<api_domain>/ready       # database, migrations, redis all "ok"
   curl -fsS -o /dev/null -w '%{http_code}\n' https://<erp_domain>/login   # 200
   ```
   Then sign in to the ERP, open Today, and (staging) pair a board.

## Routine deploy (new version)

1. Merge to `main`; *CI* must be green; *Docker images* pushes `<sha12>`.
2. Read the diff of `services/api/migrations/` since the running version. Migrations must be
   backward compatible with the **running** API (expand first, contract in a later release), because
   the old tasks keep serving while the new ones start.
3. Set `image_tag = "<sha12>"` and register the new migrate task first, then run it:
   ```bash
   terraform apply -var-file=environments/$ENV.tfvars -target=aws_ecs_task_definition.migrate
   run_task kinetix-$ENV-migrate        # exit code 0, "Migrations applied."
   ```
4. `terraform plan` (only task definitions should change) and apply: the services roll. New API
   tasks join the load balancer only once `/ready` reports `migrations: ok`; if they never do, the
   deployment circuit breaker rolls back to the previous revision.
5. `aws ecs wait services-stable …`; check `/ready`, the alarms and the error-log metric for 15 min.

Deploy staging first; promote the same SHA to prod after a check on staging.

## Rollback

- **App only (no migration in the release):** set `image_tag` back to the previous SHA and apply, or
  `aws ecs update-service --service api --task-definition kinetix-$ENV-api:<previous revision>`.
  ECS's deployment circuit breaker already rolls back automatically when new tasks never turn
  healthy.
- **Release with migrations:** migrations are forward-only (no down migrations). Because they are
  expand-only, the previous image keeps working on the new schema: roll back the image as above. If a
  migration itself damaged data, restore with point-in-time recovery to just before the migration
  task started (see [backups-and-restore.md](backups-and-restore.md)) — a decision for the on-call
  lead, since writes after that moment are lost.
- **Infrastructure:** revert the Terraform change and apply. Never `terraform destroy` prod; RDS and
  the ALB have deletion protection.

## Onboarding a real institution

There is **no self-service onboarding or bulk import yet** (open work item). The demo seed
(`services/api/src/db/seed.ts`) is the reference for the order and shape of the data. Plan on a
supervised data load per institution:

1. **Collect** (spreadsheet, from the institution, under a signed data-processing agreement):
   institution name and short slug (used at sign-in), kind (school/college), campuses (name, city),
   academic year (label, start/end dates), terms, programs (name, level, curriculum, term count),
   sections (program, term, name), subjects, departments and their heads, staff (name, email, phone,
   roles: principal, hod, teacher, accountant, librarian…), students (name, section, roll no.,
   phone if they sign in), guardians (name, phone, relationship), rooms, bell schedule and the
   timetable (day, period, section, subject, teacher, room), fee heads if fees are used.
2. **Load**, in this order, as `kinetix_owner` (the same order as the seed): tenant → campuses →
   academic year → programs → sections → subjects → users + roles → departments + staff →
   students → rooms → timetable slots → guardians. Do it with a reviewed, idempotent load script
   (TypeScript in `services/api/src/db/`, modelled on `seed.ts`, reading the cleaned spreadsheet as
   CSV/JSON), shipped in the image and run as a one-off task on the API task definition with a
   command override, e.g. `run_task kinetix-$ENV-api '["node","dist/db/onboard.js","s3://…"]' api`.
   Keep the input in the objects bucket under `onboarding/<slug>/` (encrypted, in India) and delete
   it once the load is verified; never email spreadsheets of student data around.
   Run it on **staging first** against a copy of the same input, and have the institution check it there.
   Staff get **no default password**: they sign in with a phone code (OTP) or a set-password flow.
3. **Settings** in the ERP (principal): languages, live view and its indicator, classroom audio,
   consent texts, calendar (holidays), fee settings.
4. **Timetable**: after the bulk load, corrections are made in ERP → Timetable (one slot at a time,
   `POST/PATCH/DELETE /v1/admin/timetable/slots`).
5. **Boards**: for each classroom, ERP → Boards → *Add board* gives an enrolment code; enter it on
   the board with the server address `https://<api_domain>`.
6. **Apps**: teachers, parents and students install the apps (see
   [mobile-release.md](mobile-release.md)) and sign in with their phone number.
7. **Verify** with the principal: Today shows the day's periods, a teacher can start a class on a
   board, attendance and homework flow to the parent app.

Removing an institution (end of contract) is also a supervised operation: export what the contract
requires, delete the tenant's rows and objects under `tenants/<id>/` in S3, and record it.

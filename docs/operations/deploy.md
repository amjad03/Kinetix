# Deploying KINETIX

Production runs on AWS in **ap-south-1 (Mumbai)**: ECS Fargate (API + ERP) behind an HTTPS
load balancer, RDS PostgreSQL, ElastiCache Redis, S3 for recordings, Secrets Manager. Everything is
defined in [`infra/terraform`](../../infra/terraform) with one state per environment (`staging`,
`prod`). Images are built by [`.github/workflows/docker.yml`](../../.github/workflows/docker.yml).
Data and AI stay in India: the Terraform refuses any region other than `ap-south-1`/`ap-south-2`,
and `AI_BASE_URL`/`ASR_BASE_URL` must point at servers hosted in India (setups and the Sarvam
fallback: [ai-hosting.md](ai-hosting.md)).

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
`serve` (default), `migrate`, `seed` (demo data — **never in prod**), `content-import`, `create-institution` (a real institution and its first administrator; see [Onboarding](#onboarding-a-real-institution)), `db-bootstrap`.

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
   aws secretsmanager put-secret-value --secret-id kinetix/prod/fcm \
     --secret-string "$(jq -n --rawfile sa service-account.json '{FCM_SERVICE_ACCOUNT:$sa}')"
   ```
   There are **no platform Razorpay keys**: each institution receives fees in its own Razorpay
   account and enters its keys in the ERP (see [Onboarding](#onboarding-a-real-institution), step 4,
   and [fees-payments.md](../architecture/fees-payments.md)). With `payments_provider = "razorpay"`
   the API only needs `SECRETS_ENCRYPTION_KEY`, which Terraform generates into the `app` secret and
   which encrypts those keys in the database. Losing it makes every institution re-enter its keys;
   rotating it is in [security.md](security.md#secrets).

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
   `run_task kinetix-$ENV-db-admin '["content-import"]' db-admin` → `Imported … courses, … topics
   (… new, … changed, … removed)`. Re-run on every release that changes `services/api/content`
   (see its README); topic ids are kept, so classes' coverage and plans stay attached.
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

An institution is created once from the command line (owner role, because the app role may not
create tenants); everything else is loaded by its own administrator from the ERP's **Import** page,
from four CSV files. The demo seed is never used for a real institution.

1. **Collect** (under a signed data-processing agreement): the institution's name and a short slug
   (typed at sign-in), kind (school / college / university), time zone, main campus and city, the
   current academic year (label, first and last day), and the administrator's name, email and
   mobile number. The institution fills in the four templates in
   [`import-templates/`](import-templates/) (also downloadable from ERP → Import): programs and
   classes, staff, students and families, timetable. Each has comment lines explaining its columns
   and example rows. Spreadsheets are saved as **CSV UTF-8** (Hindi and Kannada names stay intact)
   and stay with the institution: they are uploaded by its administrator, never emailed to us.
2. **Create the institution** on **staging first**, then prod, as a one-off task on the API task
   definition with a command override (the task's `DATABASE_URL` is the owner role):
   ```bash
   run_task kinetix-$ENV-api '["create-institution","--slug","sjc-blr","--name","St. Joseph'"'"'s College",
     "--kind","college","--timezone","Asia/Kolkata","--campus","Main Campus","--city","Bengaluru",
     "--year-label","2026-27","--year-start","2026-06-01","--year-end","2027-03-31",
     "--admin-name","Admin Office","--admin-email","office@sjc.example.in","--admin-phone","98450 12345"]' api
   ```
   Locally: `pnpm --filter @kinetix/api db:create-institution -- --slug … ` (or
   `node dist/db/create-institution.js …`). It creates the tenant (default settings: live view off,
   indicator on, class audio off, PIN fallback off), the campus, the current academic year and the
   first `tenant_admin`, audited as `institution.created`. It **refuses a slug that already exists**
   (exit code 1, nothing changed) and bad arguments (exit code 2). The administrator's
   **temporary password is printed once** in the task log (`/kinetix/$ENV/jobs`); give it to them in
   person or by phone, never by email. At the first sign-in the ERP asks them to choose their own
   password before anything else (see [Passwords](../architecture/auth-otp.md#passwords)). With `--otp-only` (needs `--admin-phone`) there is no password
   and the administrator signs in with a code sent by SMS.
3. **Sign in as the administrator** (ERP, institution = the slug) and open **Import**. Each step:
   download the template, choose the filled-in file, **Check file** (a dry run: every row is
   checked, nothing is saved; errors are highlighted with the line number), fix the sheet until
   there are no errors, then **Import**. A file is imported completely or not at all (one
   transaction; any row with an error rolls everything back), and every import is audited
   (`import.programs`, …). Importing the same file again is safe: rows are matched by natural keys
   and reported as *new*, *updated* or *unchanged*. In order:
   1. **Programs and classes** — program, level (ug / pg / school), number of terms; each class
      (term + section → "BSc Sem 1 A", school "Grade 7 A") and subject (code, name, term), with the
      department that teaches it (created if missing). Matched by program name, term + section, and
      subject code.
   2. **Staff** — name, email, phone, roles (teacher, hod, principal, tenant_admin, accountant,
      librarian), language, departments. Matched by email, then phone; roles and departments are
      added, never removed. Staff get **no password**: they sign in with a phone code (OTP).
   3. **Students and families** — roll number (unique in the institution; a student can move class),
      name, class, an optional student login (email / phone), and up to two parents or guardians
      (name, phone, relation, language). Guardians are matched **by phone**, so brothers and sisters
      share one parent login, and a teacher who is also a parent keeps one account.
   4. **Timetable** — class, subject code, teacher (email or phone), day (Mon–Sun or 1–7), start, end,
      room (created if missing). Checked with the same rules as the timetable editor: a class,
      teacher or room booked twice is reported on its row. A period is matched by class, day and
      start time (a changed period is archived and replaced, like an edit in ERP → Timetable). With
      **Replace the timetable of each class in the file** (`?replace=true`) those classes get exactly
      the file's periods; the rest are archived, and unchanged periods keep their history.

   The same API is available for scripted loads: `POST /v1/admin/import/{programs|staff|students|timetable}`
   with the CSV as a `text/csv` body or a multipart `file` field (max 5,000 rows, 6 MB, UTF-8),
   `?dryRun=true` to check only; the response lists `{row, status, message, code, detail}` per row
   and the totals, with `committed` true only when it was saved. Principal or tenant_admin only.
4. **Set up the rest** in the ERP: **Departments** (heads of department; the import already created
   departments and placed subjects and staff in them), **Calendar** (holidays, exams), **Settings**
   (live view and its indicator, classroom audio, consent texts, grievance officer), fees if used,
   and **Syllabus** (link subjects to courses).
   **Online fee payments** go straight to the institution's **own Razorpay account** (we take no
   commission and never hold the money). The institution: (a) creates a Razorpay account in its own
   name and completes Razorpay's KYC (PAN, bank account, registration documents; a few days);
   (b) in the Razorpay dashboard, *Account & Settings → API keys*, generates live keys; (c) under
   *Webhooks*, adds the URL shown in ERP → Settings → *Online payments (Razorpay)*
   (`https://<api_domain>/v1/fees/webhooks/razorpay/<slug>`) with a secret of its choice and the
   events `payment.captured` and `order.paid`; (d) the principal or administrator enters the key id,
   key secret and webhook secret in that Settings section and presses **Test connection**. Until then
   families see "Please pay at the fees counter" (API code `PAYMENTS_NOT_CONFIGURED`) and the
   accounts office records cash, cheque, transfer and UPI as before. Test keys (`rzp_test_…`) work
   for a dry run on staging. Corrections to the timetable are made in ERP →
   Timetable one period at a time, or by importing again.
5. **Boards**: for each classroom, ERP → Boards → *Add board* gives an enrolment code; enter it on
   the board with the server address `https://<api_domain>`.
6. **Apps**: teachers, parents and students install the apps (see
   [mobile-release.md](mobile-release.md)) and sign in with their phone number.
7. **Verify** with the principal: Today shows the day's periods, a teacher can start a class on a
   board, attendance and homework flow to the parent app.

Removing an institution (end of contract) is also a supervised operation: export what the contract
requires, delete the tenant's rows and objects under `tenants/<id>/` in S3, and record it.

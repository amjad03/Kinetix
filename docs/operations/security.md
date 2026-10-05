# Security operations

How production is protected and the routine tasks that keep it so. Product-side privacy (consent,
what parents see) is in [docs/product/privacy-notice.md](../product/privacy-notice.md); tenancy and
row-level security in [docs/architecture/tenancy.md](../architecture/tenancy.md).

## Data residency (India)

- All infrastructure is in **ap-south-1 (Mumbai)**; Terraform rejects any region but
  `ap-south-1`/`ap-south-2`, and the API refuses `STORAGE_DRIVER=s3` outside `ap-south-*`.
- Database, Redis, recordings, logs, backups, secrets and images stay in that region. Optional
  second copies go to **ap-south-2 (Hyderabad)** only.
- **AI and speech-to-text** (`AI_BASE_URL`, `ASR_BASE_URL`) must be servers hosted in India and
  operated by us or a processor under contract (open decision: AWS Mumbai GPU instances vs. an Indian
  GPU cloud). Never point them at a model API that processes data outside India. Until decided they
  stay unset and AI features return labelled previews.
- Third parties that receive personal data, and what: **MSG91** (phone number + sign-in code; Indian
  provider, DLT-registered template), **Firebase Cloud Messaging** (device token + ids only — pushes
  carry no names, marks or messages), **Razorpay** (payer details for fee payments; Indian
  provider, PCI-DSS; each institution's own Razorpay account, so the institution is Razorpay's
  merchant and we only pass the order). List them in the privacy notice and the data-processing agreements.
- Build tooling (GitHub, Docker Hub base images) never sees production data.

## DPDP Act 2023 (summary of our obligations as data fiduciary / processor)

The institutions are data fiduciaries for their students' and staff data; KINETIX is their
processor (and fiduciary for its own accounts). In practice:

- **Contract**: a data-processing agreement with each institution: purpose, retention, security,
  breach notification, deletion at the end of the contract (deploy.md, *Removing an institution*).
- **Children** (under 18): verifiable parental consent for processing; no tracking or behavioural
  monitoring, no targeted advertising. The consent records in the product (`consents`) are the
  evidence; do not bypass them in data loads.
- **Purpose limitation and minimisation**: collect only what the institution's use needs
  (onboarding checklist in deploy.md); no production data in staging or on laptops.
- **Rights**: access, correction and erasure requests arrive through the institution; handle them
  within the agreed time and log them.
- **Breach**: notify the institution and the Data Protection Board without delay (see *Incidents*).
- **Retention**: delete when the purpose ends (recordings: `recordings_expire_after_days` per policy;
  backups age out after 14 days).

Have this reviewed by counsel before the pilot; the DPDP Rules' timelines and consent-manager
requirements are still being phased in.

## Encryption and TLS

- **In transit**: the ALB accepts HTTPS only (HTTP redirects), policy
  `ELBSecurityPolicy-TLS13-1-2-2021-06` (TLS 1.2/1.3). ALB → tasks is plain HTTP inside the private
  VPC. API → RDS uses TLS with certificate verification (`sslmode=verify-full`, RDS CA bundle baked
  into the image, `rds.force_ssl=1`). API → Redis uses TLS + AUTH token. S3 denies non-TLS requests.
- **Certificates**: ACM, DNS-validated, renew automatically. Check the `DaysToExpiry` metric if
  validation records are ever removed.
- **At rest**: one customer-managed KMS key per environment (rotated yearly) encrypts RDS, its
  backups and snapshots, S3 objects, Redis, Secrets Manager, CloudWatch Logs and ECR.
- Mobile apps keep tokens in the platform secure storage (Keychain / Android Keystore); the board
  keeps its device secret the same way.

## Secrets

| Secret (`kinetix/<env>/…`) | Contents | Source | Rotation |
| --- | --- | --- | --- |
| `db` | `DATABASE_URL` (owner), `APP_DATABASE_URL` (RLS-bound app), `ADMIN_DATABASE_URL` (RDS master) | Terraform `random_password` | yearly, or on suspicion |
| `app` | `JWT_SECRET`, `PAIRING_HMAC_SECRET`, `SECRETS_ENCRYPTION_KEY` (master key for institutions' Razorpay secrets in the database), `SECRETS_ENCRYPTION_OLD_KEYS` (empty except during a rotation) | Terraform | yearly, or on suspicion |
| `redis` | `REDIS_URL` with AUTH token | Terraform | yearly |
| `msg91` | auth key, template id, sender id | by hand | when MSG91 key is regenerated |
| `fcm` | Firebase service-account JSON | by hand | yearly (create new key, then delete the old one in Google Cloud) |

Never put secrets in tfvars, images, GitHub variables, tickets or chat. GitHub holds no AWS keys
(OIDC role limited to pushing two ECR repositories).

**Rotating a Terraform-generated secret** (maintenance window; signs everyone out for JWT):

```bash
# database role passwords
terraform apply -var-file=environments/prod.tfvars -replace=random_password.db_owner -replace=random_password.db_app
run_task kinetix-prod-db-admin          # sets the new passwords on the roles (idempotent)
aws ecs update-service --cluster kinetix-prod --service api --force-new-deployment
# RDS master: -replace=random_password.db_master (Terraform also updates the instance)
# JWT/pairing: -replace=random_password.jwt / random_password.pairing_hmac, then force a new deployment.
#   Changing JWT_SECRET signs every user out; changing PAIRING_HMAC_SECRET needs boards re-paired — check
#   docs/architecture/board-pairing.md before rotating it.
# Redis: -replace=random_password.redis_auth (ElastiCache applies the new AUTH token), then force a new deployment.
```

**Institutions' Razorpay keys** are not in Secrets Manager: each institution enters its own in ERP →
Settings → *Online payments*. The key secret and webhook secret are stored in
`payment_gateway_accounts` encrypted with AES-256-GCM under `SECRETS_ENCRYPTION_KEY` (bound to the
institution and field, versioned `v<n>.…`), are never returned by the API or written to the audit
log (`payments.razorpay_updated` records the key id, mode and which secrets changed), and only the
principal and tenant_admin can change them. An institution rotates its own keys by generating new
ones in Razorpay and saving them in the ERP.

**Rotating `SECRETS_ENCRYPTION_KEY`** (no downtime; payments keep working throughout):

```bash
OLD=$(aws secretsmanager get-secret-value --secret-id kinetix/prod/app --query SecretString --output text | jq -r .SECRETS_ENCRYPTION_KEY)
terraform apply -var-file=environments/prod.tfvars -replace=random_bytes.secrets_encryption \
  -var secrets_encryption_key_version=2 -var "secrets_encryption_old_keys=1:$OLD"
aws ecs update-service --cluster kinetix-prod --service api --force-new-deployment   # new key + old key
run_task kinetix-prod-api '["rotate-secrets"]' api   # "Secrets on key version 2: N of N institutions re-encrypted."
terraform apply -var-file=environments/prod.tfvars -var secrets_encryption_key_version=2   # drop the old key
aws ecs update-service --cluster kinetix-prod --service api --force-new-deployment
```

Keep `secrets_encryption_key_version` at the new value in the tfvars afterwards. Locally:
`pnpm --filter @kinetix/api secrets:rotate` with `SECRETS_ENCRYPTION_KEY_VERSION` and
`SECRETS_ENCRYPTION_OLD_KEYS` set.

Between the password change and the redeploy, running tasks keep their open connections; new
connections fail — rotate in a quiet hour.

## Production access

- People: AWS IAM Identity Center with MFA; two permission sets — *ReadOnly* (everyone on call) and
  *Admin* (two named people). Prod changes go through Terraform from reviewed commits.
- No SSH, no bastion, no public database. Break-glass shell into a task: set
  `enable_ecs_exec = true`, apply, `aws ecs execute-command … --interactive --command sh`, then turn
  it off again. Every session is in CloudTrail.
- Database access for investigations: a one-off task (deploy.md `run_task`) with a reviewed
  read-only query, as `kinetix_app` with the tenant set wherever possible, never ad-hoc writes.
- Enable **CloudTrail** (organization trail, S3 in ap-south-1), **GuardDuty** and **AWS Config** in
  the account (not in this Terraform; small monthly cost) and **IAM Access Analyzer**.
- Consider **AWS WAF** on the ALB (managed common rules + rate limiting) before opening to a large
  number of institutions (≈ USD 10–20/month at pilot traffic).

## Application controls (already in the product)

Row-level security on every tenant table with the app role `NOSUPERUSER NOBYPASSRLS`; per-account
and per-IP rate limits on sign-in, OTP, pairing and enrolment (shared through Redis; `TRUST_PROXY=1`
behind the ALB); argon2 password hashes; no personal data in pushes; masked phone numbers in logs.
Containers run as the non-root `node` user.

## Patching

- Base images: rebuild monthly (the Docker workflow on `main` pulls the current
  `node:22-bookworm-slim`), and on critical Node.js advisories. ECR scans on push — review findings.
- Dependencies: Dependabot/Renovate for npm, pub and GitHub Actions (to set up).
- RDS minor versions and ElastiCache patches apply automatically in the Monday 03:15–05:15 IST
  windows; major upgrades are planned changes (snapshot first).

## Incidents

1. Contain (scale down, revoke a key, block at the ALB/WAF), preserve logs.
2. Rotate affected secrets (above).
3. Assess whose data was affected, using the audit logs and the database.
4. Notify the affected institutions and, for a personal-data breach, the Data Protection Board as
   the DPDP Rules require; CERT-In within 6 hours for reportable cyber incidents.
5. Write up and fix the cause.

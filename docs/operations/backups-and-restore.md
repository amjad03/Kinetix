# Backups and restore

What is backed up, how to restore it, and how often we prove that restores work. All copies stay
in India (ap-south-1; a second copy, if added, goes to ap-south-2 Hyderabad — never outside India).

## Pilot targets

| | Target | How |
| --- | --- | --- |
| **RPO** (data we can lose) | **≤ 5 minutes** for the database; 0 for recordings already uploaded | RDS point-in-time recovery (transaction logs shipped every ~5 min); S3 versioning |
| **RTO** (time to be back) | **≤ 4 hours** for a full database restore; ≤ 1 hour for an app rollback | restore to a new instance + swap (below); ECS rollback (deploy.md) |
| Retention | 14 days of PITR (`db_backup_retention_days`, 14–35) | automated backups; take a manual snapshot before risky changes |

Confirm these with the pilot institutions; they go into the service agreement.

## What is protected

| Data | Protection | Notes |
| --- | --- | --- |
| PostgreSQL (all institution data) | RDS automated backups: daily snapshot (02:00–03:00 IST) + transaction logs → restore to any second in the last 14 days. Encrypted with the environment KMS key. Prod: Multi-AZ standby. | Manual snapshots (`aws rds create-db-snapshot`) are kept until deleted: take one before a major upgrade or a bulk data load. The final snapshot on deletion is on. |
| Recordings (S3) | Versioning: overwritten or deleted objects are kept as non-current versions for 30 days (`noncurrent_versions_expire_after_days`). | Recordings move to Standard-IA after 30 days and Glacier Instant Retrieval after 180 (still instant to read). Whether recordings expire is an institution policy (`recordings_expire_after_days`, default keep). |
| Redis | **Not backed up** by design. | Only rate-limit counters and live-classroom presence; rebuilt within seconds. |
| Secrets | Secrets Manager keeps previous versions; deleted secrets are recoverable for 7 days. | Terraform-generated ones can be recreated from state. |
| Infrastructure | Terraform state bucket is versioned. | Rebuild with `terraform apply`. |
| Images | ECR keeps the last 50 images per repository. | Rollback targets. |

Optional hardening (cost to confirm): AWS Backup copy of the daily RDS snapshot to **ap-south-2**
(regional disaster recovery while staying in India), and S3 replication of recordings to ap-south-2.

## Restore the database to a point in time

Used for: a bad migration, an accidental bulk delete, a corrupted import. Writes after the chosen
time are lost — the on-call lead decides, and tells the institutions.

1. **Pick the time** (UTC) just before the incident, e.g. from the migrate task's start time in
   `/kinetix/<env>/jobs` or from the audit trail. Check the window:
   `aws rds describe-db-instances --db-instance-identifier kinetix-prod --query 'DBInstances[0].LatestRestorableTime'`.
2. **Stop writes**: scale the API to 0 so nothing writes to the old instance in the meantime
   (`aws ecs update-service --cluster kinetix-prod --service api --desired-count 0`). The ERP shows
   its sign-in page with an error until the API is back. Announce the maintenance.
3. **Restore to a new instance** with the same network, parameter group and key:
   ```bash
   aws rds restore-db-instance-to-point-in-time \
     --source-db-instance-identifier kinetix-prod \
     --target-db-instance-identifier kinetix-prod-restore \
     --restore-time 2026-10-05T04:12:00Z \
     --db-subnet-group-name kinetix-prod \
     --vpc-security-group-ids <db security group id> \
     --db-parameter-group-name <parameter group name> \
     --multi-az --no-publicly-accessible --copy-tags-to-snapshot
   aws rds wait db-instance-available --db-instance-identifier kinetix-prod-restore
   ```
   (Ids: `terraform state show aws_db_instance.main`.) A pilot-sized database restores in roughly
   20–60 minutes.
4. **Swap names** so the endpoint (and therefore every secret) stays the same:
   ```bash
   aws rds modify-db-instance --db-instance-identifier kinetix-prod --new-db-instance-identifier kinetix-prod-old --apply-immediately
   aws rds wait db-instance-available --db-instance-identifier kinetix-prod-old
   aws rds modify-db-instance --db-instance-identifier kinetix-prod-restore --new-db-instance-identifier kinetix-prod --apply-immediately
   aws rds wait db-instance-available --db-instance-identifier kinetix-prod
   ```
5. **Run migrations** (the restored database may predate the latest ones):
   `run_task kinetix-prod-migrate` (deploy.md). Then scale the API back up and check `/ready`.
6. **Re-point Terraform** at the restored instance:
   ```bash
   terraform state rm aws_db_instance.main
   terraform import -var-file=environments/prod.tfvars aws_db_instance.main kinetix-prod
   terraform plan -var-file=environments/prod.tfvars   # expect no replacement of the database
   ```
7. Keep `kinetix-prod-old` (deletion protection on, stopped) for a week in case data must be copied
   across, then delete it with a final snapshot.

Restoring from a **snapshot** (e.g. the manual one before a bulk load) is the same with
`aws rds restore-db-instance-from-db-snapshot`.

## Restore recordings (S3)

A deleted or overwritten object still has its earlier version for 30 days:

```bash
B=$(terraform output -raw objects_bucket)
aws s3api list-object-versions --bucket $B --prefix tenants/<tenant>/recordings/<id>/
# undelete: remove the delete marker
aws s3api delete-object --bucket $B --key <key> --version-id <delete-marker-version-id>
# or restore an older version over the current one
aws s3api copy-object --bucket $B --key <key> --copy-source "$B/<key>?versionId=<version-id>"
```

Objects in Glacier Instant Retrieval read immediately; nothing needs thawing.

## Restore drill (quarterly, and before go-live)

Proves the backups work and measures the real RTO. Do it on **prod** backups, in prod's account,
without touching prod:

1. Restore prod to a point 1 hour ago as `kinetix-prod-drill` (step 3 above, without stopping the
   API, single-AZ to save cost).
2. Check it with a one-off task on the migrate task definition, pointing its `DATABASE_URL` at the
   drill endpoint (the restored instance has the same role passwords as prod):
   ```bash
   CHECK='DATABASE_URL=$(echo "$DATABASE_URL" | sed "s/@kinetix-prod\./@kinetix-prod-drill./") &&
     node dist/db/migrate.js &&
     node -e "const pg=require(\"pg\");const c=new pg.Client(process.env.DATABASE_URL);c.connect().then(async()=>{for(const t of [\"tenants\",\"users\",\"students\",\"attendance_records\",\"marks\"])console.log(t,(await c.query(\"select count(*) from \"+t)).rows[0].count);await c.end()})"'
   run_task kinetix-prod-migrate "$(jq -nc --arg c "$CHECK" '["sh","-c",$c]')" migrate
   ```
   Expect `Migrations applied.` (nothing new) and counts close to prod's an hour ago (read in
   `/kinetix/prod/jobs`).
3. Restore one recording version from S3 into a scratch prefix and play it.
4. Record: start time, time to available, time to verified, problems → in the ops log. Update
   this page if a step was wrong.
5. Delete the drill instance (`--skip-final-snapshot`) and the scratch objects.

Each drill instance costs a few hours of an RDS instance; nothing else.

# Multi-tenancy, isolation and data residency

## Tenant hierarchy

```
Tenant (an institution or group that pays: a school trust, college, university)
 └── Campus (a physical site; most tenants have one)
      └── Academic structure (programs/grades, sections, subjects), Devices, Users
```

A tenant is the security boundary. A campus is an organisational boundary inside it. A
university with affiliated colleges is modelled as one tenant per college; the shared
syllabus comes from the **global curriculum library**, which belongs to no tenant.

## Isolation tiers

| Tier | For | How |
|---|---|---|
| **Pooled** (default) | Most schools and colleges | Shared PostgreSQL schema. Every tenant-owned table has `tenant_id uuid not null` and **row-level security** enabled. |
| **Dedicated DB** | Large universities, contractual need | The same schema on a dedicated RDS instance. The tenant registry maps `tenant_id` to a connection string. |

The application code is the same in both tiers. A per-request resolver picks the connection.

## How RLS is enforced

Implemented in `services/api/migrations/0001_rls.sql` and `src/db/db.service.ts`.

1. The app connects as `kinetix_app`. That role is **not** the table owner and has no `BYPASSRLS`, so policies always apply to it. We don't need `FORCE ROW LEVEL SECURITY` because the app never connects as the owner.
2. Every tenant table has:
   ```sql
   alter table x enable row level security;
   create policy tenant_isolation on x
     using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
     with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
   ```
3. `DbService.withTenant(tenantId, fn)` opens a transaction and runs `select set_config('app.tenant_id', $1, true)` before anything else. The setting is local to the transaction, so a pooled connection never carries it into the next request.
4. If `app.tenant_id` is unset, the policy compares against `NULL` and **no rows match**. A bug therefore returns nothing rather than another school's data.
5. A few lookups happen before the tenant is known: the tenant by its slug at login, and the device by its enrolment code. They live in `SystemLookups`, use the owner connection, and return only the tenant identity.
6. **Foreign keys are checked without RLS.** Any client-supplied id (a student, a section) must therefore be looked up under RLS before it is written. `SyncService.studentInSession` shows the pattern.
7. Tests (`services/api/test/rls.e2e.spec.ts`) check four things:
   - every table with a `tenant_id` column has a policy, so a new table can't be forgotten;
   - tenant A can't read, update or insert tenant B's rows;
   - nothing is visible without a tenant context;
   - the app role can't change the `tenants` table or delete from the audit log.
8. Cross-tenant platform jobs (billing, analytics) will use a separate audited role. It is not built yet.

## Data residency (India)

- All primary data, backups, logs, recordings and AI inference stay in **ap-south-1
  (Mumbai)**, with disaster recovery in **ap-south-2 (Hyderabad)**. Service control
  policies deny resource creation in any other AWS region.
- No third-party SaaS processes personal data. Push notifications carry only IDs. Email
  and SMS go through Indian providers (to be chosen) with templates registered on DLT.
- AI models are self-hosted. No prompts or recordings go to model APIs abroad.

## DPDP Act 2023 obligations (design implications)

| Obligation | Implementation |
|---|---|
| Verifiable parental consent for children | Consent records per student/guardian. Features such as recording students' voices are gated on consent. |
| Purpose limitation & notice | Per-tenant privacy notice. Each data category is tagged with its purpose. |
| Data principal rights (access, correction, erasure) | Export and erase jobs per user, with audit |
| Retention | Per-tenant retention policy for recordings (default: academic year + 1) |
| Breach notification | Incident runbook, audit log, alerting |
| Security safeguards | Encryption at rest (KMS) and in transit (TLS 1.2+), least privilege, RLS, audit log |

> The legal interpretation needs a review by Indian counsel before launch. This table is the
> engineering view only.

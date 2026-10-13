// Adds the builder's three demo workflows (leave approval, fee concession, certificate request) to existing demo
// tenants without reseeding. Idempotent. Run after `pnpm build`: node --env-file=.env scripts/seed-builder-workflows.mjs [slug ...]
import pg from 'pg';
import { builderSeedRows } from '../dist/workflows/builder-seeds.js';

const slugs = process.argv.slice(2).length ? process.argv.slice(2) : ['soundarya', 'vidyaniketan'];
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
for (const slug of slugs) {
  const { rows } = await client.query(`select t.id, (select ur.user_id from user_roles ur where ur.tenant_id = t.id and ur.role = 'principal' limit 1) as principal from tenants t where t.slug = $1`, [slug]);
  if (!rows[0]) { console.log(`${slug}: not found`); continue; }
  const { id, principal } = rows[0];
  let added = 0;
  for (const d of builderSeedRows()) {
    const r = await client.query(
      `insert into workflow_definitions (tenant_id, request_type, name, description, module, fields, steps, notify_rules, graph, active, published_version, published_at, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, 1, now(), $10) on conflict (tenant_id, request_type) do nothing`,
      [id, d.requestType, d.name, d.description, d.module, JSON.stringify(d.fields), JSON.stringify(d.steps), JSON.stringify(d.notifyRules), JSON.stringify(d.graph), principal],
    );
    added += r.rowCount;
  }
  console.log(`${slug}: ${added} workflow(s) added`);
}
await client.end();

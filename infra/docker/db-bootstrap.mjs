// One-off database bootstrap for a managed Postgres (Amazon RDS), the production counterpart of
// services/api/scripts/setup-local-db.sh. Runs inside the API image: `kinetix-api db-bootstrap`.
//
//   ADMIN_DATABASE_URL  the RDS master user (from the RDS-managed secret), any database
//   DATABASE_URL        kinetix_owner: migrations and the narrowly scoped system lookups
//   APP_DATABASE_URL    kinetix_app: every request; NOSUPERUSER NOBYPASSRLS, so RLS always applies
//
// Creates both roles and the database (owned by kinetix_owner) when missing, and sets the roles'
// passwords from the URLs every time, so re-running it after rotating the secrets applies the new
// passwords. The role names are fixed: the migrations grant to kinetix_app by name.
import pg from 'pg';

const required = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};
const owner = new URL(required('DATABASE_URL'));
const app = new URL(required('APP_DATABASE_URL'));
const database = decodeURIComponent(owner.pathname.slice(1));
const roles = [
  { name: decodeURIComponent(owner.username), password: decodeURIComponent(owner.password), extra: 'NOSUPERUSER NOBYPASSRLS' },
  { name: decodeURIComponent(app.username), password: decodeURIComponent(app.password), extra: 'NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE' },
];
if (roles[0].name !== 'kinetix_owner' || roles[1].name !== 'kinetix_app') {
  throw new Error('DATABASE_URL must use kinetix_owner and APP_DATABASE_URL kinetix_app (the migrations grant by name)');
}
if (decodeURIComponent(app.pathname.slice(1)) !== database) throw new Error('DATABASE_URL and APP_DATABASE_URL must name the same database');
if (roles.some((r) => r.password.length < 16)) throw new Error('Role passwords must be at least 16 characters');

const admin = new pg.Client({ connectionString: required('ADMIN_DATABASE_URL') });
await admin.connect();
const ident = (s) => admin.escapeIdentifier(s);
const literal = (s) => admin.escapeLiteral(s);
try {
  for (const r of roles) {
    const exists = (await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [r.name])).rowCount;
    await admin.query(`${exists ? 'ALTER' : 'CREATE'} ROLE ${ident(r.name)} WITH LOGIN ${r.extra} PASSWORD ${literal(r.password)}`);
    console.log(`${exists ? 'Updated' : 'Created'} role ${r.name}.`);
  }
  // The master user must be able to act as the owner to create its database (PostgreSQL 16+).
  await admin.query(`GRANT ${ident(roles[0].name)} TO CURRENT_USER`);
  const db = (await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database])).rowCount;
  if (!db) {
    await admin.query(`CREATE DATABASE ${ident(database)} OWNER ${ident(roles[0].name)} ENCODING 'UTF8'`);
    console.log(`Created database ${database}.`);
  }
  await admin.query(`REVOKE ALL ON DATABASE ${ident(database)} FROM PUBLIC`);
  await admin.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${ident(database)} TO ${ident(roles[1].name)}`);
  console.log(`Database ${database} is ready. Next: kinetix-api migrate`);
} finally {
  await admin.end();
}

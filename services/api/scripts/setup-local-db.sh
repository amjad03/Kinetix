#!/usr/bin/env bash
# Creates the local database and the two roles. Run once (Linux: as a user that can sudo to postgres; Mac/Homebrew: as yourself).
set -euo pipefail
DB=${1:-zynetix}
# Linux packages run Postgres as the "postgres" user; Homebrew on a Mac runs it as you.
if id postgres >/dev/null 2>&1; then PSQL=(sudo -u postgres psql); CREATEDB=(sudo -u postgres createdb); else PSQL=(psql -d postgres); CREATEDB=(createdb); fi
"${PSQL[@]}" -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_owner') THEN
    CREATE ROLE zynetix_owner LOGIN PASSWORD 'zynetix_owner';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') THEN
    -- NOSUPERUSER NOBYPASSRLS: row-level security always applies to this role.
    CREATE ROLE zynetix_app LOGIN PASSWORD 'zynetix_app' NOSUPERUSER NOBYPASSRLS;
  END IF;
END \$\$;
SQL
for d in "$DB" "${DB}_test"; do
  "${PSQL[@]}" -tc "SELECT 1 FROM pg_database WHERE datname = '$d'" | grep -q 1 \
    || "${CREATEDB[@]}" -O zynetix_owner "$d"
done
echo "Databases $DB and ${DB}_test are ready."

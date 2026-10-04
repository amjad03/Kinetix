#!/usr/bin/env bash
# Creates the local database and the two roles. Run once, as a user that can sudo to postgres.
set -euo pipefail
DB=${1:-kinetix}
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_owner') THEN
    CREATE ROLE kinetix_owner LOGIN PASSWORD 'kinetix_owner';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    -- NOSUPERUSER NOBYPASSRLS: row-level security always applies to this role.
    CREATE ROLE kinetix_app LOGIN PASSWORD 'kinetix_app' NOSUPERUSER NOBYPASSRLS;
  END IF;
END \$\$;
SQL
for d in "$DB" "${DB}_test"; do
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '$d'" | grep -q 1 \
    || sudo -u postgres createdb -O kinetix_owner "$d"
done
echo "Databases $DB and ${DB}_test are ready."

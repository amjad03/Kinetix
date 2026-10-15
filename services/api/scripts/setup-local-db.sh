#!/usr/bin/env bash
# Creates the local database and the two roles. Run once, as a user that can sudo to postgres.
set -euo pipefail
DB=${1:-zynetix}
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
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
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '$d'" | grep -q 1 \
    || sudo -u postgres createdb -O zynetix_owner "$d"
done
echo "Databases $DB and ${DB}_test are ready."

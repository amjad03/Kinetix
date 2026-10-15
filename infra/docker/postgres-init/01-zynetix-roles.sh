#!/bin/sh
# First start of the compose Postgres: the same roles and database as
# services/api/scripts/setup-local-db.sh. The owner role runs migrations; the app role is
# NOSUPERUSER NOBYPASSRLS so row-level security always applies to normal requests.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v owner_pw="$ZYNETIX_OWNER_PASSWORD" -v app_pw="$ZYNETIX_APP_PASSWORD" -v db="${ZYNETIX_DB:-zynetix}" <<'SQL'
SELECT format('CREATE ROLE zynetix_owner LOGIN PASSWORD %L', :'owner_pw')
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_owner') \gexec
SELECT format('CREATE ROLE zynetix_app LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS', :'app_pw')
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'zynetix_app') \gexec
SELECT format('CREATE DATABASE %I OWNER zynetix_owner', :'db')
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db') \gexec
SQL
echo "zynetix roles and database ${ZYNETIX_DB:-zynetix} are ready."

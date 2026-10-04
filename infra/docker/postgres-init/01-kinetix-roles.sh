#!/bin/sh
# First start of the compose Postgres: the same roles and database as
# services/api/scripts/setup-local-db.sh. The owner role runs migrations; the app role is
# NOSUPERUSER NOBYPASSRLS so row-level security always applies to normal requests.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v owner_pw="$KINETIX_OWNER_PASSWORD" -v app_pw="$KINETIX_APP_PASSWORD" -v db="${KINETIX_DB:-kinetix}" <<'SQL'
SELECT format('CREATE ROLE kinetix_owner LOGIN PASSWORD %L', :'owner_pw')
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_owner') \gexec
SELECT format('CREATE ROLE kinetix_app LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS', :'app_pw')
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') \gexec
SELECT format('CREATE DATABASE %I OWNER kinetix_owner', :'db')
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db') \gexec
SQL
echo "kinetix roles and database ${KINETIX_DB:-kinetix} are ready."

#!/usr/bin/env bash
# CI only. The API's DB setup (services/api/scripts/setup-local-db.sh) and its test global setup
# talk to Postgres as `sudo -u postgres psql ...` over the local socket, like a developer machine.
# In CI Postgres is a service container on localhost:5432, so this installs psql/createdb
# wrappers in /usr/local/bin (ahead of /usr/bin on sudo's secure_path) that connect to it as
# the container's superuser. The scripts then run unchanged.
set -euo pipefail
: "${PGSERVICE_PASSWORD:=postgres}"
id postgres >/dev/null 2>&1 || sudo useradd --system --no-create-home postgres
[ -x /usr/bin/psql ] || { sudo apt-get update -qq && sudo apt-get install -y -qq postgresql-client; }
for tool in psql createdb dropdb; do
  real=/usr/bin/$tool
  sudo tee "/usr/local/bin/$tool" >/dev/null <<SH
#!/bin/sh
export PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD='${PGSERVICE_PASSWORD}'
exec $real "\$@"
SH
  sudo chmod 0755 "/usr/local/bin/$tool"
done
for _ in $(seq 1 30); do sudo -u postgres psql -tAc 'SELECT 1' >/dev/null 2>&1 && break; sleep 1; done
sudo -u postgres psql -tAc 'SELECT version()'

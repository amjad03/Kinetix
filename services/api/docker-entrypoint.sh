#!/bin/sh
# KINETIX Cloud API container entrypoint. One image, several modes:
#   serve           (default) the HTTP + socket.io server, as the app role (APP_DATABASE_URL)
#   migrate         apply SQL migrations as the owner role (DATABASE_URL), then exit
#   seed            load the demo institution (development / staging only), then exit
#   content-import  load the global content library (idempotent), then exit
#   create-institution --slug … --name … (see src/db/create-institution.ts)
#                   create a real institution and its first administrator, as the owner role
#                   (DATABASE_URL); prints the administrator's temporary password once, then exits
#   db-bootstrap    create/update the kinetix_owner and kinetix_app roles and the database, as the
#                   RDS master user (ADMIN_DATABASE_URL), then exit. Idempotent; re-run to rotate.
# Anything else is executed as given (e.g. `sh` for debugging).
set -eu

case "${1:-serve}" in
  serve)
    shift || true
    exec node --enable-source-maps dist/main.js "$@"
    ;;
  migrate)
    exec node --enable-source-maps dist/db/migrate.js
    ;;
  seed)
    exec node --enable-source-maps dist/db/seed.js
    ;;
  content-import)
    exec node --enable-source-maps dist/content/import.js
    ;;
  create-institution)
    shift
    exec node --enable-source-maps dist/db/create-institution.js "$@"
    ;;
  db-bootstrap)
    exec node db-bootstrap.mjs
    ;;
  *)
    exec "$@"
    ;;
esac

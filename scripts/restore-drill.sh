#!/usr/bin/env bash
# Backup and restore drill (docs/operations/backups-and-restore.md, "Restore drill"): proves a backup can be restored and is
# complete, for PostgreSQL and for the object storage, and prints a report to keep with the drill record.
#
# PostgreSQL: dumps SOURCE_URL (read-only; a restored RDS snapshot or PITR copy in production, never the live primary at peak),
# restores it into a scratch database through ADMIN_URL, then compares every table's row count and the newest applied
# migration. The scratch database is dropped at the end (KEEP=1 keeps it).
# Objects: STORAGE=dir:/path (local driver) archives and restores the folder and compares SHA-256 of every file;
# STORAGE=s3://bucket checks versioning is on and that SAMPLE random objects download with their recorded size.
#
#   SOURCE_URL=postgres://zynetix_owner:…@host:5432/zynetix ADMIN_URL=postgres://postgres@host:5432/postgres \
#   STORAGE=dir:services/api/.data/objects scripts/restore-drill.sh
set -euo pipefail

: "${SOURCE_URL:?SOURCE_URL (database to back up) is required}"
: "${ADMIN_URL:?ADMIN_URL (a role that may create databases) is required}"
DRILL_DB="${DRILL_DB:-zynetix_drill_$(date +%Y%m%d%H%M%S)}"
WORK="$(mktemp -d)"
SAMPLE="${SAMPLE:-25}"
FAIL=0
trap 'rm -rf "$WORK"' EXIT
log() { printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$*"; }
psqlq() { psql "$1" -X -v ON_ERROR_STOP=1 -Atq -c "$2"; }

# The scratch database's URL: ADMIN_URL with the drill database's name.
DRILL_URL="${ADMIN_URL%/*}/${DRILL_DB}"

log "PostgreSQL: dumping the source (custom format)"
t0=$(date +%s)
pg_dump --format=custom --no-owner --no-privileges --file="$WORK/db.dump" "$SOURCE_URL"
log "  dump $(du -h "$WORK/db.dump" | cut -f1) in $(( $(date +%s) - t0 ))s"

log "PostgreSQL: restoring into $DRILL_DB"
t0=$(date +%s)
psqlq "$ADMIN_URL" "create database \"$DRILL_DB\""
pg_restore --no-owner --no-privileges --exit-on-error --jobs="${JOBS:-4}" --dbname="$DRILL_URL" "$WORK/db.dump"
RESTORE_S=$(( $(date +%s) - t0 ))
log "  restored in ${RESTORE_S}s"

COUNT_SQL="select string_agg(format('select %L as t, count(*) as n from %I.%I', table_schema||'.'||table_name, table_schema, table_name), ' union all ' order by table_schema, table_name) from information_schema.tables where table_type = 'BASE TABLE' and table_schema in ('public', 'drizzle')"
counts() { psql "$1" -X -Atq -F' ' -c "$(psqlq "$1" "$COUNT_SQL")" | sort; }
counts "$SOURCE_URL" > "$WORK/source.txt"
counts "$DRILL_URL" > "$WORK/restored.txt"
TABLES=$(wc -l < "$WORK/source.txt")
ROWS=$(awk '{s += $2} END {print s + 0}' "$WORK/source.txt")
if diff -u "$WORK/source.txt" "$WORK/restored.txt" > "$WORK/diff.txt"; then
  log "  OK: $TABLES tables, $ROWS rows, every count matches"
else
  log "  FAIL: row counts differ:"; sed -n '1,40p' "$WORK/diff.txt"; FAIL=1
fi
SRC_MIG=$(psqlq "$SOURCE_URL" "select coalesce(max(created_at), 0) from drizzle.__drizzle_migrations")
DST_MIG=$(psqlq "$DRILL_URL" "select coalesce(max(created_at), 0) from drizzle.__drizzle_migrations")
[ "$SRC_MIG" = "$DST_MIG" ] && log "  OK: newest migration $SRC_MIG present" || { log "  FAIL: migrations $SRC_MIG vs $DST_MIG"; FAIL=1; }
# Row-level security must survive the restore (policies are part of the schema).
POLICIES=$(psqlq "$DRILL_URL" "select count(*) from pg_policies where policyname = 'tenant_isolation'")
SRC_POLICIES=$(psqlq "$SOURCE_URL" "select count(*) from pg_policies where policyname = 'tenant_isolation'")
[ "$POLICIES" = "$SRC_POLICIES" ] && log "  OK: $POLICIES tenant isolation policies restored" || { log "  FAIL: $POLICIES of $SRC_POLICIES tenant isolation policies"; FAIL=1; }

if [ "${KEEP:-0}" != "1" ]; then psqlq "$ADMIN_URL" "drop database \"$DRILL_DB\" with (force)"; log "  dropped $DRILL_DB"; fi

case "${STORAGE:-}" in
  dir:*)
    DIR="${STORAGE#dir:}"
    log "Objects: archiving $DIR"
    (cd "$DIR" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum) > "$WORK/objects.sha"
    tar -C "$DIR" -czf "$WORK/objects.tgz" .
    mkdir "$WORK/restore"
    tar -C "$WORK/restore" -xzf "$WORK/objects.tgz"
    if (cd "$WORK/restore" && sha256sum --quiet -c "$WORK/objects.sha"); then log "  OK: $(wc -l < "$WORK/objects.sha") files restored, every checksum matches"; else log "  FAIL: checksums differ"; FAIL=1; fi
    ;;
  s3://*)
    BUCKET="${STORAGE#s3://}"; BUCKET="${BUCKET%%/*}"
    log "Objects: s3://$BUCKET"
    V=$(aws s3api get-bucket-versioning --bucket "$BUCKET" --query Status --output text)
    [ "$V" = "Enabled" ] && log "  OK: versioning enabled (deleted or overwritten objects can be restored)" || { log "  FAIL: versioning is $V"; FAIL=1; }
    aws s3api list-objects-v2 --bucket "$BUCKET" --max-items 2000 --query 'Contents[].[Key,Size]' --output text | shuf -n "$SAMPLE" > "$WORK/sample.txt" || true
    OK=0; N=0
    while IFS=$'\t' read -r key size; do
      [ -z "$key" ] && continue; N=$((N + 1))
      aws s3 cp --quiet "s3://$BUCKET/$key" "$WORK/obj" && [ "$(stat -c %s "$WORK/obj")" = "$size" ] && OK=$((OK + 1))
    done < "$WORK/sample.txt"
    [ "$OK" = "$N" ] && log "  OK: $OK of $N sampled objects downloaded intact" || { log "  FAIL: $OK of $N sampled objects intact"; FAIL=1; }
    ;;
  "") log "Objects: skipped (set STORAGE=dir:/path or s3://bucket)" ;;
esac

[ "$FAIL" = 0 ] && log "DRILL PASSED (database restore ${RESTORE_S}s)" || log "DRILL FAILED"
exit "$FAIL"

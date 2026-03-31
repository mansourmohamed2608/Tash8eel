#!/bin/sh
set -eu

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=${BACKUP_DIR:-/backups}
RETAIN_DAYS=${BACKUP_RETENTION_DAYS:-7}

if [ -z "$DB_HOST" ] || [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
  if [ -n "$DATABASE_URL" ]; then
    DB_HOST=${DB_HOST:-$(echo "$DATABASE_URL" | sed -n 's#.*://[^@]*@\([^:/?]*\).*#\1#p')}
    DB_PORT=${DB_PORT:-$(echo "$DATABASE_URL" | sed -n 's#.*:\([0-9][0-9]*\)/.*#\1#p')}
    DB_USER=${DB_USER:-$(echo "$DATABASE_URL" | sed -n 's#.*://\([^:/@]*\).*#\1#p')}
    DB_NAME=${DB_NAME:-$(echo "$DATABASE_URL" | sed -n 's#.*/\([^?]*\)\(\?.*\)\?$#\1#p')}
  fi
fi

FILENAME="$BACKUP_DIR/backup_$TIMESTAMP.sql.gz"

echo "Starting backup at $TIMESTAMP"
if [ -z "$DB_HOST" ] || [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
  echo "ERROR: DB_HOST, DB_USER, DB_NAME must be set"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

if ! pg_dump \
  -h "$DB_HOST" \
  -p "${DB_PORT:-5432}" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-password \
  --format=plain | gzip -9 > "$FILENAME"; then
  echo "ERROR: Backup dump failed"
  exit 1
fi

echo "Backup written to $FILENAME"

# Best effort: do not fail backup if audit log table/schema is missing.
psql \
  -h "$DB_HOST" \
  -p "${DB_PORT:-5432}" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-password \
  -v backup_file="$FILENAME" \
  -v backup_timestamp="$TIMESTAMP" \
  -c "INSERT INTO system_health_log (event_type, metadata) VALUES ('backup_completed', jsonb_build_object('file', :'backup_file', 'timestamp', :'backup_timestamp'));" >/dev/null 2>&1 || \
  echo "WARN: Could not write backup audit log row; continuing"

find "$BACKUP_DIR" -name "backup_*.sql.gz" \
  -mtime +$RETAIN_DAYS -delete

echo "Cleaned up backups older than $RETAIN_DAYS days"
echo "Backup completed at $(date +%Y%m%d_%H%M%S)"

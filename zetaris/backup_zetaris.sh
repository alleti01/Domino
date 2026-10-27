#!/bin/sh
# Back up the working Zetaris setup into ~/zetaris-backups/<timestamp>/.
#
#   sh zetaris/backup_zetaris.sh              config + USL model (Zetaris keeps running)
#   sh zetaris/backup_zetaris.sh --volumes    also the Docker volumes: STOPS Zetaris for a minute or two,
#                                             copies each volume, then starts it again and runs verify.sh
#
# Never runs `docker compose down -v`. The repo itself (scripts, SQL, sources) is backed up by git;
# `python3 zetaris/setup.py` rebuilds Domino's objects on a fresh install.
# Restore volumes: with Zetaris stopped, untar each <volume>.tgz back into its volume, then start it.

set -eu
PLATFORM="$HOME/zetaris-platform"
STAMP=$(date +%Y-%m-%d_%H%M)
OUT="$HOME/zetaris-backups/$STAMP"
REPO=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$OUT" && chmod 700 "$HOME/zetaris-backups" "$OUT"

cp -p "$PLATFORM/.env" "$OUT/platform.env" && chmod 600 "$OUT/platform.env"
cp -p "$PLATFORM/docker-compose.yml" "$OUT/"
echo "saved platform config to $OUT"

if (cd "$REPO" && python3 -m data_layer admin-sql "LOAD USL systems NAMESPACE lightning.metastore.domino") > "$OUT/usl_model.json" 2>/dev/null; then
  echo "saved the USL model (LOAD USL) to $OUT/usl_model.json"
else
  echo "note: could not save the USL model (is Zetaris running?)"; rm -f "$OUT/usl_model.json"
fi

if [ "${1:-}" = "--volumes" ]; then
  echo "stopping Zetaris to copy its volumes (not removing anything)..."
  (cd "$PLATFORM" && docker compose stop)
  for v in $(docker volume ls --format '{{.Name}}' | grep '^zetaris_'); do
    docker run --rm -v "$v":/v:ro -v "$OUT":/b alpine:3.20 tar czf "/b/$v.tgz" -C /v .
    echo "  copied volume $v ($(du -h "$OUT/$v.tgz" | cut -f1))"
  done
  echo "starting Zetaris again..."
  (cd "$PLATFORM" && docker compose up -d && ./verify.sh)
fi
echo "backup complete: $OUT"

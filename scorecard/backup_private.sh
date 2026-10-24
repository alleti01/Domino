#!/bin/sh
# Encrypted backup of the private folder (answers + held-out worlds) to iCloud Drive.
#
#   sh scorecard/backup_private.sh
#
# Makes one dated AES-256 encrypted disk image, e.g. domino-private-2026-10-24_1315.dmg, in
# iCloud Drive/Domino-backups. macOS asks you for the password (twice); it is never stored or printed.
# Nothing is deleted: older backups stay until you remove them yourself.
# To restore on a Mac: double-click the .dmg, enter the password, copy the folder back to ~/domino-private.

set -eu

SRC="$HOME/domino-private"
DEST="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Domino-backups"
STAMP=$(date +%Y-%m-%d_%H%M)
OUT="$DEST/domino-private-$STAMP.dmg"

[ -d "$SRC" ] || { echo "No private folder at $SRC"; exit 1; }
[ -d "$HOME/Library/Mobile Documents/com~apple~CloudDocs" ] || { echo "iCloud Drive is not set up on this Mac"; exit 1; }
mkdir -p "$DEST"
[ -e "$OUT" ] && { echo "$OUT already exists; wait a minute and run again"; exit 1; }

echo "Backing up $SRC"
echo "Choose a password for the backup. You'll type it twice; it won't be shown."
if ! hdiutil create -encryption AES-256 -srcfolder "$SRC" -volname domino-private -format UDZO "$OUT"; then
  echo "Backup FAILED (most often: the two passwords did not match). Nothing was saved; run it again."
  rm -f "$OUT"
  exit 1
fi

# Refuse to call it done unless the image really is encrypted.
if hdiutil isencrypted "$OUT" | grep -q "encrypted: YES"; then
  echo "Saved encrypted backup: $OUT ($(du -h "$OUT" | cut -f1))"
  echo "It will sync to iCloud Drive > Domino-backups on your other devices."
else
  echo "WARNING: $OUT is not encrypted. Deleting it so no unencrypted copy syncs."
  rm -f "$OUT"
  exit 1
fi

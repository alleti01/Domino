#!/bin/sh
# Blocks a push if any commit being pushed carries an answer file or a held-out world ID,
# then runs the full leakage check when the branch has it. Works on every branch (main has no scorecard).
# Install (once per clone):  cp scorecard/pre_push_hook.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push

ROOT=$(git rev-parse --show-toplevel) || exit 1
cd "$ROOT" || exit 1
ZERO=0000000000000000000000000000000000000000
PRIVATE="${DOMINO_PRIVATE_DIR:-$HOME/domino-private}"
PRIVATE_IDS=$(ls "$PRIVATE/worlds/cases" 2>/dev/null | sed -n 's/\.json$//p' | paste -sd '|' -)
fail=0

while read -r local_ref local_sha remote_ref remote_sha; do
  [ "$local_sha" = "$ZERO" ] && continue
  if [ "$remote_sha" = "$ZERO" ]; then range="$local_sha --not --remotes"; else range="$remote_sha..$local_sha"; fi
  answers=$(git log --format= --name-only $range -- 'ground_truth/' | grep -v '^ground_truth/README.md$' | sort -u)
  if [ -n "$answers" ]; then
    echo "pre-push: BLOCKED. Commits for $remote_ref contain answer files:"; echo "$answers" | sed 's/^/  /'; fail=1
  fi
  if [ -n "$PRIVATE_IDS" ] && git log -p $range | grep -Eq "$PRIVATE_IDS"; then
    echo "pre-push: BLOCKED. Commits for $remote_ref mention a held-out world ID."; fail=1
  fi
done

[ $fail -ne 0 ] && exit 1
if [ -f scorecard/leakage_check.py ]; then
  python3 scorecard/leakage_check.py || { echo "pre-push: BLOCKED by scorecard/leakage_check.py"; exit 1; }
else
  echo "pre-push: no leakage check on this branch; history checks passed."
fi
exit 0

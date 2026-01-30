#!/bin/bash
# =============================================================================
# teardown-launchd.sh
# Unloads and removes all glimmer launchd agents.
# =============================================================================

set -e

PLIST_DIR="$HOME/Library/LaunchAgents"
UID_NUM=$(id -u)

echo "Unloading glimmer launchd agents..."

AGENTS=(
  "com.glimmer.daily-compound-review"
  "com.glimmer.auto-compound"
  "com.glimmer.caffeinate"
)

for AGENT in "${AGENTS[@]}"; do
  PLIST="$PLIST_DIR/$AGENT.plist"
  if [ -f "$PLIST" ]; then
    launchctl bootout "gui/$UID_NUM/$AGENT" 2>/dev/null || true
    rm "$PLIST"
    echo "  Removed: $AGENT"
  else
    echo "  Not found: $AGENT (skipped)"
  fi
done

echo ""
echo "Verifying..."
if launchctl list 2>/dev/null | grep -q glimmer; then
  echo "Warning: some agents may still be loaded:"
  launchctl list | grep glimmer
else
  echo "All glimmer agents removed."
fi

echo ""
echo "Teardown complete."

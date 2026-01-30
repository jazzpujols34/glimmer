#!/bin/bash
# =============================================================================
# setup-launchd.sh
# Installs launchd agents for the nightly compound system.
# Run this ONCE to set up scheduled jobs.
# =============================================================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_DIR="$HOME/Library/LaunchAgents"
USER_NAME=$(whoami)

mkdir -p "$PLIST_DIR"
mkdir -p "$PROJECT_DIR/logs"

echo "Setting up launchd agents for: $PROJECT_DIR"
echo "User: $USER_NAME"
echo ""

# --- 1. Compound Review (10:30 PM) ---
REVIEW_PLIST="$PLIST_DIR/com.glimmer.daily-compound-review.plist"
cat > "$REVIEW_PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.glimmer.daily-compound-review</string>

  <key>ProgramArguments</key>
  <array>
    <string>${PROJECT_DIR}/scripts/daily-compound-review.sh</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${PROJECT_DIR}</string>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>22</integer>
    <key>Minute</key>
    <integer>30</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>${PROJECT_DIR}/logs/compound-review.log</string>

  <key>StandardErrorPath</key>
  <string>${PROJECT_DIR}/logs/compound-review.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>/Users/${USER_NAME}</string>
  </dict>
</dict>
</plist>
EOF
echo "Created: $REVIEW_PLIST"

# --- 2. Auto-Compound (11:00 PM) ---
AUTO_PLIST="$PLIST_DIR/com.glimmer.auto-compound.plist"
cat > "$AUTO_PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.glimmer.auto-compound</string>

  <key>ProgramArguments</key>
  <array>
    <string>${PROJECT_DIR}/scripts/compound/auto-compound.sh</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${PROJECT_DIR}</string>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>23</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>${PROJECT_DIR}/logs/auto-compound.log</string>

  <key>StandardErrorPath</key>
  <string>${PROJECT_DIR}/logs/auto-compound.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>/Users/${USER_NAME}</string>
  </dict>
</dict>
</plist>
EOF
echo "Created: $AUTO_PLIST"

# --- 3. Caffeinate (5 PM - 2 AM) ---
CAFE_PLIST="$PLIST_DIR/com.glimmer.caffeinate.plist"
cat > "$CAFE_PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.glimmer.caffeinate</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string>
    <string>-i</string>
    <string>-t</string>
    <string>32400</string>
  </array>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>17</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
</dict>
</plist>
EOF
echo "Created: $CAFE_PLIST"

# --- Load all agents ---
echo ""
echo "Loading agents..."

launchctl load "$REVIEW_PLIST" 2>/dev/null || launchctl bootout "gui/$(id -u)/com.glimmer.daily-compound-review" 2>/dev/null && launchctl load "$REVIEW_PLIST"
launchctl load "$AUTO_PLIST" 2>/dev/null || launchctl bootout "gui/$(id -u)/com.glimmer.auto-compound" 2>/dev/null && launchctl load "$AUTO_PLIST"
launchctl load "$CAFE_PLIST" 2>/dev/null || launchctl bootout "gui/$(id -u)/com.glimmer.caffeinate" 2>/dev/null && launchctl load "$CAFE_PLIST"

echo ""
echo "Verifying..."
launchctl list | grep glimmer || echo "Warning: agents may not be loaded yet"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Schedule:"
echo "  5:00 PM  - caffeinate starts (keeps Mac awake until 2 AM)"
echo "  10:30 PM - Compound Review (updates CLAUDE.md with learnings)"
echo "  11:00 PM - Auto-Compound (picks #1 priority, implements, creates PR)"
echo ""
echo "Logs:"
echo "  $PROJECT_DIR/logs/compound-review.log"
echo "  $PROJECT_DIR/logs/auto-compound.log"
echo ""
echo "Commands:"
echo "  Test review:   launchctl start com.glimmer.daily-compound-review"
echo "  Test compound: launchctl start com.glimmer.auto-compound"
echo "  Unload all:    ./scripts/teardown-launchd.sh"

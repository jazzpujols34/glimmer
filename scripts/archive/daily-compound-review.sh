#!/bin/bash
# =============================================================================
# daily-compound-review.sh
# Runs nightly at 10:30 PM via launchd
#
# Reviews all git activity from the last 24 hours, extracts learnings,
# and updates CLAUDE.md so the agent compounds knowledge every day.
# =============================================================================

set -e

# Resolve project directory (works from launchd and manual invocation)
if [ -n "$GLIMMER_PROJECT_DIR" ]; then
  PROJECT_DIR="$GLIMMER_PROJECT_DIR"
else
  PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
fi
cd "$PROJECT_DIR"

LOG_FILE="$PROJECT_DIR/logs/compound-review.log"
mkdir -p "$PROJECT_DIR/logs"

exec >> "$LOG_FILE" 2>&1
echo ""
echo "=========================================="
echo "Compound Review: $(date)"
echo "=========================================="

# Ensure we're on main and up to date
git checkout main
git pull origin main

# Gather context: commits, diffs, and changed files from last 24 hours
SINCE=$(date -v-24H +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -d '24 hours ago' +%Y-%m-%dT%H:%M:%S)

echo "Reviewing changes since: $SINCE"

RECENT_COMMITS=$(git log --since="$SINCE" --oneline --no-merges 2>/dev/null || echo "No recent commits")
RECENT_DIFF_STAT=$(git log --since="$SINCE" --stat --no-merges 2>/dev/null || echo "No changes")
CHANGED_FILES=$(git log --since="$SINCE" --name-only --no-merges --pretty=format: 2>/dev/null | sort -u | grep -v '^$' || echo "None")

if [ "$RECENT_COMMITS" = "No recent commits" ]; then
  echo "No commits in last 24 hours. Skipping review."
  exit 0
fi

echo "Found commits to review:"
echo "$RECENT_COMMITS"

# Run Claude Code to extract learnings and update CLAUDE.md
claude -p "You are reviewing the last 24 hours of development on the 拾光 Glimmer project.

Here are the recent commits:
$RECENT_COMMITS

Here is the diff summary:
$RECENT_DIFF_STAT

Changed files:
$CHANGED_FILES

Your task:
1. Read the current CLAUDE.md file
2. Read the key changed files to understand what was built, fixed, or refactored
3. Extract learnings: patterns that worked, bugs encountered, architectural decisions, gotchas to avoid
4. Update CLAUDE.md with a new '## Recent Learnings' section (or append to existing) with dated entries
5. Keep learnings concise and actionable — focus on things that will help future development
6. Commit your CLAUDE.md changes and push to main

Format each learning as:
- **[YYYY-MM-DD] Category**: Brief actionable learning

Categories: Architecture, Edge Runtime, Build, API, UI, Testing, Deployment" \
  --dangerously-skip-permissions

echo "Compound review complete: $(date)"

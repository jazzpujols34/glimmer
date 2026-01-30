#!/bin/bash
# =============================================================================
# analyze-backlog.sh
# Reads the prioritized backlog and outputs the #1 priority as JSON
# =============================================================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BACKLOG="$PROJECT_DIR/reports/backlog.md"

if [ ! -f "$BACKLOG" ]; then
  echo '{"error": "No backlog.md found", "priority_item": "", "branch_name": ""}'
  exit 1
fi

# Use Claude to analyze the backlog and pick #1 priority
RESULT=$(claude -p "Read the file reports/backlog.md.
Find the highest priority item that is NOT marked as [DONE] or [IN PROGRESS].
Return ONLY a JSON object (no markdown, no explanation) with exactly these fields:
{
  \"priority_item\": \"Brief description of the task\",
  \"branch_name\": \"feature/short-kebab-case-name\",
  \"details\": \"Full details from the backlog entry\"
}

If all items are done or the backlog is empty, return:
{\"priority_item\": \"\", \"branch_name\": \"\", \"details\": \"\"}" \
  --dangerously-skip-permissions 2>/dev/null)

echo "$RESULT"

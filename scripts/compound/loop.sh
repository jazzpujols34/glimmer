#!/bin/bash
# =============================================================================
# loop.sh
# Iterative task execution loop
# Runs Claude Code repeatedly until all tasks pass or iteration limit is hit.
# Usage: ./loop.sh [max_iterations]
# =============================================================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_DIR"

MAX_ITERATIONS=${1:-25}
TASK_FILE="$PROJECT_DIR/scripts/compound/prd.json"

if [ ! -f "$TASK_FILE" ]; then
  echo "Error: No task file found at $TASK_FILE"
  exit 1
fi

echo "Starting execution loop (max $MAX_ITERATIONS iterations)"
echo "Task file: $TASK_FILE"

for i in $(seq 1 "$MAX_ITERATIONS"); do
  echo ""
  echo "--- Iteration $i / $MAX_ITERATIONS ---"

  # Run Claude to execute the next incomplete task
  RESULT=$(claude -p "You are an autonomous developer working on the 拾光 Glimmer project.

Read the task file at scripts/compound/prd.json. This contains a list of tasks.
Each task has a 'status' field: 'pending', 'in_progress', 'completed', or 'failed'.

Your job:
1. Find the FIRST task with status 'pending' or 'failed'
2. If no such task exists, output ONLY the text 'ALL_TASKS_COMPLETE' and stop
3. Update that task's status to 'in_progress' in prd.json
4. Implement the task (edit code, create files, etc.)
5. Run 'npm run build' in the app/ directory to verify your changes compile
6. If build passes, update the task status to 'completed' in prd.json
7. If build fails, update the task status to 'failed' with an error note in prd.json
8. Commit your changes with a descriptive message
9. Output 'TASK_COMPLETE' when done with this iteration

Important:
- Only work on ONE task per iteration
- Always verify with a build
- Commit after each task
- Read CLAUDE.md for project patterns and conventions" \
    --dangerously-skip-permissions 2>&1)

  echo "$RESULT" | tail -5

  # Check if all tasks are done
  if echo "$RESULT" | grep -q "ALL_TASKS_COMPLETE"; then
    echo ""
    echo "All tasks complete after $i iterations!"
    break
  fi

  if [ "$i" -eq "$MAX_ITERATIONS" ]; then
    echo ""
    echo "Reached max iterations ($MAX_ITERATIONS). Some tasks may be incomplete."
  fi
done

echo ""
echo "Loop finished at $(date)"

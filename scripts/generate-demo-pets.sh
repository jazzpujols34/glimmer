#!/bin/bash
# Generate demo pet videos using BytePlus Seedance
# Usage: ./scripts/generate-demo-pets.sh <photo-directory>
#
# 1. Generate photos with Midjourney using the prompts
# 2. Put them in a folder (e.g., scripts/demo-photos/)
# 3. Run: ./scripts/generate-demo-pets.sh scripts/demo-photos/

set -euo pipefail

PHOTO_DIR="${1:?Usage: $0 <photo-directory>}"
API_URL="${2:-http://localhost:3200}"
EMAIL="${GLIMMER_ADMIN_EMAIL:-admin@example.com}"  # Set your admin email

if [ ! -d "$PHOTO_DIR" ]; then
  echo "Error: Directory '$PHOTO_DIR' not found"
  exit 1
fi

# Collect image files
PHOTOS=($(find "$PHOTO_DIR" -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" \) | sort))

if [ ${#PHOTOS[@]} -eq 0 ]; then
  echo "No image files found in $PHOTO_DIR"
  exit 1
fi

echo "Found ${#PHOTOS[@]} photos in $PHOTO_DIR"
echo "API: $API_URL"
echo "Provider: BytePlus Seedance"
echo "Occasion: pet"
echo "Aspect ratio: 16:9 (auto-detected from photo)"
echo ""

JOB_IDS=()

for photo in "${PHOTOS[@]}"; do
  filename=$(basename "$photo")
  name="${filename%.*}"  # Use filename (without ext) as subject name

  echo "--- Submitting: $filename ---"

  SETTINGS=$(cat <<'SETTINGS_EOF'
{
  "model": "byteplus",
  "taskType": "image-to-video",
  "aspectRatio": "16:9",
  "numResults": 1,
  "videoLength": 5,
  "resolution": "720p",
  "cameraFixed": true,
  "prompt": ""
}
SETTINGS_EOF
  )

  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "$API_URL/api/generate" \
    -F "name=$name" \
    -F "occasion=pet" \
    -F "email=$EMAIL" \
    -F "settings=$SETTINGS" \
    -F "photo_0=@$photo")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [ "$HTTP_CODE" = "200" ]; then
    JOB_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")
    if [ -n "$JOB_ID" ]; then
      echo "  Job created: $JOB_ID"
      JOB_IDS+=("$JOB_ID")
    else
      echo "  Warning: 200 but no job ID in response"
      echo "  Response: $BODY"
    fi
  else
    echo "  Error ($HTTP_CODE): $BODY"
  fi

  echo ""
  sleep 1  # Avoid rate limiting
done

echo "========================================="
echo "Submitted ${#JOB_IDS[@]} / ${#PHOTOS[@]} jobs"
echo ""

if [ ${#JOB_IDS[@]} -gt 0 ]; then
  echo "Job IDs:"
  for id in "${JOB_IDS[@]}"; do
    echo "  $id"
  done

  echo ""
  echo "Check status:"
  for id in "${JOB_IDS[@]}"; do
    echo "  curl -s $API_URL/api/status/$id | python3 -m json.tool"
  done

  echo ""
  echo "Poll all until complete:"
  echo "  watch -n 10 'for id in ${JOB_IDS[*]}; do echo \$id; curl -s $API_URL/api/status/\$id | python3 -c \"import sys,json;d=json.load(sys.stdin);print(f\\\"  {d.get(\\\\\"status\\\\\")}: {d.get(\\\\\"progress\\\\\",\\\\\"-\\\\\")}%\\\")\"; done'"
fi

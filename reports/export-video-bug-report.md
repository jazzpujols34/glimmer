# Bug Report: Server Export Video Clips Not Visible

**Date:** 2026-02-16
**Severity:** Critical
**Status:** Open

## Problem Summary

When exporting videos via the server-side Cloud Run FFmpeg service, the exported video has the **correct duration** but **only shows title card and outro card**. The video clips in the middle are either invisible, black, or somehow not rendering despite being concatenated.

## Symptoms

1. Export completes successfully (no errors returned)
2. Video duration is mathematically correct:
   - User's export: 81 seconds (3s title + 75s clips + 3s outro) ✓
   - Test export: 21 seconds (3s title + 15s clips + 3s outro) ✓
3. Title card shows correctly with Chinese text (font fix confirmed working)
4. **BUG**: After title card ends, the outro card content appears immediately and plays for the remaining duration
5. Video clips are NOT visually present despite correct duration

## Reproduction Steps

1. Go to https://glimmer.video/edit/job_1771154304049_il7xfa83s
2. Add title card and outro card with Chinese text
3. Select "伺服器匯出" (Server Export)
4. Click "開始匯出"
5. Download the exported video
6. Play the video - observe only title/outro visible

## Technical Analysis

### Architecture

```
Browser (ExportPanel.tsx)
    ↓ POST /api/export-server
Cloudflare Pages Edge (route.ts)
    ↓ POST /export
Cloud Run (main.py) - FFmpeg processing
    ↓ Upload
R2 Storage
    ↓ Download via /api/export-download
User
```

### Data Flow

1. **ExportPanel.tsx** sends clips with `sourceUrl` (CDN URLs from BytePlus)
2. **export-server/route.ts** maps sourceUrls to accessible URLs for Cloud Run
3. **Cloud Run main.py**:
   - Downloads each clip from URL
   - Processes with FFmpeg (trim, scale, filters)
   - Creates title/outro cards with FFmpeg
   - Concatenates all clips
   - Uploads to R2

### Relevant Files

| File | Purpose |
|------|---------|
| `app/src/components/editor/ExportPanel.tsx` | Sends export request with clip data |
| `app/src/app/api/export-server/route.ts` | Edge route that calls Cloud Run |
| `cloud-run/export-service/main.py` | FFmpeg processing logic |
| `cloud-run/export-service/Dockerfile` | Container with FFmpeg + fonts |

## Potential Root Causes

### 1. FFmpeg Concat Stream Mismatch (MOST LIKELY)

The concatenation uses `-c copy` (stream copy) which requires all input files to have identical codec parameters.

**Title/Outro generation:**
```python
-c:v libx264 -preset fast -pix_fmt yuv420p
-c:a aac -b:a 128k
```

**Clip processing:**
```python
-c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p
-c:a aac -b:a 128k
```

**Concatenation:**
```python
-f concat -safe 0 -i concat.txt
-c copy  # <-- Stream copy, no re-encoding
```

**Problem**: Even small differences in encoding parameters (bitrate, profile, level) can cause the concat demuxer to produce corrupted output where only the first/last segments display correctly.

**Fix**: Change concat to re-encode instead of stream copy:
```python
-c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p
-c:a aac -b:a 128k
```

### 2. Video Stream Ordering Issue

FFmpeg concat demuxer may be selecting the wrong video stream if there are multiple streams or mismatched stream indices.

**Investigation**: Add `-map 0:v:0 -map 0:a:0` to concat command to explicitly select streams.

### 3. Timestamp/PTS Issues

After trimming, the PTS (presentation timestamps) might not be properly reset, causing playback issues where the video appears to jump.

**Current code does include:**
```python
"setpts=PTS-STARTPTS"  # Reset PTS after trim
```

But there might be edge cases where this fails.

### 4. Resolution/Scaling Mismatch

Title cards are generated at exact resolution. Video clips are scaled with padding. If dimensions don't match exactly, concat may fail silently.

**Title card:**
```python
f"color=c={bg_color}:s={width}x{height}:d={tc.durationSeconds}"
# Creates exact 1280x720
```

**Clip processing:**
```python
f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:-1:-1:color=black"
# May produce slightly different dimensions due to aspect ratio
```

### 5. Input Video Download Issues

The CDN URLs have expiration signatures. If URLs expire during processing, downloads may fail silently or return error pages that FFmpeg interprets as video.

**Evidence against this**: Export returns success and duration is correct.

## Debugging Steps

### Step 1: Check concat.txt contents
Add logging to `main.py` to print the concat file:
```python
print(f"[DEBUG] Concat file contents:")
with open(concat_list_path, "r") as f:
    print(f.read())
```

### Step 2: Verify each processed clip
Before concatenation, probe each file:
```python
for clip_path in processed_clips:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", str(clip_path)],
        capture_output=True, text=True
    )
    print(f"[DEBUG] {clip_path}: {result.stdout[:500]}")
```

### Step 3: Test concat with re-encoding
Change line 319-323 in `main.py` from:
```python
success = run_ffmpeg([
    "-f", "concat", "-safe", "0", "-i", str(concat_list_path),
    "-c", "copy",
    str(concat_output),
], "Concatenate")
```

To:
```python
success = run_ffmpeg([
    "-f", "concat", "-safe", "0", "-i", str(concat_list_path),
    "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    str(concat_output),
], "Concatenate")
```

### Step 4: Local reproduction
```bash
# Download test clips manually
curl -o clip1.mp4 "CDN_URL_1"
curl -o clip2.mp4 "CDN_URL_2"

# Process like Cloud Run does
ffmpeg -i clip1.mp4 -vf "trim=start=0:end=5,setpts=PTS-STARTPTS,scale=1280:720..." -c:v libx264 ... processed1.mp4

# Create title card
ffmpeg -f lavfi -i "color=c=0x1a1a1a:s=1280x720:d=3" -vf "drawtext=..." title.mp4

# Concat and check
echo "file 'title.mp4'" > concat.txt
echo "file 'processed1.mp4'" >> concat.txt
ffmpeg -f concat -safe 0 -i concat.txt -c copy output.mp4

# Play and verify
open output.mp4
```

## Recommended Fix

**Priority 1**: Change concatenation to re-encode (slower but guaranteed compatible):

```python
# In main.py, lines 319-323
success = run_ffmpeg([
    "-f", "concat", "-safe", "0", "-i", str(concat_list_path),
    "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",  # Enable progressive download
    str(concat_output),
], "Concatenate")
```

**Priority 2**: Ensure all clips use identical encoding parameters:

```python
# Standardize all encoding to exact same parameters
COMMON_VIDEO_ARGS = ["-c:v", "libx264", "-preset", "fast", "-crf", "23",
                     "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.0"]
COMMON_AUDIO_ARGS = ["-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2"]
```

**Priority 3**: Add explicit stream mapping to concat:

```python
success = run_ffmpeg([
    "-f", "concat", "-safe", "0", "-i", str(concat_list_path),
    "-map", "0:v:0", "-map", "0:a:0",  # Explicit stream selection
    "-c:v", "libx264", ...
], "Concatenate")
```

## Files to Modify

1. **`cloud-run/export-service/main.py`** - Lines 319-323 (concat command)
2. Redeploy Cloud Run after changes:
   ```bash
   cd cloud-run/export-service
   gcloud run deploy glimmer-export --source . --region asia-east1
   ```

## Test After Fix

```bash
# Direct Cloud Run test
curl -X POST "https://glimmer-export-xxx.run.app/export" \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "test_fix",
    "clips": [{"url": "...", "trimStart": 0, "trimEnd": 5, ...}],
    "titleCard": {"text": "Test", "durationSeconds": 3, ...},
    "outroCard": {"text": "End", "durationSeconds": 3, ...}
  }'

# Download and verify ALL segments are visible
curl -o test.mp4 "download_url"
open test.mp4
```

## Related Issues

- Chinese font rendering: FIXED (fonts-noto-cjk installed)
- Music URL double path: NOT DEPLOYED (local fix only)
- Undo/Redo feature: NOT DEPLOYED (local implementation complete)

---

**Assignee:** TBD
**Reporter:** Claude Code Session
**Labels:** bug, critical, video-export, ffmpeg

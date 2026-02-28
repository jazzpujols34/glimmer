# Session Handover — 2026-02-28

## Session Summary

Major iteration on video generation quality - fixed aspect ratio mismatch, prompt engineering for "living portrait" style, and added per-clip delete feature.

## What Was Done

### 1. Batch Generation Scripts
- **Created**: `scripts/batch-generate.mjs` - Bulk video generation with rate limiting
- **Created**: `scripts/batch-status.mjs` - Monitor batch job progress
- **Features**: Concurrency control, 13s delay for rate limits, aspect ratio flag

### 2. Video Quality Iteration (Major)

**Problem**: Videos had bad framing (cut off faces), creepy expressions, camera movement

**Root Cause Found**: Portrait photos (3:4) were being generated as 16:9 landscape videos → BytePlus cropped vertically, cutting off faces/eyes

**Solution**: Auto-detect aspect ratio from photo dimensions
- `image-size` package added
- `/api/generate` now checks if `height > width` → uses `9:16`, else `16:9`
- No more manual aspect ratio selection needed

**Prompt Evolution**:
```
Empty → Too much camera movement, random actions
↓
"Static camera, no zoom" → Still bad framing
↓
"Living portrait. Static camera. Keep looking at camera. Subtle movements only:
gentle breathing, soft blink, tiny natural head micro-movements, hint of a smile.
Maintain original pose and gaze. No dramatic actions. No crying. No camera movement."
↓
Works well! Harry Potter style living portraits
```

### 3. Gallery Improvements
- **Video Switcher**: Click "影片 1/2/3" buttons to switch between clips (not just download)
- **Per-Clip Delete**: Trash icon next to each clip - delete individual videos without losing the whole job
- **API**: `DELETE /api/gallery/[id]?videoIndex=N` removes specific clip

### 4. Learnings Added to CLAUDE.md
- Aspect ratio matching (portrait photos → 9:16 video)
- Prompts: less is more, don't instruct expression changes
- Harry Potter living portrait prompt style

## Current State

| Component | Status |
|-----------|--------|
| Video generation | Working with auto AR detection |
| Prompt | "Living portrait" style, subtle movements |
| Batch scripts | Ready for bulk generation |
| Gallery per-clip delete | Working |
| 10/15 pilot photos | Generated and in gallery |

## Key Files Changed

```
app/src/app/api/generate/route.ts       # Auto-detect aspect ratio
app/src/lib/prompts.ts                  # Living portrait prompts
app/src/app/api/gallery/[id]/route.ts   # Per-clip delete
app/src/app/gallery/page.tsx            # Video switcher + clip delete UI
scripts/batch-generate.mjs              # NEW - Batch generation
scripts/batch-status.mjs                # NEW - Status checker
app/package.json                        # Added image-size
CLAUDE.md                               # New learnings
```

## Commits This Session

```
eeb8546 feat: per-clip delete in gallery
cfdcad1 fix: maintain original gaze, don't look away
5a98992 fix: Harry Potter style living portrait prompts
0538078 feat: auto-detect aspect ratio from photo dimensions
ae72bfb test: empty prompts - let BytePlus use defaults
d6767d5 fix: simplify prompts, remove expression changes
38c187f fix: preserve original framing in video prompts
c69820e fix: gallery video switcher + fixed camera prompts
```

## Next Actions

### Immediate (Continue This Work)
1. **Run remaining 5 photos** - Complete the 15-photo pilot batch
   ```bash
   # Photos not yet processed:
   # - 12_22AM (4).png (tested individually, may want to redo)
   # - 12_22AM (5).png
   # - 12_22AM (7).png
   # - 12_22AM (9).png
   # - 12_22AM.png
   ```

2. **Review all clips** - Use per-clip delete to curate best videos

3. **Test with landscape photos** - Verify auto-AR works for 16:9 source images

### Medium Priority
4. **Create marketing video** - Compile best clips into showcase reel
5. **Landing page** - Embed demo video in hero section

### Backlog
- OG image improvements
- Email templates styling
- B2B features

## Batch Generation Commands

```bash
cd /Users/jazz.lien/Desktop/jazz/0_GitHub/Repositories/17_ultimate_Claude/拾光glimmer

# Generate (auto-detects aspect ratio now!)
node scripts/batch-generate.mjs ~/Desktop/glimmer-batch-photos \
  --email glimmer.hello@gmail.com \
  --occasion memorial \
  --clips 3 \
  --base-url https://glimmer.video

# Check status
node scripts/batch-status.mjs --base-url https://glimmer.video

# Watch mode (polls until complete)
node scripts/batch-status.mjs --watch --base-url https://glimmer.video
```

## Photo Folders on Desktop

- `glimmer-batch-photos/` - All 15 source photos + sample video
- `glimmer-batch-test5/` - First test batch (5 photos)
- `glimmer-batch-last5/` - Second batch (5 photos)
- `glimmer-test-one/` - Single photo testing

## Prompt Reference (Current)

**Person**:
```
Living portrait. Static camera. Keep looking at camera. Subtle movements only: gentle breathing, soft blink, tiny natural head micro-movements, hint of a smile. Maintain original pose and gaze. No dramatic actions. No crying. No camera movement.
```

**Pet**:
```
Living portrait of a pet. Static camera. Subtle movements only: gentle breathing, soft blink, slight ear twitch. Maintain original pose. No dramatic actions. No camera movement.
```

---

## Key Insight

**Aspect ratio mismatch was the root cause of bad framing.** Portrait photos (3:4) need 9:16 video output. The auto-detection fix in `/api/generate` solves this permanently - users no longer need to think about it.

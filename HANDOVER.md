# Session Handover — 2026-03-01

## Session Summary

Built complete **Showcase Video Arsenal** - gallery multi-select, showcase builder page, template quick-apply, and Cloud Run transitions. Fixed critical bug where showcase page couldn't load clips.

## What Was Done

### 1. Showcase Video Arsenal (Complete)

**Gallery Multi-Select** (`app/src/app/gallery/page.tsx`)
- "選取製作" button toggles checkbox mode
- Selection bar shows count + "製作展示影片" button (≥2 clips)
- Clips stored as `Set<string>` with format `jobId:videoIndex`

**Showcase Builder** (`app/src/app/showcase/page.tsx`)
- URL: `/showcase?clips=jobId:0,jobId:1,...`
- Left panel: clip arrangement (reorder, remove)
- Right panel: template picker with occasion filter
- Input fields for name/date/message placeholders
- Export button calls Cloud Run with transitions

**Template Quick-Apply** (`app/src/components/editor/TemplatePanel.tsx`)
- Added to editor sidebar (Wand2 icon, "範本" tab)
- Occasion filter (追思/生日/婚禮/寵物/其他)
- Live preview of title/outro cards
- One-click applies: title card + outro card + all transitions

**Transitions in Cloud Run** (`cloud-run/export-service/main.py`)
- 13 transition types: fade, fadeblack, fadewhite, wipe*, slide*, dissolve
- FFmpeg xfade filter for video, acrossfade for audio
- Duration slider 300-1500ms
- `concatenate_with_transitions()` function

### 2. Bug Fixes

| Bug | Fix |
|-----|-----|
| Prompt tests failing | Updated to match "living portrait" prompts (empty occasion/task) |
| Showcase shows "未選取影片" | Fixed API parsing: `data.job?.videoUrls` → `job.videoUrls` |

### 3. Cloud Run Deployment

**IMPORTANT**: Glimmer uses personal GCP, not company account!

```bash
# Correct (personal)
gcloud config configurations activate personal
# Project: concise-honor-486903-j3
# URL: https://glimmer-export-400681766869.asia-east1.run.app

# Wrong (company) - deleted the accidental deployment
gcloud config configurations activate work
# Project: tw-rd-sa-jazz-lien
```

## Files Changed

```
# New files
app/src/app/showcase/page.tsx           # Showcase builder
app/src/app/showcase/layout.tsx         # Edge runtime export
app/src/components/editor/TemplatePanel.tsx  # Template quick-apply

# Modified
app/src/app/gallery/page.tsx            # Multi-select UI
app/src/components/editor/TransitionPicker.tsx  # Dropdown with 13 types
app/src/components/editor/EditorLayout.tsx      # Added Templates tab
app/src/components/editor/ExportPanel.tsx       # Send transitions
app/src/lib/templates.ts                # buildEditorTitleCard/Outro/Transitions
app/src/lib/editor/auto-save.ts         # Migration for old transition types
app/src/lib/prompts.test.ts             # Fixed tests
app/src/types/editor.ts                 # 13 TransitionTypes
app/src/app/api/export-server/route.ts  # Pass transitions to Cloud Run
cloud-run/export-service/main.py        # xfade implementation
CLAUDE.md                               # New learnings
```

## Commits This Session

```
f229cf7 fix: showcase page API response parsing
6c7bc55 docs: add learnings - xfade transitions, showcase arsenal, edge runtime
ac44756 feat: showcase video arsenal - transitions, templates, multi-select
```

## Test Results

| Test | Status |
|------|--------|
| Build | ✅ Pass |
| Unit tests (53) | ✅ Pass |
| Gallery multi-select | ✅ Working |
| Showcase page loads clips | ✅ Working |
| Cloud Run export with transitions | ✅ 16s video, 0.88MB |

## Current State

- All code on `main`, deployed to Cloudflare Pages
- Cloud Run healthy on personal GCP (`400681766869`)
- Showcase feature fully functional end-to-end

## Next Actions

### User's Current Research
**AI Music Generation** - Exploring options for royalty-free background music:
- **Mubert** - Cheapest API ($0.01-0.05/track), designed for apps
- **Suno** - Higher quality (~$0.05/song), full ownership
- **AIVA** - Orchestral/cinematic (€11/mo)

Approach: Pre-generate 10-20 tracks per occasion, store in R2

### Backlog
1. ECPay integration (Taiwan payments)
2. Error monitoring (Sentry)
3. OG Image for social previews
4. Analytics dashboard

## Key Learnings Added to CLAUDE.md

- **FFmpeg xfade**: `[0:v][1:v]xfade=transition=fade:duration=0.5:offset=4.5[v]`
- **Edge Runtime**: Client pages need sibling `layout.tsx` with runtime export
- **Transition migration**: Handle old enum values in auto-save restore
- **GCP accounts**: Always use personal config for Glimmer

## Quick Commands

```bash
# Dev server
cd app && npm run dev -- --port 3200

# Run tests
cd app && npm test

# Deploy Cloud Run (MUST use personal account!)
gcloud config configurations activate personal
cd cloud-run/export-service
gcloud builds submit --tag gcr.io/concise-honor-486903-j3/glimmer-export .
gcloud run deploy glimmer-export --image gcr.io/concise-honor-486903-j3/glimmer-export --region asia-east1

# Check Cloud Run health
curl https://glimmer-export-400681766869.asia-east1.run.app/health
```

## Showcase Feature Flow

```
Gallery → "選取製作" → Select clips → "製作展示影片"
                              ↓
Showcase Page (/showcase?clips=...)
    ├── Arrange clips (reorder/remove)
    ├── Pick template (occasion filter)
    ├── Fill placeholders (name/date/message)
    └── "製作展示影片" → Cloud Run export
                              ↓
Cloud Run: Download clips → Add title/outro → Apply transitions → Upload to R2
                              ↓
Download URL returned to user
```

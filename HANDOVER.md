# Session Handover — 2026-03-03 (Updated)

**File Path:** `/Users/jazz.lien/Desktop/jazz/0_GitHub/Repositories/17_ultimate_Claude/拾光glimmer/HANDOVER.md`

## What We Did This Session

### 1. Wedding Showcase Video — COMPLETE
- Generated 15 videos from 5 wedding photos using batch script
- All 5 jobs completed successfully (3 clips each)
- Created export: `demo-videos/uploaded-as-showcase-video-wedding.mp4`
- Deployed to `app/public/showcase-video-wedding.mp4`
- Added to landing page Wedding ShowcaseCard
- Fixed Cloudflare deployment failure (internal error → retry commit succeeded)

### 2. Gallery Refresh Button
- **Problem:** Gallery shows stale data because it only reads KV, doesn't poll providers
- **Solution:** Created `/api/gallery/refresh` endpoint + refresh button
- Button bulk-polls all processing jobs, updates KV, refreshes gallery
- Added learning to CLAUDE.md about client-driven polling architecture

### 3. Storyboard Color Presets
- Synced `TitleCardModal.tsx` with editor's 10 presets (was only 5)
- Added 5 elegant tones: 玫瑰木, 皇家靛, 可可棕, 金銅色, 橄欖綠
- Added `flex-wrap` for proper layout of 10 color circles

### 4. Storyboard Preview Transitions — FIXED
**Issues fixed:**
1. Black flash between intro and first clip
2. Transitions stuck at second clip with 0.5s fade
3. Progress bar twitching during intro/outro

**Root causes:**
- `elapsedTime` in useEffect deps caused infinite re-render
- Mixed setTimeout + requestAnimationFrame was unreliable

**Fixes:**
- Removed `elapsedTime` from useEffect dependencies, use refs instead
- Pure requestAnimationFrame loop for transitions
- Preload next video during current item playback
- Guard against double-trigger in `startTransition`

### 5. Showcase Videos Status — ALL COMPLETE
| Section | File | Status |
|---------|------|--------|
| 追思紀念 (Memorial) | `showcase-video-1.mp4` | ✅ Live |
| 壽宴慶生 (Birthday) | `showcase-video-birthday.mp4` | ✅ Live |
| 寵物紀念 (Pet) | `showcase-video-pets.mp4` | ✅ Live |
| 婚禮紀念 (Wedding) | `showcase-video-wedding.mp4` | ✅ Live |
| 其他場合 (Other) | — | Placeholder (no video) |

---

## Current State

**Git:** All changes pushed to `origin/main`

**Latest commits:**
```
594d4f0 chore: retry deploy (CF internal error)
a0cb1ea feat: add wedding showcase video to homepage
37ee0b8 fix: storyboard preview transitions and progress bar
c7a84f8 feat: sync storyboard title card presets with editor (10 total)
f9b6f1e feat: add gallery refresh button to poll processing jobs
```

**Production:** https://glimmer.video — All 4 showcase videos playing correctly

---

## What's Left / Next Priorities

### 1. ECPay Integration (Main Priority)
Swap Stripe → ECPay for Taiwan-native payments (credit card, ATM, 超商代碼, LINE Pay)
- See `reports/backlog.md` for details

### 2. Error Monitoring
No Sentry. Production errors are invisible. Need to add error tracking.

### 3. OG Image
Proper 1200x630 social card for link previews (currently missing)

### 4. Analytics Dashboard
Track generation counts, model usage, error rates

---

## Key Files Reference

| Purpose | Path |
|---------|------|
| Landing page | `app/src/app/page.tsx` |
| Gallery page | `app/src/app/gallery/page.tsx` |
| Gallery refresh API | `app/src/app/api/gallery/refresh/route.ts` |
| Storyboard preview | `app/src/components/storyboard/StoryboardPreviewModal.tsx` |
| Storyboard title cards | `app/src/components/storyboard/TitleCardModal.tsx` |
| Color presets (editor) | `app/src/components/editor/TitleCardPanel.tsx` |
| Public showcase videos | `app/public/showcase-video-*.mp4` |
| Source videos | `demo-videos/uploaded-as-*.mp4` |
| Batch generate script | `scripts/batch-generate.mjs` |

## Quick Commands

```bash
# Dev server
cd app && npm run dev -- --port 3200

# Batch generate (always use production!)
node scripts/batch-generate.mjs /path/to/photos \
  --email glimmer.hello@gmail.com \
  --clips 3 \
  --base-url https://glimmer.video

# Check batch status
node scripts/batch-status.mjs

# Check specific job
curl -s "https://glimmer.video/api/status/job_xxx"
```

## Important Notes

- **Aspect ratio:** Auto-detected by API from photo dimensions
- **Portrait videos:** Don't work in ShowcaseCards — use landscape (16:9) only
- **Gallery URL:** `/generate/job_xxx` (path, NOT query param `?id=`)
- **Production only:** Never generate via localhost (no KV/R2 bindings)
- **Cloudflare:** If deployment fails with internal error, push empty commit to retry

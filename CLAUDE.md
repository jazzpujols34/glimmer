# CLAUDE.md — 拾光 Glimmer

> **Root conventions apply:** See `../CLAUDE.md` for coding guardrails, plan mode structure, and learned rules protocol.

## Project Overview

**拾光 Glimmer** is an AI-powered memorial video generation platform. Users upload photos and the app generates cinematic videos via multiple AI providers (Google Veo 3.1, BytePlus Seedance, Kling AI).

**Stack:** Next.js 16, React, TypeScript, Tailwind CSS, Cloudflare Pages (Edge Runtime), Cloudflare KV, Cloudflare R2

**Stats (2026-03-10):** 176+ commits, 140+ source files, 51 tests, deployed on Cloudflare Pages

## Folder Structure

```
app/                          # Next.js application
├── src/
│   ├── app/                  # Pages and API routes (App Router)
│   │   ├── api/              # 34 API routes (Edge Runtime)
│   │   │   ├── generate/     # Video generation (POST)
│   │   │   ├── status/[id]/  # Job status polling (GET)
│   │   │   ├── gallery/      # Gallery listing + detail
│   │   │   ├── admin/        # Stats, users, cleanup (admin-gated)
│   │   │   ├── checkout/     # Stripe payment
│   │   │   ├── webhooks/     # ECPay webhook
│   │   │   ├── proxy-video/  # R2/CDN video proxy (for editor Canvas ops)
│   │   │   └── ...           # credits, export, storyboards, verify, etc.
│   │   ├── create/           # Upload + generate page
│   │   ├── edit/[id]/        # Video editor (timeline, music, export)
│   │   ├── gallery/          # User gallery
│   │   ├── generate/[id]/    # Generation progress + results
│   │   ├── showcase/         # Showcase builder
│   │   ├── storyboard/       # Multi-slot storyboard editor
│   │   ├── admin/            # Admin dashboard
│   │   └── upgrade/          # Pricing + purchase
│   ├── components/
│   │   ├── editor/           # Editor panels (Music, SFX, Subtitle, Timeline, etc.)
│   │   ├── storyboard/       # Storyboard components (SlotCard, Modals, Grid)
│   │   └── ui/               # shadcn/ui primitives (button, card, input, etc.)
│   ├── hooks/                # useAccess, useNSFWCheck
│   ├── lib/                  # Core business logic
│   │   ├── constants.ts      # Shared UI constants (OCCASION_LABELS, BUNDLED_TRACKS, COLOR_PRESETS)
│   │   ├── media-utils.ts    # Shared getVideoDuration, getAudioDuration
│   │   ├── video-url.ts      # R2 key → proxy URL transform (getVideoUrl, getVideoUrls)
│   │   ├── storage.ts        # KV/in-memory job storage abstraction
│   │   ├── kv.ts             # Low-level KV helpers (kvGet, kvPut, kvDelete, getKV)
│   │   ├── r2.ts             # R2 video archival
│   │   ├── veo.ts            # Multi-provider video generation (BytePlus, Veo, Kling)
│   │   ├── credits.ts        # Credit system + isAdmin + ADMIN_EMAILS
│   │   ├── prompts.ts        # Category-aware AI prompt builder
│   │   ├── validation.ts     # Shared validators (isValidEmail, etc.)
│   │   ├── rate-limit.ts     # KV-based rate limiting
│   │   ├── analytics.ts      # GA4 event tracking
│   │   ├── errors.ts         # Sentry HTTP API (Edge-compatible)
│   │   ├── email.ts          # Resend email (verification, completion)
│   │   ├── ecpay.ts          # ECPay payment integration
│   │   ├── templates.ts      # Video export templates
│   │   ├── api-response.ts   # Typed API response helpers
│   │   ├── logger.ts         # Structured logging
│   │   └── editor/           # Editor-specific logic (auto-save, ffmpeg, timeline)
│   └── types/                # TypeScript types (index.ts, editor.ts)
scripts/
├── batch-generate.mjs        # Batch video generation from photo folder
├── batch-status.mjs          # Check batch job status
├── compound/                 # Compound review scripts
├── generate-demo-pets.sh     # Demo pet photo generator
└── archive/                  # Retired scripts (launchd setup/teardown)
```

## Architecture

### Client-Driven Polling Pattern
The app uses a **client-driven polling** architecture for video generation:
1. `POST /api/generate` — creates external task, saves tracking data to KV, returns job ID immediately
2. `GET /api/status/[id]` — client polls this; each request checks external API once, updates KV, archives to R2 on completion
3. No background tasks or fire-and-forget — everything is request-scoped for Edge compatibility

### Storage & Video Lifecycle
- **KV** (`GLIMMER_KV`): Job records (24h TTL), credits (no TTL), rate limits
- **R2** (`GLIMMER_R2`): Archived videos (permanent). Auto-archived when generation completes via `archiveVideos()` in status route.
- **Local dev:** In-memory `Map` on `globalThis` (survives HMR). All storage functions are `async`.
- **Video URL resolution:** R2 keys (not starting with `http`) → proxy URL (`/api/proxy-video?jobId=xxx&index=0`). CDN URLs (starting with `http`) used directly. Consolidated in `lib/video-url.ts`.

### Multi-Provider Video Generation
`veo.ts` dispatches to provider-specific functions, returns uniform `TaskCheckResult`.
Providers: `byteplus`, `veo-3.1`, `veo-3.1-fast`, `kling-ai`

### Shared Modules (consolidated 2026-03-04)
Avoid re-declaring these — always import from the canonical source:
| What | Import from | Notes |
|------|-------------|-------|
| `OCCASION_LABELS`, `BUNDLED_TRACKS`, `COLOR_PRESETS` | `@/lib/constants` | UI display strings, music tracks, color presets |
| `getVideoDuration`, `getAudioDuration` | `@/lib/media-utils` | Client-side HTML5 media duration |
| `getVideoUrl`, `getVideoUrls` | `@/lib/video-url` | R2 key → proxy URL transform |
| `isAdmin`, `ADMIN_EMAILS` | `@/lib/credits` | Admin check for gated routes |
| `isValidEmail` | `@/lib/validation` | Email format validator |
| `getKV`, `KVNamespaceLike` | `@/lib/kv` | Low-level KV access |

## Assigned Ports

**ALWAYS use these ports (never use defaults 3000/5173/8000):**
- Frontend: `3200`
- Backend: `3201` (if applicable)

## Commands

```bash
cd app && npm run dev -- --port 3200   # Dev server
cd app && npm run build                 # Production build
cd app && npm test                      # Tests (Vitest, 51 tests)
```

## Batch Video Generation

**ALWAYS use production** (`--base-url https://glimmer.video`). Local dev lacks KV/R2 bindings.

```bash
# Generate
node scripts/batch-generate.mjs /path/to/photos --email user@example.com --base-url https://glimmer.video

# Check status
node scripts/batch-status.mjs --base-url https://glimmer.video
```

Options: `--clips 1-4` (default 3), `--model byteplus|veo-3.1|kling-ai`, `--occasion memorial|birthday|wedding|pet|other`, `--delay` seconds, `--dry-run`. Aspect ratio auto-detected from photo dimensions.

## Business Model

Pay-per-video credits (not subscriptions). Email-only identity (no passwords/OAuth).
- Free: 1 video per email, full quality, no watermark
- Single: NT$499 (1 credit), 5-pack: NT$1,999 (NT$400/ea)
- Enterprise: 請洽業務 (contact sales)
- Payment: ECPay (Taiwan-native), Stripe as fallback

## CI/CD

- **Deployment:** Cloudflare Pages (auto-deploy on push to `main`)
- **Build:** `@cloudflare/next-on-pages` with `legacy-peer-deps=true` in `.npmrc` (Next.js 16 peer dep workaround)
- **Export service:** Cloud Run with FFmpeg for server-side video export (concat, transitions, title cards)
- **New route checklist:** (1) API route → `export const runtime = 'edge';`, (2) `'use client'` page → sibling `layout.tsx` with runtime export, (3) Server page → direct runtime export. **Build fails on Cloudflare without this.**

## Common Gotchas

### Edge Runtime Constraints
- No `fs`, `path`, `crypto.createHmac` — use Web Crypto API (`crypto.subtle`) for HMAC
- No background tasks (`waitUntil`, `setTimeout` polling) — use client-driven polling + KV
- In-memory state not shared across isolates — always use KV for persistence
- Stripe/ECPay via raw `fetch()` — no SDK packages needed

### Video & Media
- `<video src>` does NOT need CORS. Proxy only needed for `fetch()` / Canvas / Web Audio ops (editor)
- `preload="metadata"` for gallery thumbnails (shows first frame). `preload="none"` = black rectangle.
- AI-generated videos often have **no audio track** — FFmpeg commands must probe first (`ffprobe -select_streams a`) or use optional mapping (`-map 0:a:0?`)
- CDN URLs expire in 24h. R2 proxy URLs (`/api/proxy-video`) never expire. Check `url.startsWith('/api/proxy-video')` before showing expiration warnings.

### Development
- Turbopack cache corruption: `rm -rf .next` and restart if dev server panics
- ICO files must use RGBA PNG frames (not RGB) or Turbopack fails
- When adding to a TypeScript union (e.g., `OccasionType`), update all `Record<OccasionType, ...>` — compiler catches these

### Prompts
- Less is more — overly detailed prompts distort faces. Start minimal, add constraints only if needed.
- Category-aware: `getSystemPrompt(occasion)` selects person vs pet base prompt. Keep occasion layer separate.

## Recent Learnings

- **[2026-03-10] Draggable Text Boxes**: Card editor now supports free-positioned text boxes via pointer events. `CardTextBox` type on `StoryboardTitleCard` (optional, backward compat). Positions stored as 0-100% of canvas. Font size uses `cqh` CSS unit. `CardPreview` renders textBoxes if present, falls back to template. `InteractiveCanvas` is the editable version.

- **[2026-03-10] Card Backgrounds**: 12 SVG backgrounds in `app/public/backgrounds/`, registered in `CARD_BACKGROUNDS` (constants.ts). Any format works (JPG/PNG/SVG). Ideal size: 1920x1080. Cloud Run Dockerfile needs `librsvg2-bin` for SVG support in FFmpeg. Falls back to solid color if download fails.

- **[2026-03-10] Thumbnail Caching**: SlotCard video thumbnails cached in sessionStorage (keyed by URL+ratio). Max 3 concurrent generations via queue. Fixes slow storyboard load with many clips.

- **[2026-03-10] z-index + pointer-events**: `CardPreview` uses `absolute inset-0` with `zIndex: 1` — any clickable overlay on top needs `z-20`+ AND preview needs `pointer-events-none`. Native HTML `draggable` swallows clicks — always add explicit `onClick` on draggable wrappers.

- **[2026-03-04] Code Cleanup**: Consolidated duplicated code across 34 files into shared modules (`constants.ts`, `media-utils.ts`, `video-url.ts`). Fixed 4 bugs: pet occasion label undefined, updateJob resetting 30-day TTL, upload-music returning fake R2 key, export-server validating after credit check. Removed 6 dead exports. Net -320 lines.

- **[2026-03-03] Gallery Polling**: Gallery reads KV without checking providers — jobs stay `processing` until status endpoint is polled. Solution: "Refresh" button that bulk-polls `/api/status` for processing jobs.

- **[2026-02-28] FFmpeg xfade**: 13 transition types via `xfade` filter. Both `xfade` and `acrossfade` require all inputs to have video+audio streams — add silent audio to video-only clips first.

- **[2026-02-28] Showcase Arsenal**: Three-tier system: gallery multi-select → showcase builder (`/showcase?clips=...`) → template quick-apply. Templates in `lib/templates.ts`.

- **[2026-02-26] R2 Archival**: Videos auto-archived when generation completes. R2 proxy URLs never expire. CDN URLs expire in 24h. Archival falls back silently if R2 binding not configured.

- **[2026-02-26] Feature Gating**: `/api/access` → `useAccess()` hook → `<AccessGate>` wrapper. Admin grants stored as purchases with `provider: 'admin'`.

- **[2026-02-02] Auto-Save**: IndexedDB for editor state. Debounce 1s, skip UI-only actions. Strip `blobUrl` before saving, re-fetch on restore. Migration logic for renamed enum values.

- **[2026-02-01] Credits**: Deduct AFTER external API success, not before. Idempotent webhooks: check `purchase.id` before adding credits.

- **[2026-02-01] Business Model**: Pay-per-video > subscriptions for event-driven products. Price anchor against traditional production (NT$15,000+ vs NT$499). Enterprise = "contact sales" to control margins.

- **[2026-01-31] Landing Page**: 7-section framework: Hero, Benefits, Showcase, Social Proof, Why Us, Pricing, FAQ. Founder story substitutes for missing testimonials.

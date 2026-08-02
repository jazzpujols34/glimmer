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
├── orphan-preview.html       # Local tool: preview R2 videos by jobId (when KV expired). Open directly in browser.
└── demo-photos/              # Default photos for batch-generate testing
```

## Maintenance tools

**Recovering orphaned R2 videos** (when KV record expired but R2 file still exists):
```bash
# 1. List R2 keys
cd app && npx wrangler r2 object list glimmer-videos --prefix videos/ --remote

# 2. Open preview tool, paste keys, view previews
open scripts/orphan-preview.html
```
The proxy-video endpoint has a fallback that serves directly from R2 if the KV record is missing, so URLs of the form `glimmer.video/api/proxy-video?jobId=<jobId>&index=<N>` work permanently for any R2-archived video — useful for sending lost videos back to customers without rebuilding state.

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
| `isValidEmail` | `@/lib/validation` | Email format validator (never inline regex) |
| `normalizeError` | `@/lib/errors` | Error object/string normalization |
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

Pay-per-generation credits (not subscriptions). Email-only identity (no passwords/OAuth).
- Free: 3 generations per email (`FREE_GENERATIONS` in `src/types/index.ts`), full quality, no watermark
- Credit packs: 20 次 NT$299, 50 次 NT$599 — single source of truth in `src/lib/packs.ts`
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

### Provider APIs
- Provider errors may be objects (`{code, message}`), not strings. Always normalize with `normalizeError()` before storing or returning to client.
- BytePlus content filter (`OutputVideoSensitiveContentDetected`) flags innocent photos (e.g. mother in tank top holding baby). This is a server-side false positive — cannot be fixed on our end.

### Video & Media
- `<video src>` does NOT need CORS. Proxy only needed for `fetch()` / Canvas / Web Audio ops (editor)
- `preload="metadata"` for gallery thumbnails (shows first frame). `preload="none"` for modal/dialog videos (load on hover).
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

- **[2026-08-02] Progressive Google identity Phase 1 shipped dormant** (branch `feature/oauth-phase1`, not yet merged/deployed) — session library (`src/lib/session.ts`, Web Crypto HMAC-SHA256, no jose dep), one OAuth catch-all route (`src/app/api/auth/[...auth]/route.ts`: login/callback/session/logout), a dormant `resolveIdentity()` bridge (`src/lib/identity.ts`, session → `submap:<sub>` → email), and a "Sign in with Google" button in the landing header. Nothing requires a session yet — every existing route still resolves identity by client-typed email exactly as before. Bundle only fit under 25 MiB by first folding `/api/access` into `/api/credits` (Step 0, see the corollary below) to net one function back before adding the new auth route: 24.878 → 24.561 → 24.886 MiB, ~114 KiB headroom left afterward — the next new route on this app needs its own fold-or-retire first. Phase 2 (enforcing sessions on money/PII routes) is a separate, later change — see `docs/oauth-identity-design.html`.

- **[2026-08-02] CF Pages has a 25 MiB Functions bundle limit and ONLY Cloudflare's deploy step enforces it** — local `next build` AND local `npx @cloudflare/next-on-pages` both pass on a bundle that CF rejects ("Generated Pages Functions bundle size is over the limit of 25.0 MiB"). The Next 16.1.4→16.2.12 bump inflated the worker to 26.03 MiB and **silently broke every deploy from 2026-08-01 until the revert (`9fc180d`)**; prod kept serving the last good build, so nothing looked wrong. Before ANY dep bump or large feature: build with `npx @cloudflare/next-on-pages`, then measure `find .vercel/output/static/_worker.js -name "*.js" -o -name "*.wasm" | xargs stat -f%z | awk '{s+=$1} END {print s/1048576}'` — we sit at ~24.8 MiB with ~200 KiB headroom. Retrying the Next 16.2.x upgrade REQUIRES a bundle diet first, done against a preview deployment. After every push to main, verify the deployment actually succeeded (`npx wrangler pages deployment list --project-name=glimmer`) — a red build is silent otherwise. Build logs are fetchable via the CF API: `GET /accounts/{acct}/pages/projects/glimmer/deployments/{id}/history/logs` with wrangler's OAuth token.
  - **Corollary, verified while building the admin portal (same day):** each Cloudflare Pages Function (`__next-on-pages-dist__/functions/**/*.func.js`) carries a **fixed ~320-330 KiB bundle overhead regardless of route logic size** — even a near-trivial route (`api/webhooks/ecpay-return.func.js`) is ~312 KiB, while a full route with real business logic (`api/admin/overview.func.js`) is only ~334 KiB, i.e. the route's own code was <25 KiB of that. With only ~190-200 KiB of headroom at baseline, **adding even ONE new `route.ts` file can blow the budget** — code-golfing the new route's logic does nothing, since the fixed per-function cost dwarfs it. The fix is architectural, not stylistic: fold new read endpoints into an existing route's query-param space (e.g. `?jobsEmail=`) instead of creating a new `route.ts`, or retire an old route to net the function count back to zero. Always confirm with a real `next build` — `/some-page` routes with no server data dependency (e.g. `/admin`, a pure `'use client'` page) come out `○` static and cost nothing against this limit; only new `ƒ` (dynamic) routes/functions do.

- **[2026-07-30] Per-user routes MUST take an explicit owner**: `/api/gallery` was declared `export async function GET()` — no request object, so no identity — and `getCompletedJobs()` did a bare `kvListKeys('job:')`. It served every user's completed videos to anonymous visitors. `/api/projects` and `/api/storyboards` had a subtler version: `searchParams.get('email') || undefined` combined with `if (!email || project.email === email)`, so **omitting the param disabled the filter**. An opt-in filter is not access control. Every per-user route now goes through `getRequesterEmail()` + `ownsOrAdmin()` from `src/lib/owner.ts`: missing/invalid email → 400, non-owner → **404** (never 403 — don't confirm another user's resource exists), resource with no `email` field → admin-only. Admins bypass via `isAdmin()`. Deliberately NOT changed: `/api/proxy-video`, `/api/proxy-r2`, `/api/export-download` keep their unguessable-id bearer model (the RUNBOOK's "send a lost video back to a customer" flow depends on it) — scoping the *listings* is what stops ids being enumerable. Also still open by design: `/api/status/[id]`. Known limitation: the requester email is client-supplied and spoofable; this closes anonymous enumeration, not a determined attacker. A signed identity token is the real fix and would force existing verified users to re-verify.

- **[2026-07-30] Never hand a jobId → email**: `/api/gallery/[id]` used to return `email: job.email` so the client could decide on an export watermark. That turned any jobId into a customer-email lookup. It now returns a server-computed `watermark: boolean`, and `EditorState` stores that boolean instead of the email (so no email lands in the IndexedDB autosave). The fail-safe direction is load-bearing: `/api/export-server` treats a **missing** `watermark` as "apply it", so a lost value never yields a free unwatermarked export.

- **[2026-07-30] BytePlus image roles and duration floor**: `seedance-1-5-pro` requires a `role` on **every** image content item when more than one image is sent — tagging only the second image `last_frame` and leaving the first bare fails the whole request with `role must be specified for image contents`. Two-image (first-last-frame) requests must send `first_frame` + `last_frame`; single-image requests must send **no** `role` key at all (that is the proven-working shape). Verified accepted durations are **4–12s inclusive** — 2, 3 and 15 are rejected — so the clamp floor is 4, not 2. Cheap way to probe provider constraints without paying for generations: send a deliberately malformed image, so a *valid* parameter set fails at image validation instead of billing a video.

- **[2026-07-30] Credit Pack SSOT**: Credit packs (id, credits, priceTWD, label) are defined ONCE in `src/lib/packs.ts` — never re-declare a pack table in a route. `checkout/route.ts` and `webhooks/ecpay/route.ts` both import from it. The webhook resolves credits by signed `packId` (ECPay `CustomField2`, verified against the paid amount) first, falling back to the legacy amount→credits map (`creditsForAmount`) for pre-deploy orders. Removed two dead/unreachable packs (`single` NT$499/1 credit, `pack5` NT$1,999/5 credits) that were stale pricing from an earlier business model and had no UI button — anyone who discovered them via direct API call got a strictly worse price than the real NT$299/20-credit pack.

- **[2026-03-21] Provider Error Objects**: BytePlus (and potentially other providers) return errors as `{code, message}` objects, not strings. Always use `normalizeError()` from `@/lib/errors` — never assume `error` is a string. React crashes when rendering objects as text nodes.

- **[2026-03-21] Error UX Principle**: Generation errors must blame the system, never the user's content. Use warm gold tones (not red), empathetic copy ("系統處理時遇到限制，並非照片本身的問題"), and hide technical details behind a collapsible toggle. BytePlus content filter aggressively flags innocent family photos — this is a known false-positive issue.

- **[2026-03-21] Performance**: SlotCard wrapped with `React.memo`. FFmpeg wasm (~30MB) lazy-loaded via dynamic import only on export click. Gallery uses client-side pagination (20 per page + "顯示更多"). Thumbnail queue has 8s timeout to prevent stalls. AddClipsDialog videos use `preload="none"` (load on hover).

- **[2026-03-10] Draggable Text Boxes**: Card editor now supports free-positioned text boxes via pointer events. `CardTextBox` type on `StoryboardTitleCard` (optional, backward compat). Positions stored as 0-100% of canvas. Font size uses `cqh` CSS unit. `CardPreview` renders textBoxes if present, falls back to template. `InteractiveCanvas` is the editable version.

- **[2026-03-10] Card Backgrounds**: 12 SVG backgrounds in `app/public/backgrounds/`, registered in `CARD_BACKGROUNDS` (constants.ts). Any format works (JPG/PNG/SVG). Ideal size: 1920x1080. Cloud Run Dockerfile needs `librsvg2-bin` for SVG support in FFmpeg. Falls back to solid color if download fails.

- **[2026-03-10] Thumbnail Caching**: SlotCard video thumbnails cached in sessionStorage (keyed by URL+ratio). Max 3 concurrent generations via queue. Fixes slow storyboard load with many clips.

- **[2026-03-10] z-index + pointer-events**: `CardPreview` uses `absolute inset-0` with `zIndex: 1` — any clickable overlay on top needs `z-20`+ AND preview needs `pointer-events-none`. Native HTML `draggable` swallows clicks — always add explicit `onClick` on draggable wrappers.

- **[2026-03-04] Code Cleanup**: Consolidated duplicated code across 34 files into shared modules (`constants.ts`, `media-utils.ts`, `video-url.ts`). Fixed 4 bugs: pet occasion label undefined, updateJob resetting 30-day TTL, upload-music returning fake R2 key, export-server validating after credit check. Removed 6 dead exports. Net -320 lines.

- **[2026-03-03] Gallery Polling**: Gallery reads KV without checking providers — jobs stay `processing` until status endpoint is polled. Solution: "Refresh" button that bulk-polls `/api/status` for processing jobs.

- **[2026-02-28] FFmpeg xfade**: 13 transition types via `xfade` filter. Both `xfade` and `acrossfade` require all inputs to have video+audio streams — add silent audio to video-only clips first.

- **[2026-02-28] Showcase Arsenal**: Three-tier system: gallery multi-select → showcase builder (`/showcase?clips=...`) → template quick-apply. Templates in `lib/templates.ts`.

- **[2026-03-13] R2 Archival Retry**: Archival (CDN→R2) used to get one shot at completion time. If it failed silently, CDN URL was stored and expired in 24h — video lost forever. Now both `/api/status` and `/api/gallery` retry archival for any job with `archived=false` and CDN URLs present. Multiple retry windows across the 24h CDN lifetime.

- **[2026-02-26] R2 Archival**: Videos auto-archived when generation completes. R2 proxy URLs never expire. CDN URLs expire in 24h.

- **[2026-02-26] Feature Gating**: `/api/access` → `useAccess()` hook → `<AccessGate>` wrapper. Admin grants stored as purchases with `provider: 'admin'`.

- **[2026-02-02] Auto-Save**: IndexedDB for editor state. Debounce 1s, skip UI-only actions. Strip `blobUrl` before saving, re-fetch on restore. Migration logic for renamed enum values.

- **[2026-02-01] Credits**: Deduct AFTER external API success, not before. Idempotent webhooks: check `purchase.id` before adding credits.

- **[2026-02-01] Business Model**: Pay-per-video > subscriptions for event-driven products. Price anchor against traditional production (NT$15,000+ vs NT$499). Enterprise = "contact sales" to control margins.

- **[2026-01-31] Landing Page**: 7-section framework: Hero, Benefits, Showcase, Social Proof, Why Us, Pricing, FAQ. Founder story substitutes for missing testimonials.

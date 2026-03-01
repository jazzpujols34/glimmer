# CLAUDE.md — 拾光 Glimmer

> **Root conventions apply:** See `../CLAUDE.md` for coding guardrails, plan mode structure, and learned rules protocol.

## Project Overview

**拾光 Glimmer** is an AI-powered memorial video generation platform. Users upload photos and the app generates cinematic videos via multiple AI providers (Google Veo 3.1, BytePlus Seedance, Kling AI).

**Stack:** Next.js 16, React, TypeScript, Tailwind CSS, Cloudflare Pages (Edge Runtime), Cloudflare KV

**Key directories:**
- `app/` — Next.js application
- `app/src/lib/storage.ts` — KV/in-memory storage abstraction
- `app/src/lib/veo.ts` — Multi-provider video generation (Veo, BytePlus, Kling)
- `app/src/lib/prompts.ts` — Prompt builder
- `app/src/types/index.ts` — Shared TypeScript types
- `app/src/app/api/` — API routes (generate, status, gallery, proxy-video, transcribe)
- `scripts/` — Nightly compound automation scripts
- `reports/backlog.md` — Prioritized feature backlog (read by auto-compound)

## Architecture

### Client-Driven Polling Pattern
The app uses a **client-driven polling** architecture for video generation:
1. `POST /api/generate` — creates external task, saves tracking data to KV, returns job ID immediately
2. `GET /api/status/[id]` — client polls this; each request checks external API once, updates KV
3. No background tasks or fire-and-forget — everything is request-scoped for Edge compatibility

### Storage
- **Production:** Cloudflare KV (`GLIMMER_KV` binding) with 24h TTL
- **Local dev:** In-memory `Map` on `globalThis` (survives HMR)
- All storage functions are `async` to unify the KV/memory interface

### Multi-Provider Video Generation
`veo.ts` exports two functions:
- `createVideoTask(options)` — dispatches to provider-specific create function, returns `ExternalTaskData`
- `checkVideoTaskStatus(job)` — dispatches to provider-specific check function, returns `TaskCheckResult`

Providers: `byteplus`, `veo-3.1`, `veo-3.1-fast`, `kling-ai`

### Compound Review System
On-demand via Claude Code session. Trigger: user says **"run checkup"**.
- Reviews all commits since last checkup
- Extracts learnings, updates CLAUDE.md
- Identifies improvement opportunities and next steps
- Scripts in `scripts/` are kept for reference but launchd agents are removed (company Mac permission constraints)

## Assigned Ports

**ALWAYS use these ports (never use defaults 3000/5173/8000):**
- Frontend: `3200`
- Backend: `3201` (if applicable)

## Commands

```bash
cd app && npm run dev -- --port 3200   # Dev server
cd app && npm run build                 # Production build
cd app && npm test                      # Tests
```

## Batch Video Generation

Generate multiple videos from a folder of photos using `scripts/batch-generate.mjs`.

**Quick start:**
```bash
node scripts/batch-generate.mjs /path/to/photos --email user@example.com --base-url https://glimmer.video
```

**Options:**
| Option | Values | Default |
|--------|--------|---------|
| `--clips` | 1-4 clips per photo | 3 |
| `--model` | `byteplus`, `veo-3.1`, `kling-ai` | `byteplus` |
| `--occasion` | `memorial`, `birthday`, `wedding`, `pet`, `other` | `memorial` |
| `--delay` | seconds between requests (rate limit) | 13 |
| `--base-url` | API endpoint | `http://localhost:3200` |
| `--dry-run` | list files without generating | - |

**Aspect ratio is auto-detected** from photo dimensions (portrait → 9:16, landscape → 16:9). No need to specify manually.

**Check status:** `node scripts/batch-status.mjs` or visit the gallery page.

**Example workflow:**
```bash
# 1. Put photos in a folder
# 2. Generate videos (production)
node scripts/batch-generate.mjs ~/Desktop/demo-photos \
  --email jazz@example.com \
  --clips 3 \
  --base-url https://glimmer.video

# 3. Check progress
node scripts/batch-status.mjs
```

## Project Status (Checkup 2026-02-02)

**33 total commits, 68 TypeScript files, 58 tests, deployed on Cloudflare Pages**

### Business Model
Pay-per-video credits (not subscriptions). Email-only identity (no passwords/OAuth).
- Free: 1 video per email, full quality, no watermark
- Single: NT$499 (1 credit), 5-pack: NT$1,999 (NT$400/ea)
- Enterprise: 請洽業務 (custom pricing)
- Payment: ECPay (applying), Stripe code as fallback

### What's Working
- Multi-provider video generation (BytePlus, Veo, Kling) with multi-video support
- 5 occasion types: memorial, birthday, wedding, **pet**, other
- Category-aware AI prompts (person vs pet animation styles)
- Full editor: timeline, trim, split, music, subtitles, SFX, export
- **Credit system**: email-based credits (`lib/credits.ts`), free tier + paid, idempotent webhooks
- **Payment**: Stripe Checkout via REST API (Edge-compatible), webhook with HMAC-SHA256 verification
- **Generate gating**: email validation, credit check (402 if insufficient), deduction after API success
- **Email verification**: magic link via Resend, free tier gated, paid bypass
- **R2 video storage**: archive provider CDN videos to R2, paid users 30-day TTL, backward-compat proxy
- **Completion emails**: branded bilingual notification when video is ready
- **Editor auto-save**: IndexedDB persistence with restore prompt on reload
- **Testing**: Vitest with 58 tests (timeline-utils, prompts, credits)
- Landing page: Hero, Showcase, Social Proof, Benefits, How It Works, Why Us, **Pricing (pay-per-video)**, **B2B section**, FAQ, Contact
- Video playback: raw CDN URLs for `<video src>` (CORS not needed), proxy only for editor blob/Canvas ops
- Gallery: `preload="metadata"` thumbnails + visible error states on load failure
- Rate limiting, legal pages, unified Logo component, SEO foundation
- KV abstraction layer (`lib/kv.ts`) shared across storage + credits
- R2 abstraction layer (`lib/r2.ts`) for video archival

### Next Priorities (see `reports/backlog.md`)
1. **ECPay Integration** — Swap Stripe → ECPay for Taiwan-native payments (credit card, ATM, 超商代碼, LINE Pay)
2. **Error Monitoring** — No Sentry. Production errors are invisible.
3. **OG Image** — Proper 1200x630 social card for link previews
4. **Analytics Dashboard** — Track generation counts, model usage, error rates

## Recent Learnings

- **[2026-01-30] Edge Runtime**: Cloudflare Edge workers kill background tasks after ~30s and don't share in-memory state across isolates. Never use fire-and-forget patterns (`waitUntil`, `setTimeout` polling). Use client-driven polling with persistent storage (KV) instead.

- **[2026-01-30] Edge Runtime**: Node.js `crypto.createHmac` is unavailable in Edge Runtime. Use Web Crypto API (`crypto.subtle.importKey` + `crypto.subtle.sign`) for HMAC-SHA256 JWT signing. The `btoa`/`TextEncoder` APIs are available.

- **[2026-01-30] Edge Runtime**: Node.js `fs`/`path` modules are unavailable in Edge Runtime. Any storage that relied on filesystem must be replaced with KV or in-memory alternatives. Design storage abstractions as async from the start.

- **[2026-01-30] Architecture**: When splitting sync code into an async KV-backed interface, every caller must be updated to `await`. A unified async abstraction (KV in prod, Map in dev) avoids branching logic in route handlers.

- **[2026-01-30] Deployment**: `@cloudflare/next-on-pages` peer-requires `next<=15.5.2` but the project uses Next.js 16. Adding `legacy-peer-deps=true` to `.npmrc` fixes Cloudflare's strict `npm ci` build without downgrading Next.js.

- **[2026-01-30] Build**: Turbopack's ICO decoder requires PNG frames in RGBA format (not RGB). If favicon generation produces RGB PNGs, Turbopack will fail silently or error. Always use RGBA when generating ICO files.

- **[2026-01-30] API**: For multi-provider video APIs with different status field names (`status` vs `task_status`, `succeeded` vs `success` vs `completed`), normalize at the provider boundary. The `checkVideoTaskStatus` pattern returns a uniform `TaskCheckResult` regardless of provider quirks.

- **[2026-01-30] Deployment**: When using `launchctl load` to install launchd agents, always `bootout` the existing agent first to avoid "service already loaded" I/O errors. Pattern: `launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true` before `launchctl load`.

- **[2026-01-30] Architecture**: The nightly compound system uses Claude Code CLI (`claude -p`) with `--dangerously-skip-permissions` for fully autonomous operation. The pipeline is: analyze backlog → create branch → generate PRD → break into tasks → execute loop → push → create draft PR.

- **[2026-01-30] Deployment**: macOS launchd agents spawned by the system lack Full Disk Access. Exit code 126 (`Operation not permitted`) means the script ran but `/bin/bash` was blocked by macOS security. On company Macs, prefer on-demand invocation over scheduled daemons.

- **[2026-01-30] SEO**: Next.js `'use client'` pages cannot export `metadata`. Wrap them with a `layout.tsx` in the same route directory that exports the metadata instead. This gives each route its own `<title>` and OG tags without removing client interactivity.

- **[2026-01-30] SEO**: For a Taiwan-audience app: set `<html lang="zh-Hant">`, use `locale: "zh_TW"` in Open Graph, add both Chinese and English keywords, and include JSON-LD structured data. Social previews on LINE/Facebook require `og:image` with absolute URL.

- **[2026-01-30] Performance**: `<video>` elements with `autoPlay` make the `poster` attribute invisible — the poster frame is never shown. Extracting a poster by creating a hidden `<video>` element downloads the entire video a second time for nothing. Remove poster extraction when autoPlay is used.

- **[2026-01-30] Performance**: Gallery pages with many `<video>` thumbnails should use `preload="none"` to prevent all videos from downloading simultaneously on page load. Only the actively viewed video needs `preload="auto"`.

- **[2026-01-30] Performance**: Proxy routes serving CDN content should use `Cache-Control: public, s-maxage=86400, max-age=14400` to enable Cloudflare edge caching (24h) + browser caching (4h). `private` disables CDN edge caching entirely.

- **[2026-01-30] UI**: Blob URLs from `URL.createObjectURL()` are memory leaks if not revoked. Track them with `useRef<string[]>([])` and revoke all in the `useEffect` cleanup. For components that replace blob URLs (re-export), revoke the old one before creating the new one.

- **[2026-01-30] UI**: Reusable brand components (Logo) should be extracted when the same markup appears 3+ times with slight variations. Use props (`compact`, `disableLink`) for variants instead of duplicating. This prevents drift (e.g., one page's logo not linking home while others do).

- **[2026-01-30] API**: When adding a value to a TypeScript union type (e.g., `'pet'` to `OccasionType`), every `Record<OccasionType, ...>` in the codebase must be updated. The compiler catches these — always run `npm run build` after union type changes.

- **[2026-01-30] Prompts**: Category-aware system prompts: use `getSystemPrompt(occasion)` to select between subject-specific base prompts (person: breathing/eye movement/hair vs pet: breathing/ear twitch/tail). Keep the occasion prompt layer separate for emotional styling.

- **[2026-01-31] CORS CORRECTION**: `<video src>` does NOT need CORS for basic playback — browsers load cross-origin video natively. CORS only applies to `fetch()`, Canvas `drawImage(video)`, Web Audio on video, etc. A proxy route that adds KV lookup + Edge streaming + CDN re-fetch is unnecessary for playback and introduces failure points. Use raw CDN URLs for `<video src>`, keep proxy only for editor blob/Canvas operations that need `fetch()`.

- **[2026-01-31] Architecture**: Know when proxy is needed vs not: `<video src>` = no CORS needed, `fetch()` for blobs/Canvas = CORS needed. The editor fetches video as blobs via proxy (`/api/proxy-video`) to create `ObjectURL`s for timeline manipulation. Gallery/generate pages use raw CDN URLs directly in `<video>` elements.

- **[2026-01-31] Landing Page**: The "7 Sections Every Landing Page Needs" framework: Hero (headline + visual + CTA), Solutions/Benefits, Product Showcase, Social Proof, Why Us (comparison), CTA/Pricing, FAQ. Missing any of these reduces conversion. Benefits should lead with "so what" (what it does for the user) not "what it is" (feature specs).

- **[2026-01-31] Landing Page**: When you don't have real testimonials yet, substitute with a founder story explaining why the product was created. This builds authenticity and emotional connection. Replace with real reviews as they come in.

- **[2026-01-31] Video/UX**: `preload="none"` renders as a black rectangle — no poster, no first frame, nothing loads. Users perceive this as "broken". Use `preload="metadata"` for gallery grids (loads first frame + dimensions as thumbnail). Use `preload="auto"` only for actively-playing video (modal/detail view).

- **[2026-01-31] Video/UX**: Silent `.catch(() => {})` on `video.play()` hides loading failures behind a black screen. Add `onError` handlers on `<video>` elements to show a visible error state (icon + message) so users know the link expired vs the page being broken.

- **[2026-01-31] Dev**: Next.js 16 Turbopack can corrupt its `.next/dev/` cache, causing panics ("Failed to restore task data — corrupted database or bug"). Dev server hangs or crashes on API calls. Fix: `rm -rf .next` and restart. Consider adding this to a `dev:clean` npm script.

- **[2026-01-31] Debugging**: When diagnosing "video shows black", check in order: (1) `preload` attribute, (2) whether the URL is reachable, (3) whether the URL returns valid video content-type, (4) whether the browser console shows network errors. Don't assume CORS without evidence — check the Network tab first.

- **[2026-02-01] Business Model**: Subscriptions are wrong for event-driven products (memorial videos, weddings). Users churn immediately after the event. Pay-per-video with credits that never expire aligns incentives: users buy when they need, no pressure to cancel. Free tier proves value, paid tier captures willingness-to-pay at the moment of need.

- **[2026-02-01] Business Model**: Price anchoring matters. If traditional memorial video production is NT$15,000+, pricing AI-generated videos at NT$499 (30x cheaper) feels like a steal. Pricing too low (e.g., NT$150) signals low quality and leaves money on the table. Start high, offer promotions later — raising prices after launch is much harder.

- **[2026-02-01] Business Model**: Replace fixed high-volume packs with "請洽業務" (contact sales) for enterprise. This forces funeral homes and wedding planners into a conversation where you control margins per client, instead of letting them self-serve at your lowest per-unit price.

- **[2026-02-01] Architecture**: Email-only identity (no passwords, no OAuth) is sufficient for a credit-based product. Email is the natural key for credits, purchases, and notifications. Full auth (NextAuth.js) adds complexity without value until B2B dashboards or multi-device sync are needed.

- **[2026-02-01] Edge Runtime**: Stripe Checkout can be created via raw `fetch()` to `https://api.stripe.com/v1/checkout/sessions` with `application/x-www-form-urlencoded` body — no `stripe` npm package needed. Same pattern works for any REST payment API (ECPay, NewebPay). Webhook signature verification via `crypto.subtle` HMAC-SHA256.

- **[2026-02-01] Architecture**: Extract shared KV helpers (`kvGet`, `kvPut`, `kvDelete`) into a dedicated module (`lib/kv.ts`) when multiple systems (storage + credits) need KV access. Accept optional `expirationTtl` in `kvPut` so jobs can expire (24h) while credits persist forever.

- **[2026-02-01] Payments (Taiwan)**: Stripe is uncommon for Taiwan consumers. ECPay (綠界) is the standard for small businesses — supports credit card, ATM transfer, 超商代碼 (convenience store), LINE Pay. Register as individual to start; upgrade to 行號 when revenue hits NT$240K/year.

- **[2026-02-01] Credits**: Deduct credits AFTER external API call succeeds, not before. Pattern: `checkCredits()` → fail fast 402 → `createVideoTask()` → `useCredit()`. If external task creation fails, user keeps their credit. Idempotent webhooks: check `purchase.id` against existing records before adding credits to prevent double-crediting from duplicate webhook deliveries.

- **[2026-02-02] R2 Storage**: Cloudflare R2 bindings are accessed via `getRequestContext()` just like KV — same pattern, different binding name (`GLIMMER_R2`). R2 objects persist independently of KV TTL, so even when KV job records expire, the video files remain in R2.

- **[2026-02-02] R2 Storage**: For backward compatibility when migrating from CDN URLs to R2 keys, check if the stored URL starts with `http` — if yes, fetch from CDN (legacy); if no, read from R2 (new). This lets old and new jobs coexist without migration.

- **[2026-02-02] Auto-Save**: IndexedDB is ideal for client-side auto-save of complex editor state — handles structured data, large payloads, and doesn't block the main thread. Strip session-specific fields (`blobUrl` from Object URLs) before saving. On restore, re-fetch sources to recreate blobUrls.

- **[2026-02-02] Editor**: Debounce auto-save (1s) and skip UI-only actions (`SET_PLAYHEAD`, `SET_PLAYING`, `SELECT_CLIP`, etc.) to avoid unnecessary writes. Track which action triggered the state change via a ref, not by comparing state diffs.

- **[2026-02-02] Testing**: Vitest with `vi.mock('./kv')` cleanly isolates modules that depend on Cloudflare bindings. Mock the lowest abstraction layer (KV helpers) rather than `getRequestContext()` — tests then exercise real business logic.

- **[2026-02-15] Cloudflare Pages**: EVERY new route (page or API) MUST have `export const runtime = 'edge';` or Cloudflare Pages build fails. For `'use client'` pages, add a `layout.tsx` in the same directory that exports the runtime config (client components can't export server config). **Checklist when creating new routes:** (1) API route → add `export const runtime = 'edge';` at top, (2) Client page → create sibling `layout.tsx` with runtime export, (3) Server page → add runtime export directly. Build locally before pushing to catch this.

- **[2026-02-15] R2 Video URLs**: Videos archived to R2 are stored with keys like `videos/{jobId}/0.mp4` (not full URLs). These keys don't work as direct `<video src>` — browsers try to load them as relative paths. **Solution:** Transform R2 keys to proxy URLs (`/api/proxy-video?jobId=xxx&index=0`) in API responses. Check: if `!url.startsWith('http')` → it's an R2 key, use proxy. CDN URLs (starting with `http`) work directly. Apply this transformation in ALL APIs that return `videoUrl` (gallery, projects, status, batch-status).

- **[2026-02-16] FFmpeg/Audio**: AI-generated videos from photo animation providers (Veo, BytePlus, Kling) often have **no audio track**. FFmpeg commands that assume audio exists will fail with `Stream map '0:a:0' matches no streams`. **Always probe before processing:** use `ffprobe -select_streams a -show_entries stream=codec_type` to detect audio presence. If missing, add silent audio with `-f lavfi -i anullsrc=r=44100:cl=stereo` before applying audio filters.

- **[2026-02-16] FFmpeg/Concat**: When concatenating clips with `-map 0:a:0`, FFmpeg fails if ANY input lacks audio. **Two-layer fix:** (1) Pre-process: detect and add silent audio to video-only clips before concat, (2) Safety net: use optional mapping `-map 0:a:0?` (the `?` makes the stream optional — FFmpeg 4.1+). This prevents "Invalid argument" errors from audio-less clips.

- **[2026-02-16] FFmpeg/Debugging**: When FFmpeg fails with `Failed to set value 'X' for option 'map'`, the issue is stream mapping, NOT file access. Check `ffprobe -show_streams` on each input to verify expected streams exist. Common culprits: AI-generated video (no audio), screen recordings (no audio), re-encoded clips (stripped audio). The error message points to the `-map` flag, not the actual missing stream — read carefully.

- **[2026-02-16] Cloud Run/Debugging**: Cloud Run logs (`gcloud run logs read`) are essential for debugging server-side FFmpeg failures. The error shown to the client ("Failed to concatenate clips") is generic — the actual FFmpeg stderr in logs reveals the root cause. Always check server logs before assuming client-side or network issues.

- **[2026-02-26] R2 Archival**: Videos are **automatically archived to R2** when generation completes (`archiveVideos()` in `/api/status/[id]`). R2-archived videos use proxy URLs (`/api/proxy-video?jobId=xxx`) and **never expire**. CDN URLs (starting with `http`) expire in 24h. When showing expiration warnings in UI, check `videoUrl.startsWith('/api/proxy-video')` — if true, skip the warning. The archival silently falls back to CDN URLs if `GLIMMER_R2` binding is not configured in Cloudflare Pages.

- **[2026-02-26] Admin Cleanup**: Use `POST /api/admin/cleanup` to bulk-delete jobs with expired video URLs. Supports `dryRun: true` to preview. The endpoint does a HEAD request to each CDN URL to check if it's still valid — R2 proxy URLs are always considered valid.

- **[2026-02-26] Feature Gating**: Pattern for restricting features to paid users: (1) `/api/access?email=xxx` returns `{ hasPaidAccess, isAdmin }`, (2) `useAccess()` hook fetches and caches this, (3) `<AccessGate>` wrapper redirects to `/upgrade` if not paid. Gate pages by wrapping with AccessGate, gate UI elements with conditional rendering based on `hasPaidAccess`.

- **[2026-02-26] Admin User Management**: `/api/admin/users` provides user lookup (GET) and credit granting (POST). Admin grants are stored as purchases with `provider: 'admin'`, `adminGrantedBy`, and `adminReason` fields. The admin page has a Users tab with search, user details (credits, purchases, jobs), and grant credits form.

- **[2026-02-26] Lighthouse Audit**: Site scores: Performance 86, Accessibility 98, Best Practices 100, SEO 100. Key metrics: FCP 2.3s, LCP 3.4s, TBT 10ms, CLS 0. Common fix: add `<main>` landmark wrapping content between header and footer for accessibility. Server response time (~1.4s) is Cloudflare edge cold start — not much to optimize there.

- **[2026-02-28] Video Generation Aspect Ratio**: Portrait photos need `9:16`, landscape need `16:9`. If mismatched, AI providers crop faces. **Now auto-detected**: `/api/generate` uses `image-size` to detect photo orientation and sets aspect ratio automatically. No manual specification needed.

- **[2026-02-28] Video Prompts - Less is More**: Overly detailed prompts can confuse AI video generators. Instructions like "gentle smile", "happy expression" cause the AI to distort faces creepily. Framing instructions may be ignored or misinterpreted causing worse crops than default. **Start with empty/minimal prompts** to see the model's default behavior, then add constraints only if needed. BytePlus Seedance works better with simple, short prompts.

- **[2026-02-28] FFmpeg xfade Transitions**: Cloud Run export service now supports 13 transition types via FFmpeg `xfade` filter. Pattern: `[0:v][1:v]xfade=transition=fade:duration=0.5:offset=4.5[v]` where offset = cumulative duration - transition duration. For audio: use `acrossfade` filter. **Both filters require all inputs to have video/audio streams** — always add silent audio to video-only clips first.

- **[2026-02-28] Showcase Video Arsenal**: Three-tier system for creating showcase videos: (1) **Gallery multi-select** — checkbox mode + selection bar with clip count, (2) **Showcase builder** — `/showcase?clips=jobId:index,jobId:index` URL, clip reordering, template picker, (3) **Template quick-apply** — one-click sets title card, outro card, and all transitions. Templates live in `lib/templates.ts`, editor panel in `components/editor/TemplatePanel.tsx`.

- **[2026-02-28] Edge Runtime Reminder**: When creating new `'use client'` pages, **ALWAYS create a sibling `layout.tsx`** with `export const runtime = 'edge';`. Client components cannot export runtime config directly. This is the #1 cause of Cloudflare Pages build failures. Checklist: (1) New client page → create `layout.tsx` with runtime export, (2) New API route → add runtime export at top, (3) New server page → add runtime export directly.

- **[2026-02-28] Transition Type Migration**: When changing enum values (e.g., renaming 'crossfade' → 'fade'), add migration logic in auto-save restore. Pattern in `auto-save.ts`: check if old value exists, map to new value, fall back to default for unknown types. This prevents crashes when users have old saved state in IndexedDB.

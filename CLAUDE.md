# CLAUDE.md — 拾光 Glimmer

> **Root conventions apply:** See `../CLAUDE.md` for coding guardrails, plan mode structure, and learned rules protocol.

## Project Overview

**拾光 Glimmer** is an AI-powered memorial video generation platform. Users upload photos and the app generates cinematic videos via one AI provider (BytePlus Seedance, internal id `byteplus`).

**Stack:** Next.js 16, React, TypeScript, Tailwind CSS, Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`, Node runtime), Cloudflare KV, Cloudflare R2

Deployed as the Worker `glimmer-worker` (route `glimmer.video/*`). The old Pages project `glimmer` is kept, auto-builds off, as a rollback.

## Folder Structure

```
app/                          # Next.js application
├── src/
│   ├── app/                  # Pages and API routes (App Router)
│   │   ├── api/              # 35 API routes (Node runtime on Workers)
│   │   │   ├── generate/     # Video generation (POST)
│   │   │   ├── status/[id]/  # Job status polling (GET)
│   │   │   ├── gallery/      # Gallery listing + detail
│   │   │   ├── admin/        # Overview, users, cleanup (admin-gated)
│   │   │   ├── checkout/     # ECPay checkout
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
│   │   ├── lifecycle.ts      # Status transition tables + isTerminal* predicates (pure, client-safe)
│   │   ├── job-settle.ts     # settleJob / archiveIfNeeded — the only code that moves a job out of `processing`
│   │   ├── export-poll.ts    # waitForExport — the one client loop for server exports
│   │   ├── storage.ts        # KV/in-memory job storage abstraction (enforces lifecycle.ts on write)
│   │   ├── kv.ts             # Low-level KV helpers (kvGet, kvPut, kvDelete, getKV)
│   │   ├── r2.ts             # R2 video archival
│   │   ├── veo.ts            # BytePlus Seedance video generation (single provider)
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
2. `GET /api/status/[id]` — client polls this; each request calls `settleJob()` (`lib/job-settle.ts`), which checks the external API once, updates KV, archives to R2 on completion
3. No background tasks or fire-and-forget — everything is request-scoped for Edge compatibility

### Storage & Video Lifecycle
- **KV** (`GLIMMER_KV`): Job records (24h TTL), credits (no TTL), rate limits
- **R2** (`GLIMMER_R2`): Archived videos (permanent). Auto-archived when generation completes via `archiveVideos()` in status route.
- **Local dev:** In-memory `Map` on `globalThis` (survives HMR). All storage functions are `async`.
- **Video URL resolution:** R2 keys (not starting with `http`) → proxy URL (`/api/proxy-video?jobId=xxx&index=0`). CDN URLs (starting with `http`) used directly. Consolidated in `lib/video-url.ts`.

### Video Generation (single provider)
There is one provider: BytePlus Seedance, internal id `byteplus` (`ModelType` is just that). Veo and Kling are gone. `veo.ts` creates tasks and `checkBytePlusTasks` returns a `TaskCheckResult` that reports a per-video outcome. Customer-facing UI never names the vendor or model.

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
| `canTransitionJob`, `isTerminalBatchStatus`, `deriveBatchStatus`, … | `@/lib/lifecycle` | Status rules. Never compare status strings to decide "is it done" — use a predicate |
| `settleJob`, `archiveIfNeeded` | `@/lib/job-settle` | Never call `checkVideoTaskStatus` + `setJobComplete` from a route |
| `waitForExport` | `@/lib/export-poll` | Never hand-roll an `/api/export-status` loop |

## Assigned Ports

**Dev ports (each monorepo project has its own range, so defaults like 3000/5173/8000 collide):**
- Frontend: `3200`
- Backend: `3201` (if applicable)

## Commands

```bash
cd app && npm run dev -- --port 3200   # Dev server
cd app && npm run build                 # Production build
cd app && npm test                      # Tests (Vitest)
```

## Batch Video Generation

**ALWAYS use production** (`--base-url https://glimmer.video`). Local dev lacks KV/R2 bindings.

```bash
# Generate
node scripts/batch-generate.mjs /path/to/photos --email user@example.com --base-url https://glimmer.video

# Check status
node scripts/batch-status.mjs --base-url https://glimmer.video
```

Options: `--clips 1-4` (default 3), `--model byteplus` (the server accepts only byteplus today), `--occasion memorial|birthday|wedding|pet|other`, `--delay` seconds, `--dry-run`. Aspect ratio auto-detected from photo dimensions.

## Business Model

Pay-per-generation credits (not subscriptions). Passwordless identity: a typed, verified email, plus optional Google sign-in or an email login link that mints a signed session.
- Free: 3 generations per email (`FREE_GENERATIONS` in `src/types/index.ts`), full quality, no watermark
- Credit packs: 20 點 NT$299, 50 點 NT$599 — single source of truth in `src/lib/packs.ts`
- Enterprise: 請洽業務 (contact sales)
- Payment: ECPay (Taiwan-native) only; there is no Stripe code

## CI/CD

- **Deployment:** GitHub Actions (`.github/workflows/ci.yml`): every push runs tests + build; on `main` the `deploy` job then runs `opennextjs-cloudflare build && deploy` with a token scoped to glimmer-worker only (repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). Check with `gh run list --repo jazzpujols34/glimmer`.
- **Never deploy from a laptop:** the OpenNext build bakes `.env*` files into the Worker, so a local build ships `.env.local` (local keys, `ECPAY_TEST_MODE=true`). If you must, move `.env.local` aside first and check `.open-next/cloudflare/next-env.mjs` is empty.
- **Build:** `next build --webpack` (Turbopack in 16.4 rejects `@ffmpeg/ffmpeg`'s worker URL). `next.config.ts` aliases `nsfwjs` to false on the server: its ~37 MiB of browser-only model weights otherwise land in the Worker.
- **Runtime config:** secrets live on the Worker (`npx wrangler secret list --name glimmer-worker`), not in Pages. `NEXT_PUBLIC_*` are build-time: `NEXT_PUBLIC_MAINTENANCE_MODE` is the GitHub repo variable (`gh variable set ... --repo jazzpujols34/glimmer`), then re-run the deploy job.
- **Size:** Worker limit 64 MiB uncompressed; we are ~12 MiB (one bundle, so a new route costs almost nothing). The old 25 MiB Pages limit and the per-function overhead notes below no longer apply.
- **Export service:** Cloud Run with FFmpeg for server-side video export (concat, transitions, title cards)
- **No `export const runtime = 'edge'`** anywhere: OpenNext runs the Node runtime. A `route.ts` may export only HTTP handlers (Next 16.4 type check), so shared constants go in `src/lib`.
- **DNS:** `glimmer.video` still has a proxied record pointing at the old Pages host; the Worker route intercepts it. Rollback = delete the route `glimmer.video/*` and re-add `glimmer.video` as a custom domain on the Pages project.

## Common Gotchas

### Runtime Constraints (Workers)
- No `fs`, `path`, `crypto.createHmac` — use Web Crypto API (`crypto.subtle`) for HMAC
- No background tasks (`waitUntil`, `setTimeout` polling) — use client-driven polling + KV
- In-memory state not shared across isolates — always use KV for persistence
- ECPay via raw `fetch()` — no SDK package needed

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

- **[2026-11-17] Moved from next-on-pages (Pages) to OpenNext (Workers), Next 16.1.4 → 16.4.6.** Why: 43 per-route functions each carried a ~320 KiB copy of the Next runtime (23.3 of 25 MiB), which blocked the Next security upgrade. Bindings come from `getCloudflareContext({ async: true })` in `kv.ts`/`r2.ts`. Same KV and R2, so no data moved. Five React Compiler lint rules new in eslint-config-next 16.4 are off in `eslint.config.mjs` (26 existing hits), cleanup pending. Same day: `verifyCheckMacValue` now rejects when the ECPay hash keys are empty (an empty key makes the MAC computable by anyone). Admin secret was rotated during the move. The entries below about the 25 MiB limit, function overhead and the Next hold are history.

- **[2026-10-07] Next stays pinned at 16.1.4 — HOLD, re-review by 2026-11-07.** Two critical advisories ask for 16.3.3: GHSA-p293-qw3h-jr36 (RCE on Windows-hosted servers) and GHSA-2xp9-vwfh-vxw4 (RCE in the Image Optimization API via AVIF). Neither path runs here: prod is Cloudflare Pages via next-on-pages, not a Windows Node server, and `/_next/image` is a passthrough (probe 2026-10-07: `glimmer.video/_next/image?url=%2Ffavicon.ico&w=64` returned the original `.ico` bytes, i.e. Next's sharp optimizer never executes). Dependabot alerts 153-156 were dismissed as `not_used` with this reasoning, approved by Jazz. The bump itself is blocked by the 25 MiB bundle limit (entry below). Real fix = bundle diet, or migrate off the deprecated `@cloudflare/next-on-pages` to `@opennextjs/cloudflare`, done against a preview deployment. Re-open the hold at once if prod ever moves off Cloudflare or a new Next advisory hits an edge-reachable path (middleware, server actions, RSC).

- **[2026-08-02] Progressive Google identity Phase 2b enforcement — LIVE (flag ON in prod).** Merged (`de1293b`) and `REQUIRE_SESSION_FOR_PAID=true` set in CF Pages + redeployed (`2a4d92d`), verified live end-to-end (throwaway-email probe: no `sessionreq` marker → passes through; marker set → 401 `SESSION_REQUIRED`). `enforceIdentity()` (`src/lib/identity.ts`) is wired into the spend/destructive routes (`generate`, `generate-batch`, `quick-generate`, `transcribe`, and the DELETE/batch-delete handlers on `gallery`/`projects`/`storyboards`) — with the flag OFF every wired route was byte-identical to pre-Phase-2b (proven by all 366 pre-existing tests green, flag unset); with it ON, a valid session wins (spoof-proof) and an account carrying `sessionreq:<email>` is refused typed-email spend/delete without a session. Auto-migrate: the OAuth callback writes `sessionreq:<email>` at sign-in, so an account only becomes session-required once it has signed in — a never-signed-in email (e.g. Albert today) is never locked out. Recovery from lockout = the app-wide "Sign in with Google" button. GET/list reads deliberately left unwired (deferred). KV write propagation to the edge can lag up to ~60s. Bundle: 24.899 → 24.933 MiB, ~67 KiB headroom — **the deferred follow-ups (magic-link email session for non-Google users, self-serve verify-to-claim linking, GET/list enforcement) each need a bundle fold-or-retire first.**

- **[2026-08-02] Progressive Google identity Phase 1** (merged `dc73212`; superseded by the Phase 2b entry above, which made sessions enforced) — session library (`src/lib/session.ts`, Web Crypto HMAC-SHA256, no jose dep), one OAuth catch-all route (`src/app/api/auth/[...auth]/route.ts`: login/callback/session/logout), a dormant `resolveIdentity()` bridge (`src/lib/identity.ts`, session → `submap:<sub>` → email), and a "Sign in with Google" button in the landing header. Nothing requires a session yet — every existing route still resolves identity by client-typed email exactly as before. Bundle only fit under 25 MiB by first folding `/api/access` into `/api/credits` (Step 0, see the corollary below) to net one function back before adding the new auth route: 24.878 → 24.561 → 24.886 MiB, ~114 KiB headroom left afterward — the next new route on this app needs its own fold-or-retire first. Phase 2 (enforcing sessions on money/PII routes) is a separate, later change — see `docs/oauth-identity-design.html`.

- **[2026-08-02] Progressive Google identity Phase 2a: session wakes up on the client** (merged `86fa744`) — `/api/auth/session` now returns the email resolved through `resolveIdentity()` (submap-mapped, not the raw session claim), and a new no-render `SessionIdentitySync` component (mounted once in `src/app/layout.tsx`) fetches it on load and promotes it into `localStorage['glimmer_email']` when it differs, dispatching a `storage` event so already-mounted pages (`create/page.tsx`) pick it up without a manual refresh. Decision logic (`resolveSyncedEmail`) lives in `src/lib/session-sync.ts`, split out purely so it's unit-testable — this repo's vitest config is `environment: 'node'` with `include: ['src/**/*.test.ts']` only, i.e. **no component-rendering tests exist or are supported without adding `@testing-library/react`**; keep React glue thin and push logic into plain `.ts` modules to stay testable under the current harness. `AuthButton` was considered as the sync point but only mounts on the landing page (`src/app/page.tsx`), never `/create` — confirms a shared-header-less app needs the root-layout home, not a per-component fix. Still display/client-identity only — no route enforces the session (Phase 2b). Bundle: 24.886 → 24.899 MiB, ~101 KiB headroom left.

- **[2026-08-02] CF Pages has a 25 MiB Functions bundle limit and ONLY Cloudflare's deploy step enforces it** — local `next build` AND local `npx @cloudflare/next-on-pages` both pass on a bundle that CF rejects ("Generated Pages Functions bundle size is over the limit of 25.0 MiB"). The Next 16.1.4→16.2.12 bump inflated the worker to 26.03 MiB and **silently broke every deploy from 2026-08-01 until the revert (`9fc180d`)**; prod kept serving the last good build, so nothing looked wrong. Before ANY dep bump or large feature: build with `npx @cloudflare/next-on-pages`, then measure `find .vercel/output/static/_worker.js -name "*.js" -o -name "*.wasm" | xargs stat -f%z | awk '{s+=$1} END {print s/1048576}'` — headroom is under 100 KiB (see the newer bundle note above for the latest figure). Retrying the Next 16.2.x upgrade REQUIRES a bundle diet first, done against a preview deployment. After every push to main, verify the deployment actually succeeded (`npx wrangler pages deployment list --project-name=glimmer`) — a red build is silent otherwise. Build logs are fetchable via the CF API: `GET /accounts/{acct}/pages/projects/glimmer/deployments/{id}/history/logs` with wrangler's OAuth token.
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

- **[2026-11-13] Provider failures are refunded, with a cap**: each job stores its `charge` ({free, paid, ref}); `refundIfOwed()` in `lib/job-settle.ts` gives it back when the provider fails the job, when a job is still `processing` after 3 hours, or (a share, rounded up) when some of several versions fail — the good versions are kept (`failedVideos`). `refundCredits` applies a charge ref at most once inside the credit record write, so racing polls cannot double-refund. `refundedCredits` is written only after the refund is; the UI reads it, and the stored `error` text never claims a refund. Auto-refunds are capped at 3 per person (`canonicalFreeTierEmail`) and 5 per IP per day; past that the job is `refundHeld` and the admin Telegram chat is alerted (RUNBOOK "退點待審"). Nothing runs on a timer: an overdue job is settled when its owner loads the gallery (`settleOverdue`) or the status route is polled. Jobs created before this change have no `charge` and are never auto-refunded. Removing `@google/genai` (Veo, never enabled) took the Functions bundle from 24.67 to 23.29 MiB.

- **[2026-11-13] Status lifecycles are explicit**: `lib/lifecycle.ts` holds the legal transitions (job: queued → processing → complete|error; batch: … → complete|partial|error; quick: generating → exporting → complete|error) and `storage.ts` refuses anything else as a logged no-op — KV has no compare-and-set, so two polls settling one job is normal and the first write wins. A new status value means: add it to the table, then the compiler and `storage-lifecycle.test.ts` show what else must change. Jobs only leave `processing` through `settleJob()`; the gallery "Refresh" button (`POST /api/gallery`) is just a bulk call of it. Only the provider reporting a task `failed` is a failure: a status call that cannot be made (429/5xx/rotated key) leaves the job running at any age. The export service answers in camelCase (`r2Key`) — `quick-status` read `r2_key` for nine months and the quick flow could never finish.

- **[2026-02-28] FFmpeg xfade**: 13 transition types via `xfade` filter. Both `xfade` and `acrossfade` require all inputs to have video+audio streams — add silent audio to video-only clips first.

- **[2026-02-28] Showcase Arsenal**: Three-tier system: gallery multi-select → showcase builder (`/showcase?clips=...`) → template quick-apply. Templates in `lib/templates.ts`.

- **[2026-03-13] R2 Archival Retry**: Archival (CDN→R2) used to get one shot at completion time. If it failed silently, CDN URL was stored and expired in 24h — video lost forever. Now both `/api/status` and `/api/gallery` retry archival for any job with `archived=false` and CDN URLs present. Multiple retry windows across the 24h CDN lifetime.

- **[2026-02-26] R2 Archival**: Videos auto-archived when generation completes. R2 proxy URLs never expire. CDN URLs expire in 24h.

- **[2026-02-26] Feature Gating**: `/api/credits` (access folded in) → `useAccess()` hook → `<AccessGate>` wrapper. Admin grants stored as purchases with `provider: 'admin'`.

- **[2026-02-02] Auto-Save**: IndexedDB for editor state. Debounce 1s, skip UI-only actions. Strip `blobUrl` before saving, re-fetch on restore. Migration logic for renamed enum values.

- **[2026-02-01] Credits**: Deduct AFTER external API success, not before. Idempotent webhooks: check `purchase.id` before adding credits.

- **[2026-02-01] Business Model**: Pay-per-video > subscriptions for event-driven products. Price anchor against traditional production (NT$15,000+ vs a NT$299 pack). Enterprise = "contact sales" to control margins.

- **[2026-01-31] Landing Page**: 7-section framework: Hero, Benefits, Showcase, Social Proof, Why Us, Pricing, FAQ. Founder story substitutes for missing testimonials.

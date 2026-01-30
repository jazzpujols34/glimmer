# CLAUDE.md — 拾光 Glimmer

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

## Commands

```bash
cd app && npm run dev     # Dev server
cd app && npm run build   # Production build
cd app && npm test        # Tests
```

## Project Status (Checkup 2026-01-30)

**24 total commits, 56 TypeScript files, deployed on Cloudflare Pages**

### What's Working
- Multi-provider video generation (BytePlus, Veo, Kling)
- 5 occasion types: memorial, birthday, wedding, **pet**, other
- Category-aware AI prompts (person vs pet animation styles)
- Full editor: timeline, trim, split, music, subtitles, SFX, export
- Landing page with bilingual content, JSON-LD, OG tags
- Rate limiting (3 req/min generate, 30 req/min status, 5 req/min transcribe)
- Legal pages (terms, privacy)
- Unified Logo component across all pages

### Improvement Opportunities
1. **R2 Video Storage** — Videos are served directly from BytePlus CDN. URLs expire in 24h. Copying to Cloudflare R2 would give permanent URLs and faster delivery in Asia.
2. **User Authentication** — No auth yet. Rate limiting is IP-based only. Adding auth enables per-user quotas, saved gallery, and payment integration.
3. **Payment Integration** — Pricing tiers are display-only. Stripe or local payment (LINE Pay, 街口) needed to monetize.
4. **Testing** — No unit or integration tests exist. Key areas: prompt builder, storage abstraction, rate limiter, API routes.
5. **Error Monitoring** — No Sentry or similar. Production errors are invisible.
6. **OG Image** — Using the logo JPEG as og:image. A proper 1200x630 social card would improve click-through from LINE/Facebook shares.
7. **Video Thumbnails** — Gallery shows `<video>` elements with `preload="none"`. First-frame thumbnails (via server-side ffmpeg or canvas snapshot) would load faster.
8. **i18n** — Currently hardcoded bilingual (Chinese + English inline). Consider `next-intl` if full language switching is needed.
9. **Editor Mobile UX** — Timeline editor is desktop-optimized. Mobile users get a cramped experience.

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

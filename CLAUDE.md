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

### Nightly Compound System
Automated via macOS launchd agents:
- **10:30 PM** — `daily-compound-review.sh`: reviews git activity, updates CLAUDE.md with learnings
- **11:00 PM** — `auto-compound.sh`: picks #1 backlog item, creates PRD → tasks → implementation → draft PR
- **5:00 PM** — `caffeinate`: keeps Mac awake until 2 AM

## Commands

```bash
cd app && npm run dev     # Dev server
cd app && npm run build   # Production build
cd app && npm test        # Tests
./scripts/setup-launchd.sh     # Install nightly agents
./scripts/teardown-launchd.sh  # Remove nightly agents
```

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

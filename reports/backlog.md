# 拾光 Glimmer — Prioritized Backlog

> This file is read by the nightly auto-compound system.
> The agent picks the first item NOT marked [DONE] or [IN PROGRESS].
> Keep highest priority at top.
>
> **Business model:** Pay-per-video credits (not subscriptions).
> Free: 1 video per email. Paid: NT$499/video or NT$1,999/5 pack. Enterprise: 請洽業務.
> Identity: email-only (no passwords, no OAuth). All models/resolutions available to all tiers.
> Payment: ECPay (applying). Stripe checkout code exists as fallback.

## Priority 1: ECPay payment integration [DONE]
Replace Stripe checkout with ECPay (綠界) for Taiwan-native payment methods.
- ✅ Swap `/api/checkout/route.ts` to create ECPay payment form (credit card, ATM, 超商代碼, LINE Pay)
- ✅ Swap `/api/webhooks/stripe/route.ts` to ECPay callback handler (ReturnURL + NotifyURL pattern)
- ✅ ECPay signature verification (SHA256 CheckMacValue) via Web Crypto API (Edge-compatible)
- ⏳ Test with ECPay sandbox environment (waiting on merchant approval)
- ✅ Stripe code removed (commit `a043804`)
**Status:** Code complete, blocked on ECPay merchant application approval

## Priority 2: Email verification (magic link) [DONE]
- Magic link via Resend REST API (`lib/email.ts`)
- Token in KV with 15min TTL, one-time use, email match validation
- `isEmailVerified()` / `setEmailVerified()` in `lib/credits.ts`
- Free tier gated behind verified email; paid credits bypass (403 if unverified)
- Create page: verify button, "已寄出驗證信" state, URL param handling (`?verified=1`)
- Rate limited: 3/IP/10min, 5/email/hour

## Priority 3: R2 video storage [DONE]
- R2 abstraction (`lib/r2.ts`) using `getRequestContext()` (same pattern as KV)
- `archiveVideos()`: downloads from provider CDN → uploads to R2 as `videos/{jobId}/{i}.mp4`
- Status polling endpoint archives on completion, stores R2 keys in KV
- Proxy-video reads from R2 for archived jobs, CDN fetch for legacy jobs
- Paid users: 30-day KV TTL. Free: 24h (unchanged). R2 objects persist independently.
- **Setup needed:** Create R2 bucket `glimmer-videos`, add `GLIMMER_R2` binding in Pages settings

## Priority 4: Email notification on completion [DONE]
- `sendCompletionEmail()` in `lib/email.ts` with branded bilingual HTML
- Fire-and-forget call after `setJobComplete()` in status polling endpoint
- Links to `/generate/{jobId}` for viewing

## Priority 5: Editor auto-save [DONE]
- IndexedDB persistence (`lib/editor/auto-save.ts`)
- 1s debounced save on persistent state changes (skips UI-only actions)
- Restore prompt on editor load: shows clip/subtitle/music counts and time ago
- Re-fetches blobUrls from proxy on restore (blobUrls are session-specific)
- RESTORE action in EditorContext reducer

## Priority 6: Landing page and pricing [DONE]
- Landing page with all sections (Hero, Showcase, Social Proof, Benefits, How It Works, Why Us, Pricing, B2B, FAQ, Contact)
- Pay-per-video pricing cards (Free / NT$499 / NT$1,999 / 請洽業務)
- "For Businesses" section for funeral homes, wedding planners, event companies
- Updated FAQ for credit model (no subscription references)
- Contact email: glimmer.hello@gmail.com

## Priority 7: Credit system and generate gating [DONE]
- Email-based credit system (`lib/credits.ts`)
- Free tier: 1 video per email (KV: `free:{email}`)
- Paid credits: never expire (KV: `credits:{email}`)
- Idempotent webhook handling (duplicate purchase protection)
- Credit check before generation, deduction after external API success
- Stripe checkout + webhook (Edge-compatible REST API, no SDK)
- Email input + credit balance UI on create page
- Purchase success page with retry polling

## Priority 8: Testing [DONE]
- Vitest setup (`vitest.config.ts`) with `@/` path alias
- 58 tests across 3 files:
  - `timeline-utils.test.ts` (30): clip duration, total duration, snapping, ripple delete, active elements
  - `prompts.test.ts` (12): occasion prompts, task prompts, prompt building
  - `credits.test.ts` (16): email validation, credit checking, usage, purchases, idempotency, verification
- KV mocked via `vi.mock('./kv')`

## Priority 9: Error monitoring [DONE]
- Sentry HTTP API integration (`lib/errors.ts`) — SDK doesn't work on Cloudflare Edge
- `captureError()` / `captureWarning()` with structured context
- DSN parsing, stack frame extraction, fire-and-forget reporting
- Tracks: generation failures, payment webhook errors, API errors

## Priority 10: OG image and social sharing [DONE]
- ✅ Proper 1200x630 social card (`opengraph-image.tsx`, `twitter-image.tsx`)
- ✅ Dynamic OG image for `/generate/[id]` with video-ready preview
- ✅ Share buttons (LINE, Facebook) on video completion page
- ✅ Layout with OG meta tags (title, description, og:type=video.other)

## Priority 11: Analytics dashboard [DONE]
- ✅ GA4 tracking (`lib/analytics.ts`) with custom events
- ✅ Tracks: generation start/complete, purchases, storyboard creation, video exports
- ✅ Admin page at `/admin` with visual dashboard
- ✅ Email whitelist auth (ADMIN_EMAILS env var)
- ✅ Shows: jobs, users, revenue, model/occasion usage, recent activity

## Priority 12: Multi-language support (i18n) [DONE]
- ✅ i18n infrastructure with React Context (`lib/i18n/context.tsx`)
- ✅ Translation files for zh-TW and en (`lib/i18n/translations.ts`)
- ✅ LanguageToggle component with browser language detection
- ✅ LocalStorage persistence for language preference
- ✅ Applied to landing page, create page, gallery page

## Priority 13: Batch generation [DONE]
- ✅ Upload N photos → generate N-1 video segments (first-last-frame mode)
- ✅ BatchJob type in `types/index.ts`, batch CRUD in `storage.ts`
- ✅ `/api/generate-batch` endpoint with credit check (1 credit per segment)
- ✅ `/api/batch-status/[batchId]` for polling progress
- ✅ `/batch/[batchId]` page with progress grid, video preview modal
- ✅ Batch toggle on create page with visual photo transition preview
- ✅ Auto-creates project to group all batch segments
- ✅ Partial failure handling (some segments can fail while others succeed)
- ✅ Bilingual i18n translations

## Priority 14: Video watermark for free tier [DONE]
- ✅ FFmpeg drawtext overlay "Made with 拾光 Glimmer" in Cloud Run export service
- ✅ Watermark applied for free tier users only
- ✅ Paid users (paidTotal > 0) and admins get no watermark
- ✅ Email passed through editor context → API → Cloud Run
- ✅ Works for both editor exports and storyboard exports

## Future / Phase 2
- **B2B dashboard**: Business accounts with sub-users, unified billing, usage reports
- **Full auth (NextAuth.js)**: Only if B2B dashboard or multi-device sync demands it
- **ECPay/NewebPay local payment**: 超商代碼, ATM transfer, LINE Pay (once ECPay approved)
- **Editor mobile UX**: Timeline editor is desktop-optimized

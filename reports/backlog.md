# 拾光 Glimmer — Prioritized Backlog

> This file is read by the nightly auto-compound system.
> The agent picks the first item NOT marked [DONE] or [IN PROGRESS].
> Keep highest priority at top.

## Priority 1: User authentication and usage tracking
Add auth using NextAuth.js with email magic link + Google OAuth.
- Create user accounts in KV (user:{id} → {email, plan, videosUsed, createdAt})
- Protect /api/generate, /api/transcribe, /gallery behind auth
- Track per-user video generation count per month
- Enforce free tier limit (2 videos/month)
- Add login/signup UI on the create page
- Add user avatar + logout in header
Edge-compatible: use JWT sessions (no database sessions).

## Priority 2: Payment integration with Stripe
Connect Stripe Checkout for Standard ($9.99/mo) and Pro ($29.99/mo) tiers.
- Create /api/stripe/checkout — generates Stripe Checkout session
- Create /api/stripe/webhook — handles subscription events (created, cancelled, updated)
- Store subscription status in KV user record (plan: 'free' | 'standard' | 'pro')
- Gate model selection based on tier (free = BytePlus only)
- Gate resolution based on tier (free = 720p only)
- Gate monthly quota (free: 2, standard: 15, pro: 60)
- Add /pricing page with tier comparison and checkout buttons
- Add /account page with billing portal link

## Priority 3: Video persistence with Cloudflare R2
Currently video URLs expire in 24 hours. For a paid product, this is unacceptable.
- Create R2 bucket for permanent video storage
- After video generation completes, download from CDN → store in R2
- Serve videos via R2 public URL or signed URL
- Free tier: 24h expiry (current behavior). Paid: 30 days.
- Update gallery to load from R2 URLs
- Add download button that works forever (within retention period)

## Priority 4: Email notification on video completion
Send an email when a video generation job completes (success or error).
Use Resend or Cloudflare Email Workers. Include a link to view/download.
Requires auth (Priority 1) to know user's email address.

## Priority 5: Editor auto-save
The video editor currently loses all work on browser crash/navigation.
- Save editor state to IndexedDB every 30 seconds
- On page load, check for unsaved session and offer to restore
- Add manual save/load project buttons
- Critical for paid users editing long memorial videos

## Priority 6: Landing page merge and polish [DONE]
Merge feature/landing-page branch. Fix showcase section with real demo videos.
Add pricing section that links to /pricing (after Priority 2).

## Priority 7: Analytics dashboard
Track generation counts, model usage, error rates, avg generation time.
Simple admin page at /admin with charts. Requires auth (Priority 1).

## Priority 8: Video watermark for free tier
Add a small "Made with 拾光 Glimmer" watermark overlay on free-tier videos.
Paid tiers get watermark-free exports. Applied during FFmpeg export.

## Priority 9: Multi-language support (i18n)
Add language toggle (繁中/English) across the entire app, not just the
landing page. Use next-intl or a simple context-based approach.

## Priority 10: Social sharing
Add share buttons (LINE, Facebook, Instagram) on the video completion page.
Generate OG image/video meta tags for link previews.

## Priority 11: Batch generation
Allow uploading multiple photos and generating one video per photo in a
single batch job. Show progress for all jobs on a batch status page.

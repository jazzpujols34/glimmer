# 拾光 Glimmer — Prioritized Backlog

> This file is read by the nightly auto-compound system.
> The agent picks the first item NOT marked [DONE] or [IN PROGRESS].
> Keep highest priority at top.

## Priority 1: User authentication and usage tracking
Add basic auth (Cloudflare Access or simple token-based) so we can enforce
pricing tier limits. Track per-user video generation count per month.
Integrate with the pricing tiers on the landing page.

## Priority 2: Payment integration with Stripe
Connect Stripe Checkout for Standard ($9.99/mo) and Pro ($29.99/mo) tiers.
Gate model selection and resolution based on subscription tier.
Add a billing portal link in the user dashboard.

## Priority 3: Email notification on video completion
Send an email when a video generation job completes (success or error).
Use Resend or Cloudflare Email Workers. Include a link to view/download.

## Priority 4: Video watermark for free tier
Add a small "Made with 拾光 Glimmer" watermark overlay on free-tier videos.
Paid tiers get watermark-free exports.

## Priority 5: Multi-language support (i18n)
Add language toggle (繁中/English) across the entire app, not just the
landing page. Use next-intl or a simple context-based approach.

## Priority 6: Analytics dashboard
Track generation counts, model usage, error rates, avg generation time.
Simple admin page at /admin with charts.

## Priority 7: Batch generation
Allow uploading multiple photos and generating one video per photo in a
single batch job. Show progress for all jobs on a batch status page.

## Priority 8: Social sharing
Add share buttons (LINE, Facebook, Instagram) on the video completion page.
Generate OG image/video meta tags for link previews.

# Session Handover — 2026-02-27

## Session Summary

Completed MVP launch checklist and added several key features for production readiness.

## What Was Done

### 1. Admin User Management (Milestone 2)
- **API**: `POST/GET /api/admin/users` — search users, view details, grant credits
- **UI**: Users tab in `/admin` with search, user details panel, grant credits form
- **Types**: Added `provider: 'admin'` to PurchaseRecord for admin grants

### 2. MVP Launch Checklist
- **Lighthouse**: 86/98/100/100 (Performance/Accessibility/Best Practices/SEO)
- **Sentry**: Confirmed working (30+ API routes covered)
- **GA4**: Confirmed working (G-VEB2BV8FSN)
- **Accessibility**: Added `<main>` landmark to landing page

### 3. Gallery Cleanup
- **Created**: `POST /api/admin/cleanup` — bulk delete expired videos
- **Fixed**: R2-archived videos no longer show expiration warning
- **Cleaned**: Deleted 11 expired test videos from gallery

### 4. Bug Fixes
- Fixed `/quick` page alignment (missing `mx-auto px-4`)
- Fixed expiration logic to check URL type, not just creation time

### 5. NSFW Content Moderation
- **Installed**: nsfwjs + @tensorflow/tfjs
- **Created**: `useNSFWCheck` hook with lazy model loading
- **Integrated**: PhotoUploader blocks NSFW before upload
- **Config**: Turbopack buffer polyfill in next.config.ts

## Current State

| Component | Status |
|-----------|--------|
| Video generation | Working (BytePlus, Veo, Kling) |
| R2 archival | Auto-archives on completion |
| Payments (ECPay) | Production mode |
| Feature gating | Editor/Storyboard/Projects gated |
| Admin panel | Stats + User management |
| NSFW moderation | Client-side blocking |
| Error tracking | Sentry via HTTP API |
| Analytics | GA4 |

## Key Files Changed This Session

```
app/src/app/api/admin/users/route.ts      # NEW - User lookup + grant credits
app/src/app/api/admin/cleanup/route.ts    # NEW - Bulk delete expired videos
app/src/app/admin/page.tsx                # Users tab added
app/src/hooks/useNSFWCheck.ts             # NEW - NSFW detection hook
app/src/components/PhotoUploader.tsx      # NSFW integration
app/src/app/gallery/page.tsx              # R2 expiration fix
app/src/app/quick/page.tsx                # Layout fix
app/src/app/page.tsx                      # <main> landmark
app/next.config.ts                        # Turbopack buffer polyfill
CLAUDE.md                                 # New learnings added
```

## Commits This Session

```
bae6730 feat: add client-side NSFW content moderation
ca36f20 docs: add learnings from 2026-02-26 session
d782219 fix: R2-archived videos should not show expiration warning
911465e feat: add admin cleanup endpoint for expired videos
9343127 fix: add main landmark for accessibility
0cc2ff1 fix: center /quick page layout
7958b58 feat: add admin user management panel
```

## Next Actions

### High Priority
1. **Test NSFW moderation** — Upload test images to verify blocking works
2. **Monitor Sentry** — Watch for any production errors after deployment
3. **Create pilot videos** — Use nano banana prompts for marketing content

### Medium Priority
4. **Storyboard export improvements** — Cloud Run export still has edge cases
5. **Quick template expansion** — Add more occasion templates
6. **Landing page video** — Embed demo video in hero section

### Backlog (see reports/backlog.md)
- OG image improvements
- Email templates styling
- B2B features

## Environment Notes

- **R2 binding**: `GLIMMER_R2` configured in Cloudflare Pages
- **Sentry DSN**: Set in Cloudflare env vars
- **ECPay**: Production mode (`ECPAY_TEST_MODE=false`)
- **Admin emails**: glimmer.hello@gmail.com, aipujol34@gmail.com, cocoshell8988@gmail.com

---

## Nano Banana Prompt for Nostalgic Photos

Use this system prompt to generate realistic nostalgic Taiwanese elderly photos:

```
Create a vintage photograph from 1960s-1980s Taiwan. The image should look like an authentic old family photo with these characteristics:

SUBJECT:
- Elderly Taiwanese person (grandpa or grandma)
- Serious, dignified expression (people rarely smiled in old photos)
- Traditional clothing:
  - Grandpa: military uniform, formal suit, or traditional Chinese attire
  - Grandma: qipao (cheongsam), traditional floral blouse, or simple cotton dress
- Natural aging features: wrinkles, grey hair, weathered hands

PHOTO STYLE:
- Faded colors or sepia tone
- Slight grain and soft focus
- Minor imperfections: small scratches, slight discoloration at edges
- Studio backdrop OR outdoor setting (temple, old house, farm)
- Film photography look (not digital)

COMPOSITION:
- Formal portrait pose (seated or standing straight)
- Looking directly at camera or slightly off
- Simple background (plain wall, traditional furniture, garden)

AVOID:
- Smiling or casual expressions
- Modern clothing or accessories
- Sharp digital quality
- Overly posed or artificial lighting

Era-specific details:
- 1960s: Post-war simplicity, military uniforms common
- 1970s: Economic growth era, slightly more formal wear
- 1980s: Beginning of prosperity, mix of traditional and modern
```

**Example prompts:**

1. `1970s Taiwan, elderly grandfather in military dress uniform, formal portrait, sepia toned, studio backdrop, dignified expression, film grain`

2. `1965 Taiwan countryside, grandmother in traditional floral cotton blouse, sitting on wooden chair, faded colors, weathered face, serious expression`

3. `1980s Taipei, elderly couple formal portrait, grandfather in dark suit, grandmother in navy qipao, studio photo with painted backdrop, slight color fade`

4. `1975 Taiwan temple, elderly man in traditional Chinese clothing, standing portrait, natural lighting, film photography aesthetic, contemplative expression`

5. `1968 rural Taiwan, grandmother working in rice field, candid moment, worn cotton clothes, straw hat, documentary style, warm sepia tones`

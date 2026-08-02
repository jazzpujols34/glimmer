# Glimmer Production Runbook

When something breaks in production, start here. Goal: diagnose and fix in <15 minutes.

---

## Quick triage — what's the symptom?

| Symptom | Most likely cause | Jump to |
|---------|-------------------|---------|
| "發生錯誤，請稍後再試" on Generate | Exception thrown in `/api/generate` route | [Generate fails](#generate-fails) |
| "影片生成服務暫時無法使用" | Known BytePlus unavailability (auto-detected) | [Provider down](#provider-down) |
| Page loads slowly / 502 / 504 | CF Pages / Cloudflare Worker issue | [CF infrastructure](#cf-infrastructure) |
| Video URL 404 after 24h | R2 archival failed | [R2 archival](#r2-archival) |
| Email verification doesn't arrive | Resend service issue | [Email](#email) |
| Build fails on deploy | Next.js / Turbopack / type error | [Build failure](#build-failure) |
| No new errors in Sentry for >24h | `SENTRY_DSN` missing in CF prod env | [Sentry silent](#sentry-silent) |

---

## Diagnostic tools (in order of speed)

| Tool | When to use | How |
|------|-------------|-----|
| `/api/health` | First check — proves the worker is alive + KV + BytePlus reachable | `curl https://glimmer.video/api/health` |
| `/api/health?fail=1` | Test Sentry capture is wired in prod | `curl https://glimmer.video/api/health?fail=1` then check Sentry |
| Cloudflare real-time logs | Get the actual exception text from an Edge function | CF Dashboard → glimmer Pages → Functions → Real-time logs |
| Sentry Issues | Stack traces, last 14d | https://jazz-solopreneur.sentry.io → javascript-nextjs project |
| Browser DevTools Network | Confirm request actually reaches the API and see response body | F12 → Network → reproduce |
| BytePlus billing detail | Confirm a generation actually billed + which SKU | BytePlus console → Billing Center → Bill Details |

---

## Common failure scenarios

### Generate fails

User sees "發生錯誤，請稍後再試" or "影片生成服務暫時無法使用".

**Step 1.** Get the real error. The user-facing message is generic.
- Open Cloudflare real-time logs, reproduce the bug → look for `[Error] /api/generate:` line
- OR check Sentry for new issues with tag `route:/api/generate`

**Step 2.** Match the error to known causes:

| Error text | Cause | Fix |
|------------|-------|-----|
| `BYTEPLUS_API_KEY is not set` | Env var missing in CF prod | Set `BYTEPLUS_API_KEY` in CF Pages → Settings → Env variables → Production. Redeploy. |
| `BYTEPLUS_MODEL_ID is not set` | Env var missing | Same as above for `BYTEPLUS_MODEL_ID` |
| `BytePlus create failed: 401` | API key invalid (rotated, deleted) | Check BytePlus console → API Key Management. Rotate key, update env var, redeploy. |
| `InvalidEndpoint.ClosedEndpoint` | Endpoint deleted / paused / billing issue | See [Provider down](#provider-down) |
| `InsufficientBalance` | BytePlus account out of credit | Top up BytePlus account or pause service |
| `OutputVideoSensitiveContentDetected` | BytePlus content filter false positive | Known issue — show user the warm "this photo can't be used" message (already in `generate/[id]/page.tsx`). Not actionable on our side. |
| `KV` errors / `getKV is null` | Cloudflare KV not bound | CF Pages → Settings → Functions → KV namespace bindings. `GLIMMER_KV` must be bound. |

**Step 3.** After fix, redeploy:
- If only env vars changed: Deployments tab → latest → ⋯ → Retry deployment
- If code changed: `git push origin main` → auto-deploy

---

### Provider down

BytePlus (or any AI provider) endpoint is unavailable.

**Step 1.** Check BytePlus console — is the endpoint Active? Is there a billing alert?

**Step 2.** If endpoint closed/deleted:
1. Create a new endpoint (or use a direct model name like `seedance-1-5-pro-251215` — no endpoint needed)
2. Update `BYTEPLUS_MODEL_ID` in CF Pages prod env vars
3. Update local `.env.local` to match
4. Trigger redeploy

**Step 3.** If billing issue:
- Check BytePlus account → Billing → resolve overdue invoice or top up
- Wait for service reactivation (usually instant after payment)
- Monitor with `/api/health` until ok

**Single-provider risk:** Glimmer is BytePlus-only (commit `99f333a` removed fallback because Veo/Kling were too expensive at the time). If BytePlus has a multi-hour outage, all generation breaks. Mitigation options:
- Restore provider fallback (~30 min work; requires verified Veo or Kling credentials)
- Post a status banner on the homepage during incidents
- Manually disable Generate button via a feature flag

---

### CF infrastructure

Page loads slowly, 502/504, or worker errors that aren't from our code.

**Step 1.** Check https://www.cloudflarestatus.com — is there a known incident?

**Step 2.** Check CF Pages dashboard:
- Latest deployment status (green/red)
- Functions tab → invocations + errors graph
- Workers logs for unhandled exceptions

**Step 3.** Common CF issues:
- KV namespace binding lost → re-bind in Settings → Functions
- Build cache corruption → trigger a fresh build by pushing an empty commit
- CDN cache holding old version → CF Dashboard → Caching → Purge Everything

---

### R2 archival

Video URLs 404 after 24 hours.

**Cause:** External AI provider CDN URLs expire in 24h. We auto-archive to R2 on generation completion. If archival failed silently, the CDN URL was stored and now it's dead.

**Fix:** Manual reactivation isn't simple — once a CDN URL expires, the video is unrecoverable. Going forward:
- Per learning `2026-03-13`, both `/api/status` and `/api/gallery` retry archival for jobs with `archived=false`. So poll those endpoints for any failed videos within 24h.
- Check `GLIMMER_R2` binding in CF Pages Settings → Functions

**Prevention:** monitor archival success rate via Sentry (custom event when archival fails).

---

### Email

Verification emails not arriving.

**Step 1.** Check `RESEND_API_KEY` is set in CF prod env vars.

**Step 2.** Resend dashboard (https://resend.com) → Logs → search for the recipient. Possible states:
- Not sent → API key invalid or quota exceeded
- Bounced → invalid email
- Delivered but spam → DKIM/SPF issue on your sender domain

**Step 3.** Customer workaround: admin can manually mark email as verified via `/admin` dashboard.

---

### Build failure

Push to main causes CF Pages build to fail.

**Step 1.** Read CF Pages build log carefully — Turbopack errors are verbose but localized.

**Step 2.** Common Next.js 16 issues:
- `ssr: false` in Server Components → extract dynamic imports to a Client Component wrapper (pattern: see `components/landing/LazyClientSections.tsx`)
- Lucide icons given `alt` attribute → Lucide icons don't accept `alt`; use `aria-hidden="true"` for decorative

**Step 3.** Reproduce locally before pushing fix:
```bash
cd app && npm run build
```

If it passes locally but fails on CF Pages, suspect environment differences (Node version, npm version, env vars).

---

### Sentry silent

You haven't seen any new Sentry issues in a long time. This could mean:
- (Good) Genuinely no errors
- (Bad) `SENTRY_DSN` not set in CF prod env, all errors silently dropped

**Test:** `curl https://glimmer.video/api/health?fail=1`

This throws a test error and calls `captureError()`. Within ~30 sec a new issue titled "Sentry capture test from /api/health?fail=1" should appear in Sentry. If it doesn't:
- Check `SENTRY_DSN` is set in CF Pages prod env vars
- Verify the DSN string matches: `https://b23d5d587ecd9c9c6c66880d7e5aa821@o4510865076584448.ingest.us.sentry.io/4510865079271424`
- Trigger a redeploy after setting

---

## Environment variables — production reference

CF Pages → glimmer → Settings → Environment variables → Production:

| Variable | Required | Notes |
|----------|----------|-------|
| `BYTEPLUS_API_KEY` | yes | New BytePlus account key, format `ark-xxxxx...` |
| `BYTEPLUS_MODEL_ID` | yes | Currently `seedance-1-5-pro-251215` |
| `SENTRY_DSN` | recommended | Without this, all prod errors are silently dropped |
| `ECPAY_MERCHANT_ID` | yes | Payment processing |
| `ECPAY_HASH_KEY` | yes | Payment processing |
| `ECPAY_HASH_IV` | yes | Payment processing |
| `ECPAY_TEST_MODE` | recommended | `true` for testing, omit/false for live |
| `RESEND_API_KEY` | yes | Email verification |
| `OPENAI_API_KEY` | for subtitles | Whisper auto-subtitle in the editor. **Was never set in production** (found 2026-07-31) — until it is, `/api/transcribe` returns 503 and the editor's auto-subtitle button cannot work; manual subtitles are unaffected. Costs money per call, so the route requires a verified email. |
| `EXPORT_SERVICE_URL` | yes | Cloud Run FFmpeg service |
| `EXPORT_URL_ALLOWED_HOSTS` | optional | Comma-separated host suffixes, extends the SSRF allowlist in `src/lib/url-allowlist.ts` (own origin + BytePlus CDN hosts are always allowed) so a new provider CDN can be allowed without a code deploy |
| `NEXT_PUBLIC_BASE_URL` | yes | `https://glimmer.video` |
| `ADMIN_EMAILS` | optional | Comma-separated, gets unlimited credits + admin UI access |
| `DAILY_PROVIDER_TOKEN_CAP` | optional | Daily provider-spend circuit breaker (`src/lib/spend-guard.ts`). Max estimated BytePlus tokens per UTC day before `/api/generate`, `/api/generate-batch`, `/api/quick-generate` refuse new generations with a 503. Unset = default 15,000,000 (≈ US$18/day at $0.0012/K tokens). `0` disables the cap. |
| `ADMIN_SECRET` | **yes** | Second factor for every `/api/admin/*` route, sent as the `x-admin-secret` header. **Fails closed** — if this is unset or empty, the entire admin API returns 401 and the `/admin` dashboard cannot load. Set it before or immediately after deploying. Generate with `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`. Rotating it logs the dashboard out; re-enter the new value at `/admin`. |
| `GOOGLE_API_KEY` | currently unused | For Veo fallback when restored |
| `GOOGLE_CLOUD_PROJECT` | currently unused | For Veo fallback |
| `KLING_ACCESS_KEY` | currently unused | For Kling fallback |
| `KLING_SECRET_KEY` | currently unused | For Kling fallback |
| `TELEGRAM_BOT_TOKEN` | optional | Bot token for admin alerts (`src/lib/telegram.ts`). Both this and `TELEGRAM_ADMIN_CHAT_ID` must be set or `sendAdminAlert()` is a silent no-op — never blocks or fails the caller. |
| `TELEGRAM_ADMIN_CHAT_ID` | optional | Chat ID the bot DMs. Fires on: successful ECPay payment (`/api/webhooks/ecpay`), and daily provider-spend cap breach — at most once per UTC day, gated by a `spend-alert:YYYY-MM-DD` KV flag (`src/lib/spend-guard.ts`). |
| `GOOGLE_OAUTH_CLIENT_ID` | yes (Phase 1) | OAuth 2.0 client ID for "Sign in with Google" (`src/app/api/auth/[...auth]/route.ts`), GCP project `concise-honor-486903-j3`. Sent as `client_id` on both the login redirect and the token exchange; also checked as the id_token's `aud` claim on callback. Not a secret (client-visible in the redirect URL), but treated as a CF Pages env var for consistency with its paired secret below. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | **yes (Phase 1)** | Paired secret for the above, used only server-side in the authorization-code token exchange with Google. **Fails closed** — if either this or `GOOGLE_OAUTH_CLIENT_ID` is unset, `/api/auth/login/google` and `/api/auth/callback/google` both return 500. Registered redirect URIs (do not change without updating the GCP OAuth client): `https://glimmer.video/api/auth/callback/google` (prod), `http://localhost:3200/api/auth/callback/google` (dev). |
| `SESSION_SECRET` | **yes (Phase 1)** | HMAC-SHA256 key for the signed `glimmer_session` cookie and the short-lived OAuth state/PKCE cookies (`src/lib/session.ts`, Web Crypto — no jose/jsonwebtoken dependency). **Fails closed** — `verifySession()`/`getSession()` return `null` (never throws) if unset, so an unset secret just means nobody can be signed in, not a crash. Generate the same way as `ADMIN_SECRET`: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`. Rotating it silently signs everyone out (existing session cookies fail verification) — no user-facing error, they just appear signed out next visit. |

**KV namespace binding** (Settings → Functions → KV namespace bindings):
- Binding name: `GLIMMER_KV`
- Must be set to your actual KV namespace ID

**R2 bucket binding** (Settings → Functions → R2 bucket bindings):
- Binding name: `GLIMMER_R2`
- Must be set to your archival bucket

---

## Deploy procedure

### Standard deploy (code change)
```bash
git push origin main
```
Cloudflare Pages auto-builds and deploys.

### Env var only deploy (no code change)
1. Update env var in CF Pages → Settings → Environment variables
2. Save
3. Deployments tab → latest → ⋯ → **Retry deployment** (env changes don't auto-trigger)

### Rollback
1. Deployments tab → find the last known-good deployment
2. Click ⋯ → **Rollback to this deployment**

### Emergency disable (kill switch)
If something is critically broken and you need to take Generate offline immediately:
1. Set `BYTEPLUS_API_KEY` to an invalid value (e.g., `disabled`) in CF prod
2. Retry latest deployment
3. All Generate requests will now fail with `BytePlus create failed: 401` → caught as `ProviderUnavailableError` → user sees friendly "service temporarily unavailable"

---

## Monitoring setup

### UptimeRobot (recommended, free tier)

5-minute setup, gives you alerting before customers notice.

1. Sign up at https://uptimerobot.com (free tier = 50 monitors, 5-min checks)
2. New Monitor → **HTTP(s) keyword**
3. Configure:
   - **Friendly name:** `glimmer-health`
   - **URL:** `https://glimmer.video/api/health`
   - **Keyword type:** `exists`
   - **Keyword:** `"status":"ok"`
   - **Interval:** 5 minutes
4. Alert contacts: add `glimmer.hello@gmail.com` (or your preferred alert email)
5. Save

UptimeRobot will check every 5 min and email you when:
- `/api/health` returns non-200
- Response body doesn't contain `"status":"ok"` (means a sub-check failed)
- Endpoint is unreachable

### Sentry alerts (optional, paid feature)

Sentry's free tier captures errors but doesn't email on every issue. To get alerts:
- Sentry → Alerts → Create Alert → "Issues" rule
- Trigger: "An issue is first seen"
- Filter: `project: javascript-nextjs`
- Action: email `glimmer.hello@gmail.com`

---

## Cost monitoring

### BytePlus
- Set a budget alert in BytePlus account settings → Budget Management
- Recommended: soft cap $50/month for early stage
- Hard cap option also available

### Current per-clip cost
- Seedance 1.5 Pro, no audio: **~$0.13 per 5-sec 720p clip**
- Multiply by free tier (3) + average paid generations per customer

---

## Known issues / followups

| Issue | Severity | Tracking |
|-------|----------|----------|
| 8 npm vulns remain (need `--force` or no fix) | Low (build-time deps) | Periodic `npm audit fix --force` review |
| No provider fallback | Medium (single-vendor risk) | Re-enable Veo or Kling when budget allows |
| No tiered pricing (free uses same model as paid) | Low (cost optimization) | Test Seedance 1.0 Pro Fast for free tier |
| Cloud Run export service not Sentry-instrumented | Low | Add Python Sentry SDK to export-service if needed |

---

## Incident log

Use this section to record incidents and what was learned.

### 2026-05-25 — BytePlus endpoint closed
- **Symptom:** All Generate requests returned 500 with "發生錯誤，請稍後再試"
- **Root cause:** BytePlus endpoint `ep-20250620162945-8z6pb` (created 2025-06-20) was closed by BytePlus. Likely auto-deprecated for inactivity or pricing change.
- **Why it took so long:** `SENTRY_DSN` wasn't set in CF Pages prod, so the actual exception was silently dropped. Discovery required `wrangler tail` to see the Edge function logs.
- **Fix:** Created new BytePlus account, used direct model name `seedance-1-5-pro-251215` (no endpoint provisioning needed), updated env vars, redeployed.
- **Lessons baked into code:**
  - `/api/health` now does real KV + BytePlus probes
  - `SENTRY_DSN` set in prod
  - Known provider errors throw `ProviderUnavailableError` → user sees 503 + friendly message
  - `generate_audio: false` halves BytePlus per-clip cost

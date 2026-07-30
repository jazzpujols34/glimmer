# UNDERSTANDING.md — 2026-07-30 session

Session trigger: first real customer payment (order `GL1785389855830K63I`, NT$599 → 50 credits,
`albertchang810818@gmail.com`). Task: verify the payment landed and audit the whole site.

Teaching Mode gate: this session ran autonomously, so nothing below has been *verified* with Jazz yet.
Every box is unchecked on purpose. Mark `[x]` only after you restate it back or pass a quiz —
never just from having read it.

---

## Pillar 1 — The problems (spend the most time here)

### 1.1 Cross-tenant data exposure (the serious one)
- [ ] Why `GET /api/gallery` returned **every** user's videos: the handler was declared
      `export async function GET()` — it never took a request object, so it had no way to know
      who was asking. `getCompletedJobs()` did a bare `kvListKeys('job:')` with no filter.
- [ ] Why this is worse than a normal bug: the customer's videos are of a **deceased person**.
      Confirmed live — 20 of his memorial videos were served to anonymous visitors.
- [ ] The same shape of bug in `/api/projects` and `/api/storyboards`, but subtler:
      `searchParams.get('email') || undefined` + `if (!email || project.email === email)`.
      **Omitting the parameter disabled the filter.** An opt-in filter is not access control.
      Why is an opt-in filter more dangerous than no filter at all?
- [ ] `/api/projects` also leaked the customer's **email address** to anonymous callers.
- [ ] Why the fix returns **404** (not 403) for a resource you don't own.

### 1.2 The provider bug that blocked the customer
- [ ] BytePlus requires `role` on **every** image when more than one image is sent. The code set
      `role: 'last_frame'` on the second image but left the first bare → HTTP 400 on every
      first-last-frame request. The customer hit it 5 times, twice *after* paying.
- [ ] Why single-image generation kept working (role only required with 2+ images) — and why the
      fix therefore only touches the two-image path.
- [ ] Duration: `seedance-1-5-pro` accepts **4–12s**, but `validateSettings` clamped to 2–12 and the
      slider's `min` was 2. Anyone choosing 2–3s got a hard provider error.
- [ ] How this was diagnosed **without** burning money: sending a deliberately malformed image so a
      valid duration fails at image validation instead of generating. What does that trick cost, and
      when does it stop working?

### 1.3 Zombie jobs
- [ ] `createJob()` ran *before* `createVideoTask()`. When the latter threw, the job record stayed
      `status: 'queued'` forever and the UI showed a stuck 0% spinner. 5 of these were in production.
- [ ] Why marking them `error` beats deleting them (the customer sees a real message, not a 404).

### 1.4 Admin auth was a string the client supplies
- [ ] `isAdmin(adminEmail)` where `adminEmail` came from the query string or POST body.
      `POST /api/admin/users` does `record.total += credits` → guess an admin address, mint
      unlimited credits.
- [ ] Why `/api/access` and `/api/credits` returning `isAdmin: true/false` for any email turned this
      into a free **oracle** for finding the admin address.

### 1.5 Money-path fragility
- [ ] The webhook credited by **price**, not by product (`299→20, 599→50`). Why that is fragile.
- [ ] Dead packs (`single` NT$499/1 credit, `pack5` NT$1999/5) were unreachable from the UI but still
      live in the checkout API — and priced *worse* than the real packs.
- [ ] The landing page's JSON-LD advertised NT$499 and NT$1999 products **that do not exist**.

---

## Pillar 2 — The solutions

- [ ] `lib/owner.ts`: `getRequesterEmail()` + `ownsOrAdmin()`. A resource with **no** email is owned
      by nobody (admin-only). Why that default, rather than "public"?
- [ ] Honest limitation: the requester email is still **client-supplied and spoofable**. This closes
      *anonymous enumeration*, not a determined attacker. Why that was still the right thing to ship
      today, and what the real fix (signed identity token) would cost the live customer mid-project.
- [ ] Why `/api/proxy-video` was deliberately **left alone**: unguessable-id bearer URLs are load
      bearing for the runbook's "send a lost video back to a customer" flow. Once listing is scoped,
      ids stop being enumerable — that's the actual mitigation.
- [ ] `lib/packs.ts` as single source of truth; webhook resolves by packId (`CustomField2`) with an
      amount cross-check, falling back to the amount map for pre-deploy orders. Why the fallback is
      mandatory rather than nice-to-have.
- [ ] `ADMIN_SECRET` + `x-admin-secret`, **fail closed**, constant-time compare. Why fail-closed is
      right even though it locks the dashboard until the secret is set.

## Pillar 3 — Broader context

- [ ] Unit economics: 585,225 tokens per 1080p/12s video (measured from the customer's own tasks).
      At the $1.2/M silent rate that's ~$0.70/video vs ~US$0.37 revenue per credit — **underwater at
      1 video per credit**, and the `numResults` slider lets one credit buy up to 4 videos (~$2.81).
      → open decision, see the report. What are the three levers to fix it?
- [ ] Why the credit-charging change was **not** shipped unilaterally: the customer bought under the
      current behaviour.
- [ ] What this says about shipping a payment path before an identity model.

---

## Open decisions for Jazz

- [ ] `numResults` vs credits — charge per result, cap results, or absorb the cost?
- [ ] Ship signed identity tokens (forces existing users to re-verify) or stay with scoped email?
- [ ] `已服務 50+ 家庭` on the landing page — production shows 2 paying customers ever.

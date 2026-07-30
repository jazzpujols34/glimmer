/**
 * SSRF guard for URLs the export routes fetch/forward server-side.
 *
 * resolveVideoUrl() (video-url.ts) returns any http(s) URL unchanged — it does
 * URL *format* resolution, not host restriction. Export routes fetch the
 * resolved URL from the edge worker (HEAD) and forward it to Cloud Run, which
 * fetches it in full — so a client-supplied clip/music/card URL that isn't
 * host-checked lets an attacker point our infrastructure at arbitrary hosts.
 *
 * Call isAllowedExportUrl() on the *resolved* (always-absolute) URL immediately
 * before fetching or forwarding it.
 */

// Provider CDN hosts for videos not yet archived to R2.
//
// `volces.com` is the one that actually matters: BytePlus serves generated
// videos from ByteDance's Volcano Engine object storage, e.g.
// ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com — verified
// 2026-07-31 against a real completed task. The `bytepluscdn.com` example in
// video-url.ts's header comment is stale documentation and has never been the
// host we receive; omitting volces.com here would reject every export of a
// video that hasn't been archived yet. The byteplus* suffixes are kept as
// defence in case they start serving from their own branded domain.
const PROVIDER_CDN_SUFFIXES = [
  'volces.com',
  'bytepluscdn.com',
  'bytepluses.com',
  'byteplusapi.com',
];

// Extra allowed host suffixes for new provider CDNs, comma-separated, so a new
// provider can be allowed without a code deploy. Same parsing style as
// ADMIN_EMAILS in credits.ts.
const EXTRA_ALLOWED_SUFFIXES = (process.env.EXPORT_URL_ALLOWED_HOSTS || '')
  .split(',')
  .map(h => h.toLowerCase().trim())
  .filter(Boolean);

const ALLOWED_SUFFIXES = [...PROVIDER_CDN_SUFFIXES, ...EXTRA_ALLOWED_SUFFIXES];

// Loopback / link-local / cloud-metadata hosts — never fetchable, regardless
// of what NEXT_PUBLIC_BASE_URL happens to be set to.
const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0', '169.254.169.254']);

function isIpLiteral(hostname: string): boolean {
  const stripped = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(stripped)) return true; // IPv4
  if (stripped.includes(':')) return true; // IPv6 (any literal, e.g. contains ":")
  return false;
}

function hostMatchesSuffix(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

/**
 * True if `url` is safe for an export route to fetch or forward.
 *
 * Allowed: our own origin (NEXT_PUBLIC_BASE_URL host — this is the common
 * case, since archived videos resolve to `${BASE_URL}/api/proxy-video?...`),
 * provider CDN host suffixes, and admin-configured extra hosts.
 *
 * Rejected: any other host, non-http(s) schemes, embedded credentials
 * (user:pass@), and loopback/link-local/metadata/bare-IP hosts.
 *
 * Host suffix matching is exact-equality-or-dot-suffix — "x.bytepluscdn.com"
 * matches the "bytepluscdn.com" suffix, "evilbytepluscdn.com" does not
 * (no substring matching).
 */
/**
 * Lenient variant for fields that are NOT always absolute URLs.
 *
 * Editor music clips store `src` as a bare filename ("song.mp3", audio kept in a
 * local blob) and storyboard uploads store a bare R2 key ("music/<id>/x.mp3").
 * Neither has a host, so neither can point our infrastructure at another origin —
 * they are not an SSRF vector, and rejecting them would hard-fail exports that
 * behave the same way today. So: only values that CAN designate a host are
 * host-checked.
 *
 * Protocol-relative values ("//evil.com/x.mp3") are rejected explicitly — they
 * fail `new URL()` without a base but WOULD resolve to an attacker's host once
 * something resolves them against a base.
 */
export function isSsrfSafeExportUrl(value: string): boolean {
  if (!value) return true; // nothing to fetch
  if (value.startsWith('//')) return false; // protocol-relative → any host

  try {
    new URL(value);
  } catch {
    return true; // relative path / bare filename / R2 key — no host to attack
  }

  return isAllowedExportUrl(value);
}

export function isAllowedExportUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;

  const host = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTS.has(host) || isIpLiteral(host)) return false;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://glimmer.video';
  try {
    if (host === new URL(baseUrl).hostname.toLowerCase()) return true;
  } catch {
    // Malformed NEXT_PUBLIC_BASE_URL — ignore, fall through to CDN suffix check
  }

  return ALLOWED_SUFFIXES.some(suffix => hostMatchesSuffix(host, suffix));
}

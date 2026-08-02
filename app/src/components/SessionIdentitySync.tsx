'use client';

import { useEffect } from 'react';
import { resolveSyncedEmail } from '@/lib/session-sync';

const EMAIL_KEY = 'glimmer_email';

/**
 * Promotes a signed-in session's resolved identity (/api/auth/session,
 * Concern 1 of Phase 2a — docs/oauth-identity-design.html) to be the active
 * `glimmer_email` the rest of the app already reads from localStorage.
 * Without this, a logged-in user keeps seeing whatever email was left in
 * localStorage from before they signed in.
 *
 * Mounted once in the root layout — this app has no shared header/provider
 * component, so this is the lowest-friction correct home rather than
 * duplicating the fetch on every page. Renders nothing.
 *
 * Anonymous (no session) behavior is untouched: resolveSyncedEmail() returns
 * null in that case and localStorage is never written.
 *
 * Same-tab consumers whose state was already initialized from localStorage
 * before this effect's fetch resolves (e.g. create/page.tsx's `email` state)
 * don't see the write on their own — they opt in with a plain
 * `window.addEventListener('storage', ...)`. Browsers only fire that event
 * for OTHER tabs, so we dispatch it manually here to cover the same-tab case.
 */
export function SessionIdentitySync() {
  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/session')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const stored = localStorage.getItem(EMAIL_KEY);
        const next = resolveSyncedEmail(data, stored);
        if (!next) return;
        localStorage.setItem(EMAIL_KEY, next);
        window.dispatchEvent(new StorageEvent('storage', { key: EMAIL_KEY, newValue: next, oldValue: stored }));
      })
      .catch(() => {
        /* best-effort — anonymous flow is unaffected either way */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

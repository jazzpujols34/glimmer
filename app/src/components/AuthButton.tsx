'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { LogIn, LogOut, Mail, Check } from 'lucide-react';

interface SessionState {
  loading: boolean;
  authenticated: boolean;
  email: string | null;
}

type SendState = 'idle' | 'sending' | 'sent' | 'error';

/**
 * Sign-in affordance. Offers both routes to a session:
 *
 *   Google — OAuth (Phase 1, docs/oauth-identity-design.html)
 *   Email  — a magic link via /api/verify/send { purpose: 'login' }
 *
 * The email route is not a nicety. Session enforcement arms an account the
 * first time it establishes a session, so an account with no way to sign in
 * is an account that can never be protected — and customers here signed up
 * with whatever address they had, not necessarily a Google one. Offering only
 * Google left them no path except discovering the refusal mid-generation.
 */
export function AuthButton() {
  const pathname = usePathname();
  const [state, setState] = useState<SessionState>({ loading: true, authenticated: false, email: null });
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sendState, setSendState] = useState<SendState>('idle');
  const [sendError, setSendError] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      if (res.ok) {
        const data = await res.json();
        setState({ loading: false, authenticated: !!data.authenticated, email: data.email || null });
        return;
      }
    } catch {
      /* network error — treat as signed out, same as a failed check */
    }
    setState({ loading: false, authenticated: false, email: null });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh is a stable callback that fetches external session state
    refresh();
  }, [refresh]);

  // Close on outside click and on Escape — a panel that traps the user is
  // worse than no panel.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Prefill with the address they've already been using, so signing in is one
  // click rather than retyping an email into a second box. Done here rather
  // than in an effect: it's a response to a click, not a consequence of render.
  const togglePanel = () => {
    setOpen((wasOpen) => {
      if (!wasOpen && !email && typeof window !== 'undefined') {
        const saved = localStorage.getItem('glimmer_email');
        if (saved) queueMicrotask(() => setEmail(saved));
      }
      return !wasOpen;
    });
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* best-effort — clearing the cookie server-side is what matters */
    }
    setState({ loading: false, authenticated: false, email: null });
  };

  const sendLoginLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendState('sending');
    setSendError('');
    try {
      const res = await fetch('/api/verify/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), purpose: 'login' }),
      });
      if (res.ok) {
        setSendState('sent');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setSendError(data.error || '寄送失敗，請稍後再試');
      setSendState('error');
    } catch {
      setSendError('寄送失敗，請稍後再試');
      setSendState('error');
    }
  };

  if (state.loading) return null;

  if (state.authenticated) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="hidden md:inline text-muted-foreground truncate max-w-[160px]">{state.email}</span>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="登出"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">登出</span>
        </button>
      </div>
    );
  }

  const returnTo = encodeURIComponent(pathname || '/');

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={togglePanel}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        <LogIn className="w-4 h-4" />
        <span className="hidden sm:inline">登入</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="登入"
          className="absolute right-0 mt-2 w-72 z-50 rounded-lg border border-border bg-background shadow-lg p-3 space-y-3"
        >
          <p className="text-xs text-muted-foreground">登入後，您的點數只有您本人能使用。</p>

          <a
            href={`/api/auth/login/google?returnTo=${returnTo}`}
            className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-md border border-border text-sm hover:bg-muted/50 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            使用 Google 登入
          </a>

          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">或</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {sendState === 'sent' ? (
            <div className="flex items-start gap-2 text-sm">
              <Check className="w-4 h-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <p>
                登入連結已寄到 <span className="font-medium break-all">{email.trim()}</span>，請點擊信中的連結（15
                分鐘內有效）。
              </p>
            </div>
          ) : (
            <form onSubmit={sendLoginLink} className="space-y-2">
              <label htmlFor="auth-email" className="sr-only">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={sendState === 'sending' || !email.trim()}
                className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                <Mail className="w-4 h-4" />
                {sendState === 'sending' ? '寄送中…' : '寄送登入連結'}
              </button>
              {sendState === 'error' && <p className="text-xs text-destructive">{sendError}</p>}
            </form>
          )}
        </div>
      )}
    </div>
  );
}

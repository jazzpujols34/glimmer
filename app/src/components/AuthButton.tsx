'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { LogIn, LogOut } from 'lucide-react';

interface SessionState {
  loading: boolean;
  authenticated: boolean;
  email: string | null;
}

/**
 * "Sign in with Google" header affordance — Phase 1, additive
 * (docs/oauth-identity-design.html). Purely optional: nothing about the
 * existing anonymous email flow changes whether or not anyone signs in.
 */
export function AuthButton() {
  const pathname = usePathname();
  const [state, setState] = useState<SessionState>({ loading: true, authenticated: false, email: null });

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

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* best-effort — clearing the cookie server-side is what matters */
    }
    setState({ loading: false, authenticated: false, email: null });
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
    <a
      href={`/api/auth/login/google?returnTo=${returnTo}`}
      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
    >
      <LogIn className="w-4 h-4" />
      <span className="hidden sm:inline">使用 Google 登入</span>
    </a>
  );
}

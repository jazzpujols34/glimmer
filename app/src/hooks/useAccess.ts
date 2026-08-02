'use client';

import { useState, useEffect, useCallback } from 'react';

interface AccessState {
  loading: boolean;
  error: boolean;
  email: string | null;
  hasPaidAccess: boolean;
  isAdmin: boolean;
  retry: () => void;
}

/**
 * Hook to check user's access level for feature gating.
 * Reads email from localStorage and checks API for paid status.
 * Reads hasPaidAccess/isAdmin from /api/credits (folded in from the retired
 * /api/access route, 2026-08 bundle diet — see CLAUDE.md Recent Learnings).
 */
export function useAccess(): AccessState {
  const [state, setState] = useState<Omit<AccessState, 'retry'>>({
    loading: true,
    error: false,
    email: null,
    hasPaidAccess: false,
    isAdmin: false,
  });

  const checkAccess = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: false }));

    const email = localStorage.getItem('glimmer_email');

    if (!email) {
      setState({
        loading: false,
        error: false,
        email: null,
        hasPaidAccess: false,
        isAdmin: false,
      });
      return;
    }

    try {
      const res = await fetch(`/api/credits?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        setState({
          loading: false,
          error: false,
          email,
          hasPaidAccess: !!data.hasPaidAccess,
          isAdmin: !!data.isAdmin,
        });
      } else {
        setState({
          loading: false,
          error: true,
          email,
          hasPaidAccess: false,
          isAdmin: false,
        });
      }
    } catch {
      setState({
        loading: false,
        error: true,
        email,
        hasPaidAccess: false,
        isAdmin: false,
      });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- checkAccess is a stable callback that fetches external data and sets state from the response
    checkAccess();
  }, [checkAccess]);

  return { ...state, retry: checkAccess };
}

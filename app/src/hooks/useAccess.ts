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
      const res = await fetch(`/api/access?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        setState({
          loading: false,
          error: false,
          email,
          hasPaidAccess: data.hasPaidAccess,
          isAdmin: data.isAdmin,
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
    checkAccess();
  }, [checkAccess]);

  return { ...state, retry: checkAccess };
}

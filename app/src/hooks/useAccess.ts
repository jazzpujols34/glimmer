'use client';

import { useState, useEffect } from 'react';

interface AccessState {
  loading: boolean;
  email: string | null;
  hasPaidAccess: boolean;
  isAdmin: boolean;
}

/**
 * Hook to check user's access level for feature gating.
 * Reads email from localStorage and checks API for paid status.
 */
export function useAccess(): AccessState {
  const [state, setState] = useState<AccessState>({
    loading: true,
    email: null,
    hasPaidAccess: false,
    isAdmin: false,
  });

  useEffect(() => {
    const checkAccess = async () => {
      // Get email from localStorage
      const email = localStorage.getItem('glimmer_email');

      if (!email) {
        setState({
          loading: false,
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
            email,
            hasPaidAccess: data.hasPaidAccess,
            isAdmin: data.isAdmin,
          });
        } else {
          setState({
            loading: false,
            email,
            hasPaidAccess: false,
            isAdmin: false,
          });
        }
      } catch {
        setState({
          loading: false,
          email,
          hasPaidAccess: false,
          isAdmin: false,
        });
      }
    };

    checkAccess();
  }, []);

  return state;
}

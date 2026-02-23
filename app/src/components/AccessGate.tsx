'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccess } from '@/hooks/useAccess';
import { Loader2 } from 'lucide-react';

interface AccessGateProps {
  children: React.ReactNode;
}

/**
 * Wrapper component that checks for paid access.
 * Redirects to /upgrade if user hasn't purchased.
 */
export function AccessGate({ children }: AccessGateProps) {
  const router = useRouter();
  const { loading, hasPaidAccess } = useAccess();

  useEffect(() => {
    if (!loading && !hasPaidAccess) {
      router.replace('/upgrade');
    }
  }, [loading, hasPaidAccess, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasPaidAccess) {
    // Will redirect, show nothing
    return null;
  }

  return <>{children}</>;
}

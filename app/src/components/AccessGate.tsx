'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccess } from '@/hooks/useAccess';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';

interface AccessGateProps {
  children: React.ReactNode;
}

/**
 * Wrapper component that checks for paid access.
 * Redirects to /upgrade if user hasn't purchased.
 * Shows retry on network error instead of redirecting.
 */
export function AccessGate({ children }: AccessGateProps) {
  const router = useRouter();
  const { loading, error, hasPaidAccess, retry } = useAccess();

  useEffect(() => {
    if (!loading && !error && !hasPaidAccess) {
      router.push('/upgrade');
    }
  }, [loading, error, hasPaidAccess, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">無法確認存取權限，請檢查網路連線</p>
        <Button variant="outline" onClick={retry}>
          <RefreshCw className="w-4 h-4 mr-2" />
          重試
        </Button>
      </div>
    );
  }

  if (!hasPaidAccess) {
    return null;
  }

  return <>{children}</>;
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { trackPurchaseComplete } from '@/lib/analytics';
import { isPurchaseConfirmed } from '@/lib/purchase-confirm';

export default function PurchaseSuccessPage() {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let cleanup = () => {};
    const email = localStorage.getItem('glimmer_email');
    if (!email) {
      setLoading(false);
      return;
    }

    // The payment notice may arrive after this page loads — keep asking for ~30s.
    let attempts = 0;
    const maxAttempts = 15;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    let pending: { packId?: string; amount?: number; orderId?: string; remainingBefore?: number | null } | null = null;
    try {
      pending = JSON.parse(localStorage.getItem('glimmer_pending_purchase') || 'null');
    } catch { /* ignore */ }

    const checkCredits = async () => {
      let confirmedNow = false;
      try {
        const res = await fetch(`/api/credits?email=${encodeURIComponent(email)}`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setRemaining(data.remaining);
          confirmedNow = isPurchaseConfirmed(data.remaining, pending?.remainingBefore);
        }
      } catch { /* ignore */ }

      if (confirmedNow) {
        setConfirmed(true);
        if (pending?.packId && pending.orderId) {
          trackPurchaseComplete(pending.packId, pending.amount ?? 0, pending.orderId);
        }
        try { localStorage.removeItem('glimmer_pending_purchase'); } catch { /* ignore */ }
      } else if (attempts < maxAttempts) {
        attempts++;
        timer = setTimeout(checkCredits, 2000);
        return;
      }
      setLoading(false);
    };
    cleanup = () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    checkCredits();
    return () => cleanup();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-3 sm:gap-6 text-sm">
            <Link href="/create" className="text-muted-foreground hover:text-foreground transition-colors">製作影片</Link>
            <Link href="/gallery" className="text-muted-foreground hover:text-foreground transition-colors">影片庫</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-20">
        <Card className="max-w-lg mx-auto">
          <CardContent className="p-8 text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>

            <div>
              <h1 className="text-2xl font-bold">購買成功！</h1>
              <p className="text-muted-foreground mt-1">Payment Successful</p>
            </div>

            {loading ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">正在確認付款...</p>
                <p className="text-xs text-muted-foreground">ECPay 確認可能需要數秒，請稍候</p>
              </div>
            ) : confirmed && remaining !== null ? (
              <div className="p-4 rounded-lg bg-primary/10">
                <p className="flex items-center justify-center gap-2 text-lg font-medium">
                  <Sparkles className="w-5 h-5 text-primary" />
                  您目前有 <span className="text-primary text-2xl font-bold">{remaining}</span> 點可用
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  點數永不過期，可隨時使用
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                付款已送出，點數入帳可能需要幾分鐘。若稍後在製作頁面仍未看到點數，請與我們聯絡。
              </p>
            )}

            <div className="flex flex-col gap-3">
              <Button size="lg" asChild>
                <Link href="/create">開始製作影片</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/">返回首頁</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      <footer className="border-t border-border py-8 mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; 2026 拾光 Glimmer. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/Logo';
import type { AspectRatio } from '@/types';
import { trackStoryboardCreate } from '@/lib/analytics';

export default function NewStoryboardPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slotCount, setSlotCount] = useState(12);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('請輸入故事板名稱');
      return;
    }

    if (slotCount < 2 || slotCount > 30) {
      setError('格數必須在 2-30 之間');
      return;
    }

    setIsCreating(true);

    try {
      const res = await fetch('/api/storyboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slotCount, aspectRatio }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '建立失敗');
      }

      // Track storyboard creation
      trackStoryboardCreate(slotCount, aspectRatio);

      router.push(`/storyboard/${data.storyboard.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立失敗');
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Logo />
          <Link href="/gallery" className="text-sm text-muted-foreground hover:text-foreground">
            返回影片庫
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">建立故事板</h1>
            <p className="text-muted-foreground">
              將多段影片組合成一部完整的影片
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 bg-card rounded-xl border border-border p-6">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">故事板名稱</Label>
              <Input
                id="name"
                type="text"
                placeholder="例如：媽媽追思影片"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
              />
            </div>

            {/* Slot Count */}
            <div className="space-y-2">
              <Label htmlFor="slotCount">影片格數</Label>
              <p className="text-sm text-muted-foreground">
                決定最終影片由幾段短片組成 (每段約 5 秒)
              </p>
              <div className="flex items-center gap-4">
                <Input
                  id="slotCount"
                  type="number"
                  min={2}
                  max={30}
                  value={slotCount}
                  onChange={(e) => setSlotCount(parseInt(e.target.value) || 2)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">
                  約 {Math.round(slotCount * 5 / 60 * 10) / 10} 分鐘
                </span>
              </div>
              <div className="flex gap-2 mt-2">
                {[6, 12, 18, 24].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setSlotCount(count)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      slotCount === count
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    {count} 格
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect Ratio */}
            <div className="space-y-2">
              <Label>畫面比例</Label>
              <p className="text-sm text-muted-foreground">
                選擇最終影片的畫面比例
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAspectRatio('16:9')}
                  className={`p-4 rounded-lg border-2 transition-colors ${
                    aspectRatio === '16:9'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="aspect-video bg-muted rounded mb-2 flex items-center justify-center">
                    <span className="text-xs text-muted-foreground">16:9</span>
                  </div>
                  <p className="text-sm font-medium">橫式 16:9</p>
                  <p className="text-xs text-muted-foreground">追思會、電視播放</p>
                </button>
                <button
                  type="button"
                  onClick={() => setAspectRatio('9:16')}
                  className={`p-4 rounded-lg border-2 transition-colors ${
                    aspectRatio === '9:16'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="aspect-[9/16] h-16 bg-muted rounded mb-2 mx-auto flex items-center justify-center">
                    <span className="text-xs text-muted-foreground">9:16</span>
                  </div>
                  <p className="text-sm font-medium">直式 9:16</p>
                  <p className="text-xs text-muted-foreground">社群媒體、手機觀看</p>
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Submit */}
            <Button type="submit" className="w-full" disabled={isCreating}>
              {isCreating ? (
                <>
                  <svg className="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  建立中...
                </>
              ) : (
                '建立故事板'
              )}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}

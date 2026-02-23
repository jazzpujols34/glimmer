'use client';

import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Lock, Sparkles, Video, Layers, FolderOpen } from 'lucide-react';

const FEATURES = [
  {
    icon: Video,
    title: '影片編輯器',
    description: '時間軸編輯、音樂、字幕、特效',
  },
  {
    icon: Layers,
    title: '故事板',
    description: '多片段組合、標題卡、轉場效果',
  },
  {
    icon: FolderOpen,
    title: '專案管理',
    description: '整理與管理您的所有影片',
  },
];

export default function UpgradePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-3 sm:gap-6 text-sm">
            <Link href="/create" className="text-muted-foreground hover:text-foreground transition-colors">
              製作影片
            </Link>
            <Link href="/gallery" className="text-muted-foreground hover:text-foreground transition-colors">
              影片庫
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-12 md:py-20">
        <Card className="max-w-lg mx-auto">
          <CardContent className="p-8 text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center">
              <Lock className="w-10 h-10 text-amber-500" />
            </div>

            <div>
              <h1 className="text-2xl font-bold">解鎖進階功能</h1>
              <p className="text-muted-foreground mt-1">Unlock Pro Features</p>
            </div>

            <p className="text-muted-foreground">
              購買點數即可解鎖所有進階功能，享受完整的創作體驗。
            </p>

            {/* Feature list */}
            <div className="space-y-3 text-left">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                >
                  <feature.icon className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">{feature.title}</p>
                    <p className="text-xs text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Pricing hint */}
            <div className="p-4 rounded-lg bg-primary/10">
              <p className="flex items-center justify-center gap-2 text-sm font-medium">
                <Sparkles className="w-4 h-4 text-primary" />
                最低 NT$299 起，點數永不過期
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <Button size="lg" asChild>
                <Link href="/create#pricing">購買點數</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/create">先體驗免費版</Link>
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

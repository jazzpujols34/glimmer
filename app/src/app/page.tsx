import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image
              src="/assets/glimmer-logo.jpeg"
              alt="拾光 Glimmer"
              width={150}
              height={80}
              className="h-16 w-auto"
            />
          </Link>
          <nav className="hidden sm:flex items-center gap-6 text-sm">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
              功能特色
            </a>
            <a href="#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">
              使用方式
            </a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">
              方案價格
            </a>
            <a href="#contact" className="text-muted-foreground hover:text-foreground transition-colors">
              聯絡我們
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/gallery">影片庫</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/create">開始製作</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 md:py-32">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-tight">
            讓珍貴回憶
            <span className="text-primary">活過來</span>
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground font-light">
            Bring Your Precious Memories to Life
          </p>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            上傳老照片，AI 自動生成電影級回憶影片。適用於追思、壽宴、婚禮等重要場合。
          </p>
          <p className="text-sm text-muted-foreground">
            Upload old photos and let AI create cinematic memorial videos for life&apos;s most meaningful moments.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button size="lg" asChild className="text-lg px-8 py-6">
              <Link href="/create">
                免費開始製作
                <span className="ml-2 text-sm opacity-75">Start Free</span>
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="text-lg px-8 py-6">
              <a href="#features">
                了解更多
                <span className="ml-2 text-sm opacity-75">Learn More</span>
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="border-t border-border bg-card/50 scroll-mt-20">
        <div className="container mx-auto px-4 py-20 md:py-28">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              功能特色
            </h2>
            <p className="text-muted-foreground text-lg">
              Features that make your memories unforgettable
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {/* Feature 1: AI Video */}
            <Card className="border-border/50 hover:border-primary/30 transition-colors">
              <CardContent className="p-6 text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
                  <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold">AI 影片生成</h3>
                <p className="text-sm text-muted-foreground">
                  AI Video Generation
                </p>
                <p className="text-sm text-muted-foreground">
                  支援多款頂尖模型：BytePlus Seedance、Google Veo 3.1、Kling AI，一鍵將靜態照片轉化為動態影片。
                </p>
              </CardContent>
            </Card>

            {/* Feature 2: Editor */}
            <Card className="border-border/50 hover:border-primary/30 transition-colors">
              <CardContent className="p-6 text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
                  <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold">內建影片編輯器</h3>
                <p className="text-sm text-muted-foreground">
                  Built-in Video Editor
                </p>
                <p className="text-sm text-muted-foreground">
                  時間軸編輯、裁剪、分割、配樂、字幕、音效 — 全在瀏覽器完成，無需安裝任何軟體。
                </p>
              </CardContent>
            </Card>

            {/* Feature 3: Occasions */}
            <Card className="border-border/50 hover:border-primary/30 transition-colors">
              <CardContent className="p-6 text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
                  <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold">多場合適用</h3>
                <p className="text-sm text-muted-foreground">
                  For Every Occasion
                </p>
                <p className="text-sm text-muted-foreground">
                  追思紀念、壽宴慶生、婚禮週年 — AI 會根據場合類型，自動調整影片風格與動態效果。
                </p>
              </CardContent>
            </Card>

            {/* Feature 4: Export */}
            <Card className="border-border/50 hover:border-primary/30 transition-colors">
              <CardContent className="p-6 text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
                  <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold">快速匯出</h3>
                <p className="text-sm text-muted-foreground">
                  Instant Export
                </p>
                <p className="text-sm text-muted-foreground">
                  瀏覽器端 FFmpeg 匯出，支援配樂混音、字幕燒錄，直接下載完成影片。
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="border-t border-border scroll-mt-20">
        <div className="container mx-auto px-4 py-20 md:py-28">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              使用方式
            </h2>
            <p className="text-muted-foreground text-lg">
              Three simple steps to create your memorial video
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {/* Step 1 */}
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary">
                1
              </div>
              <h3 className="text-xl font-semibold">上傳照片</h3>
              <p className="text-sm text-muted-foreground">Upload Photos</p>
              <p className="text-muted-foreground">
                選擇您想要轉化為影片的珍貴照片，支援多張上傳或首末幀模式。
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary">
                2
              </div>
              <h3 className="text-xl font-semibold">AI 生成影片</h3>
              <p className="text-sm text-muted-foreground">AI Generates Video</p>
              <p className="text-muted-foreground">
                選擇場合類型與 AI 模型，一鍵啟動。AI 將在幾分鐘內為您生成高品質影片。
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary">
                3
              </div>
              <h3 className="text-xl font-semibold">編輯 & 下載</h3>
              <p className="text-sm text-muted-foreground">Edit & Download</p>
              <p className="text-muted-foreground">
                使用內建編輯器添加配樂、字幕與特效，完成後直接下載分享。
              </p>
            </div>
          </div>

          <div className="text-center mt-12">
            <Button size="lg" asChild>
              <Link href="/create">立即開始 Get Started</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="border-t border-border bg-card/50 scroll-mt-20">
        <div className="container mx-auto px-4 py-20 md:py-28">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              方案價格
            </h2>
            <p className="text-muted-foreground text-lg">
              Choose the plan that fits your needs
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Free Tier */}
            <Card className="border-border/50 relative">
              <CardContent className="p-8 space-y-6">
                <div className="text-center">
                  <h3 className="text-xl font-semibold">體驗方案</h3>
                  <p className="text-sm text-muted-foreground">Free</p>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">$0</span>
                    <span className="text-muted-foreground">/月 mo</span>
                  </div>
                </div>
                <ul className="space-y-3 text-sm">
                  <PricingItem>每月 2 支影片</PricingItem>
                  <PricingItem>BytePlus 模型</PricingItem>
                  <PricingItem>720p 解析度</PricingItem>
                  <PricingItem>基本編輯器</PricingItem>
                  <PricingItem>社群支援</PricingItem>
                </ul>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/create">免費開始 Get Started</Link>
                </Button>
              </CardContent>
            </Card>

            {/* Standard Tier */}
            <Card className="border-primary relative ring-2 ring-primary/20">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-full">
                最受歡迎 Most Popular
              </div>
              <CardContent className="p-8 space-y-6">
                <div className="text-center">
                  <h3 className="text-xl font-semibold">標準方案</h3>
                  <p className="text-sm text-muted-foreground">Standard</p>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">$9.99</span>
                    <span className="text-muted-foreground">/月 mo</span>
                  </div>
                </div>
                <ul className="space-y-3 text-sm">
                  <PricingItem>每月 15 支影片</PricingItem>
                  <PricingItem highlight>所有 AI 模型</PricingItem>
                  <PricingItem highlight>1080p 解析度</PricingItem>
                  <PricingItem>完整編輯器</PricingItem>
                  <PricingItem>Email 支援</PricingItem>
                </ul>
                <Button className="w-full" asChild>
                  <Link href="/create">選擇方案 Choose Plan</Link>
                </Button>
              </CardContent>
            </Card>

            {/* Pro Tier */}
            <Card className="border-border/50 relative">
              <CardContent className="p-8 space-y-6">
                <div className="text-center">
                  <h3 className="text-xl font-semibold">專業方案</h3>
                  <p className="text-sm text-muted-foreground">Professional</p>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">$29.99</span>
                    <span className="text-muted-foreground">/月 mo</span>
                  </div>
                </div>
                <ul className="space-y-3 text-sm">
                  <PricingItem>每月 60 支影片</PricingItem>
                  <PricingItem highlight>所有 AI 模型</PricingItem>
                  <PricingItem highlight>1080p 解析度</PricingItem>
                  <PricingItem highlight>優先生成佇列</PricingItem>
                  <PricingItem highlight>優先客服支援</PricingItem>
                </ul>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/create">選擇方案 Choose Plan</Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-8">
            所有方案均可隨時取消。價格以美元計算。
            <br />
            All plans can be cancelled anytime. Prices in USD.
          </p>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="border-t border-border scroll-mt-20">
        <div className="container mx-auto px-4 py-20 md:py-28">
          <div className="max-w-2xl mx-auto text-center space-y-8">
            <h2 className="text-3xl md:text-4xl font-bold">
              聯絡我們
            </h2>
            <p className="text-muted-foreground text-lg">
              Have questions? We&apos;d love to hear from you.
            </p>
            <p className="text-muted-foreground">
              如有任何問題或合作提案，歡迎透過以下方式與我們聯繫。
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="outline" size="lg" asChild>
                <a href="mailto:contact@glimmer.video">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  contact@glimmer.video
                </a>
              </Button>
            </div>
            <div className="pt-8">
              <Button size="lg" asChild className="text-lg px-8 py-6">
                <Link href="/create">
                  立即體驗
                  <span className="ml-2 text-sm opacity-75">Try It Now</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 mt-auto">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              &copy; 2026 拾光 Glimmer. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/create" className="hover:text-foreground transition-colors">
                開始製作
              </Link>
              <Link href="/gallery" className="hover:text-foreground transition-colors">
                影片庫
              </Link>
              <a
                href="https://github.com/jazzpujols34/glimmer"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function PricingItem({ children, highlight }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <svg
        className={`w-4 h-4 flex-shrink-0 ${highlight ? 'text-primary' : 'text-muted-foreground'}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      <span className={highlight ? 'text-foreground' : 'text-muted-foreground'}>{children}</span>
    </li>
  );
}

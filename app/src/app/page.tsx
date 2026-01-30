import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = {
  title: '拾光 Glimmer — AI 回憶影片服務 | AI Memorial Video Service',
  description:
    '上傳老照片，AI 自動生成電影級回憶影片。適用於追思告別式、壽宴慶生、婚禮紀念等重要場合。免費體驗，無需安裝軟體。',
  alternates: { canonical: '/' },
};

export default function LandingPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: '拾光 Glimmer',
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web',
    description:
      '上傳老照片，AI 自動生成電影級回憶影片。Upload photos, AI creates cinematic memorial videos.',
    offers: [
      {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        name: '體驗方案 Free',
      },
      {
        '@type': 'Offer',
        price: '9.99',
        priceCurrency: 'USD',
        name: '標準方案 Standard',
      },
      {
        '@type': 'Offer',
        price: '29.99',
        priceCurrency: 'USD',
        name: '專業方案 Professional',
      },
    ],
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '50',
    },
  };

  return (
    <div className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
            <a href="#showcase" className="text-muted-foreground hover:text-foreground transition-colors">
              作品展示
            </a>
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
              功能特色
            </a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">
              方案價格
            </a>
            <a href="#contact" className="text-muted-foreground hover:text-foreground transition-colors">
              聯絡我們
            </a>
          </nav>
          <Button size="sm" asChild>
            <Link href="/create">開始製作</Link>
          </Button>
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

      {/* Showcase Section */}
      <section id="showcase" className="border-t border-border bg-card/50 scroll-mt-20">
        <div className="container mx-auto px-4 py-20 md:py-28">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              作品展示
            </h2>
            <p className="text-muted-foreground text-lg">
              See what Glimmer can create for every occasion
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <ShowcaseCard
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />}
              title="追思紀念"
              subtitle="Memorial & Remembrance"
              description="將泛黃老照片化為動態回憶，在告別式上播放，讓至親的身影再次動起來。"
              descEn="Transform faded photos into moving memories for funeral services."
              stat="已服務 50+ 家庭"
            />
            <ShowcaseCard
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />}
              title="壽宴慶生"
              subtitle="Birthday Celebration"
              description="用一生的照片製作感動壽星的回顧影片，大壽派對上最亮眼的節目。"
              descEn="Create heartfelt life retrospectives for milestone birthday celebrations."
              stat="平均製作 3 分鐘"
            />
            <ShowcaseCard
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />}
              title="婚禮紀念"
              subtitle="Wedding Anniversary"
              description="從戀愛到白頭的照片，一鍵生成浪漫週年紀念影片，重溫那些美好時光。"
              descEn="Generate romantic anniversary videos from your journey together."
              stat="支援 1080p 高清"
            />
            <ShowcaseCard
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" />}
              title="其他場合"
              subtitle="Graduation, Retirement & More"
              description="畢業典禮、退休歡送、聚會回顧 — 任何值得紀念的時刻都能製作專屬影片。"
              descEn="Graduations, retirements, reunions — any moment worth remembering."
              stat="多種 AI 模型可選"
            />
          </div>

          <div className="text-center mt-16 space-y-4">
            <p className="text-lg font-medium">
              三步驟，五分鐘，一支感動人心的影片
            </p>
            <p className="text-sm text-muted-foreground">
              Three steps. Five minutes. One unforgettable video.
            </p>
            <Button size="lg" asChild className="text-lg px-8 py-6">
              <Link href="/create">
                免費開始製作
                <span className="ml-2 text-sm opacity-75">Start Free</span>
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="border-t border-border bg-card/30 scroll-mt-20">
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
                <a href="mailto:ro5112@hotmail.com">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  ro5112@hotmail.com
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
              <Link href="/terms" className="hover:text-foreground transition-colors">
                服務條款
              </Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                隱私政策
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

function ShowcaseCard({
  icon,
  title,
  subtitle,
  description,
  descEn,
  stat,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  descEn: string;
  stat: string;
}) {
  return (
    <div className="group space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {icon}
          </svg>
        </div>
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="aspect-video rounded-xl bg-gradient-to-br from-muted/80 to-muted/40 border border-border/50 flex flex-col items-center justify-center gap-4 p-6 text-center group-hover:border-primary/30 transition-colors">
        <p className="text-sm text-foreground/80 leading-relaxed">{description}</p>
        <p className="text-xs text-muted-foreground">{descEn}</p>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {stat}
        </span>
      </div>
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

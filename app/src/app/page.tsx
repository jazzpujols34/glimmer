import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';
import { Card, CardContent } from '@/components/ui/card';
import { MobileNav } from '@/components/MobileNav';
import { HeroDemoVideo } from '@/components/HeroDemoVideo';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ContactForm, FaqSection } from '@/components/landing/LazyClientSections';
import { CREDIT_PACKS } from '@/lib/packs';

// Interactive showcase cards (client component)
const ShowcaseCardInteractive = dynamic(
  () => import('@/components/ShowcaseCardInteractive').then((m) => m.ShowcaseCardInteractive),
  { ssr: true }
);

// Lazy-loaded below-fold sections for faster initial paint
const ComparisonSection = dynamic(
  () => import('@/components/landing/ComparisonSection').then((m) => m.ComparisonSection),
  { ssr: true, loading: () => <SectionSkeleton /> }
);

// Skeleton placeholder for lazy-loaded sections
function SectionSkeleton() {
  return <div className="container mx-auto px-4 py-20 animate-pulse space-y-8">
    <div className="h-8 bg-muted/40 rounded w-48 mx-auto" />
    <div className="h-4 bg-muted/30 rounded w-64 mx-auto" />
    <div className="h-40 bg-muted/20 rounded max-w-4xl mx-auto" />
  </div>;
}

export const metadata: Metadata = {
  title: '拾光 Glimmer — AI 回憶影片服務 | AI Memorial Video Service',
  description:
    '上傳老照片或寵物照片，AI 自動生成電影級回憶影片。適用於追思告別式、壽宴慶生、婚禮紀念、寵物紀念等場合。免費體驗，無需安裝軟體。',
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
      { '@type': 'Offer', price: '0', priceCurrency: 'TWD', name: '免費體驗 3 次生成' },
      ...Object.values(CREDIT_PACKS).map((pack) => ({
        '@type': 'Offer',
        price: String(pack.priceTWD),
        priceCurrency: 'TWD',
        name: pack.label,
      })),
    ],
  };

  return (
    <div className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Navigation */}
      <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur z-50 relative">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Logo />
          <nav className="hidden sm:flex items-center gap-6 text-sm">
            <a href="#showcase" className="text-muted-foreground hover:text-foreground transition-colors">
              作品展示
            </a>
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
              產品優勢
            </a>
            <a href="#why-us" className="text-muted-foreground hover:text-foreground transition-colors">
              方案比較
            </a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">
              方案價格
            </a>
            <a href="#business" className="text-muted-foreground hover:text-foreground transition-colors">
              企業方案
            </a>
            <a href="#faq" className="text-muted-foreground hover:text-foreground transition-colors">
              常見問題
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <Button size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/create">免費開始製作</Link>
            </Button>
            <MobileNav />
          </div>
        </div>
      </header>

      <main>
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
            上傳老照片或寵物照片，AI 自動生成電影級回憶影片。適用於追思、壽宴、婚禮、寵物紀念等重要場合。
          </p>
          <p className="text-sm text-muted-foreground">
            Upload photos of loved ones or beloved pets — AI creates cinematic memorial videos for life&apos;s most meaningful moments.
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

          {/* Hero Demo Video */}
          <div className="max-w-4xl mx-auto pt-8">
            <HeroDemoVideo />
          </div>
        </div>
      </section>

      {/* Showcase Section */}
      <section id="showcase" className="border-t border-border bg-card/50 scroll-mt-20">
        <div className="container mx-auto px-4 py-20 md:py-28">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              作品展示
            </h2>
            <p className="text-muted-foreground text-lg">
              See what Glimmer can create for every occasion
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <ShowcaseCardInteractive
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />}
              title="追思紀念"
              subtitle="Memorial & Remembrance"
              description="將泛黃老照片化為動態回憶，在告別式上播放，讓至親的身影再次動起來。"
              descEn="Transform faded photos into moving memories for funeral services."
              stat="支援直式與橫式"
              videoUrl="/showcase-video-1.mp4"
            />
            <ShowcaseCardInteractive
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />}
              title="壽宴慶生"
              subtitle="Birthday Celebration"
              description="用一生的照片製作感動壽星的回顧影片，大壽派對上最亮眼的節目。"
              descEn="Create heartfelt life retrospectives for milestone birthday celebrations."
              stat="平均製作 3 分鐘"
              videoUrl="/showcase-video-birthday.mp4"
            />
            <ShowcaseCardInteractive
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />}
              title="婚禮紀念"
              subtitle="Wedding Anniversary"
              description="從戀愛到白頭的照片，一鍵生成浪漫週年紀念影片，重溫那些美好時光。"
              descEn="Generate romantic anniversary videos from your journey together."
              stat="支援 1080p 高清"
              videoUrl="/showcase-video-wedding.mp4"
            />
            <ShowcaseCardInteractive
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3.25a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H3.75" />}
              title="寵物紀念"
              subtitle="Pet Memorial"
              description="讓毛孩的照片動起來 — 輕柔的呼吸、微微的耳朵動作，留住最溫暖的陪伴時光。"
              descEn="Bring pet photos to life with gentle breathing and soft movements."
              stat="貓狗及各類寵物"
              videoUrl="/showcase-video-pets.mp4"
            />
            <ShowcaseCardInteractive
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" />}
              title="畢業典禮"
              subtitle="Graduation Ceremony"
              description="從入學到畢業的成長足跡，製作一支專屬畢業回顧影片，在典禮上驚喜播放。"
              descEn="Create a growth retrospective from freshman year to graduation day."
              stat="多種 AI 模型可選"
            />
            <ShowcaseCardInteractive
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />}
              title="退休歡送"
              subtitle="Retirement & Reunions"
              description="退休歡送、同學會、家族聚會 — 任何值得紀念的時刻都能製作專屬影片。"
              descEn="Retirements, reunions, family gatherings — any moment worth remembering."
              stat="支援多張照片"
              videoUrl="/showcase-video-other.mp4"
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

      {/* Social Proof / Testimonials Section */}
      <section id="testimonials" className="border-t border-border scroll-mt-20">
        <div className="container mx-auto px-4 py-20 md:py-28">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              為什麼我們打造拾光
            </h2>
            <p className="text-muted-foreground text-lg">
              The story behind Glimmer
            </p>
          </div>

          {/* Founder story */}
          <div className="max-w-3xl mx-auto mb-16">
            <blockquote className="relative p-8 rounded-2xl bg-card/80 border border-border/50">
              <svg className="absolute top-4 left-4 w-8 h-8 text-primary/20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10H14.017zM0 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151C7.546 6.068 5.983 8.789 5.983 11H10v10H0z" />
              </svg>
              <p className="text-lg leading-relaxed pl-8">
                「整理家中老照片時，看著那些泛黃的面孔，我想：如果他們能再動一次就好了。
                一個微笑、一次呼吸、一個轉頭的瞬間 — 哪怕只有幾秒，也足以讓回憶重新鮮活起來。
                這就是拾光誕生的原因。」
              </p>
              <p className="text-sm text-muted-foreground mt-4 pl-8 italic">
                &ldquo;While sorting through old family photos, I wished those faded faces could move once more.
                A smile, a breath, a turn of the head — even a few seconds would bring the memories back to life.
                That&apos;s why Glimmer was born.&rdquo;
              </p>
              <div className="flex items-center gap-3 mt-6 pl-8">
                <div>
                  <p className="text-xs text-muted-foreground">— Jazz Lien, 拾光 Glimmer 創辦人 / Founder</p>
                </div>
              </div>
            </blockquote>
          </div>

          {/* User testimonials */}
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto mb-16">
            <blockquote className="relative p-6 rounded-2xl bg-card/80 border border-border/50">
              <svg className="absolute top-3 left-3 w-6 h-6 text-primary/20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10H14.017zM0 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151C7.546 6.068 5.983 8.789 5.983 11H10v10H0z" />
              </svg>
              <p className="text-base leading-relaxed pl-6">
                「已經好多年看不見活跳跳的他們了，那些瞬間自己很喜歡，但沒有錄到影。收到影片的當下真的很感動。」
              </p>
              <div className="flex items-center gap-3 mt-4 pl-6">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <p className="text-xs text-muted-foreground">Ming C., 寵物紀念</p>
              </div>
            </blockquote>

            <blockquote className="relative p-6 rounded-2xl bg-card/80 border border-border/50">
              <svg className="absolute top-3 left-3 w-6 h-6 text-primary/20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10H14.017zM0 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151C7.546 6.068 5.983 8.789 5.983 11H10v10H0z" />
              </svg>
              <p className="text-base leading-relaxed pl-6">
                「他們彷彿又活過來了 — 這種心情，能救贖走不出去的思念。」
              </p>
              <div className="flex items-center gap-3 mt-4 pl-6">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <p className="text-xs text-muted-foreground">Wei L., 追思紀念</p>
              </div>
            </blockquote>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto text-center">
            <div className="space-y-2">
              <p className="text-3xl md:text-4xl font-bold text-primary">50+</p>
              <p className="text-sm text-muted-foreground">家庭已使用<br /><span className="text-xs">Families served</span></p>
            </div>
            <div className="space-y-2">
              <p className="text-3xl md:text-4xl font-bold text-primary">5</p>
              <p className="text-sm text-muted-foreground">場合類型<br /><span className="text-xs">Occasion types</span></p>
            </div>
            <div className="space-y-2">
              <p className="text-3xl md:text-4xl font-bold text-primary">4</p>
              <p className="text-sm text-muted-foreground">AI 模型可選<br /><span className="text-xs">AI models available</span></p>
            </div>
            <div className="space-y-2">
              <p className="text-3xl md:text-4xl font-bold text-primary">5 min</p>
              <p className="text-sm text-muted-foreground">平均生成時間<br /><span className="text-xs">Avg. generation time</span></p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section — Benefits-first framing */}
      <section id="features" className="border-t border-border bg-card/30 scroll-mt-20">
        <div className="container mx-auto px-4 py-20 md:py-28">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              拾光的優勢
            </h2>
            <p className="text-muted-foreground text-lg">
              What makes Glimmer special
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {/* Benefit 1: One photo → one video */}
            <Card className="border-border/50 hover:border-primary/30 transition-colors">
              <CardContent className="p-6 text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
                  <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold">一張照片，一支影片</h3>
                <p className="text-sm text-muted-foreground">
                  One Photo, One Video
                </p>
                <p className="text-sm text-muted-foreground">
                  上傳一張照片，幾分鐘後就能拿到一支電影級影片。不需要任何剪輯經驗，AI 幫你完成一切。
                </p>
              </CardContent>
            </Card>

            {/* Benefit 2: No software needed */}
            <Card className="border-border/50 hover:border-primary/30 transition-colors">
              <CardContent className="p-6 text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
                  <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold">不用下載任何軟體</h3>
                <p className="text-sm text-muted-foreground">
                  No Software to Install
                </p>
                <p className="text-sm text-muted-foreground">
                  直接在瀏覽器編輯影片：裁剪、配樂、字幕全部搞定。手機、平板、電腦都能用。
                </p>
              </CardContent>
            </Card>

            {/* Benefit 3: AI understands the occasion */}
            <Card className="border-border/50 hover:border-primary/30 transition-colors">
              <CardContent className="p-6 text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
                  <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold">AI 懂得場合的溫度</h3>
                <p className="text-sm text-muted-foreground">
                  AI Feels the Moment
                </p>
                <p className="text-sm text-muted-foreground">
                  追思用溫柔平靜、壽宴用歡樂喜慶、婚禮用浪漫唯美 — AI 自動調整動畫風格，讓影片符合場合氛圍。
                </p>
              </CardContent>
            </Card>

            {/* Benefit 4: Ready to share */}
            <Card className="border-border/50 hover:border-primary/30 transition-colors">
              <CardContent className="p-6 text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
                  <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold">完成即可分享</h3>
                <p className="text-sm text-muted-foreground">
                  Ready to Share
                </p>
                <p className="text-sm text-muted-foreground">
                  配樂、字幕都已燒錄在影片中，一鍵下載就能直接分享到 LINE、Facebook，或在活動上播放。
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

      {/* Why Us — Comparison Section (lazy-loaded) */}
      <Suspense fallback={<SectionSkeleton />}>
        <ComparisonSection />
      </Suspense>

      {/* Pricing Section */}
      <section id="pricing" className="border-t border-border scroll-mt-20">
        <div className="container mx-auto px-4 py-20 md:py-28">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              方案價格
            </h2>
            <p className="text-muted-foreground text-lg">
              自己動手 DIY 或交給我們全程服務
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              DIY with our platform, or let us handle everything for you
            </p>
          </div>

          {/* Two Tracks */}
          <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {/* Track 1: DIY */}
            <div className="space-y-6">
              <div className="text-center pb-4 border-b border-border">
                <h3 className="text-xl font-bold">自己動手 DIY</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  使用我們的平台自行生成 AI 片段並編輯
                </p>
                <p className="text-xs text-muted-foreground">
                  Use our platform to generate AI clips and edit yourself
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                {/* Free Trial */}
                <Card className="border-border/50">
                  <CardContent className="p-5 space-y-4">
                    <div className="text-center">
                      <h4 className="font-semibold">免費體驗</h4>
                      <p className="text-xs text-muted-foreground">Free Trial</p>
                      <div className="mt-2">
                        <span className="text-2xl font-bold">NT$0</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">3 次 AI 生成</p>
                    </div>
                    <ul className="space-y-1.5 text-sm">
                      <PricingItem>3 次 AI 片段生成</PricingItem>
                      <PricingItem>完整編輯器</PricingItem>
                      <PricingItem>無限次匯出</PricingItem>
                    </ul>
                    <Button variant="outline" size="sm" className="w-full" asChild>
                      <Link href="/create">免費開始</Link>
                    </Button>
                  </CardContent>
                </Card>

                {/* Generation Pack */}
                <Card className="border-primary ring-1 ring-primary/20">
                  <CardContent className="p-5 space-y-4">
                    <div className="text-center">
                      <h4 className="font-semibold">生成次數包</h4>
                      <p className="text-xs text-muted-foreground">Generation Packs</p>
                      <div className="mt-2">
                        <span className="text-2xl font-bold">NT$299</span>
                        <span className="text-sm text-muted-foreground"> 起</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">20 次起購</p>
                    </div>
                    <ul className="space-y-1.5 text-sm">
                      <PricingItem highlight>20 次 NT$299</PricingItem>
                      <PricingItem highlight>50 次 NT$599</PricingItem>
                      <PricingItem>次數永不過期</PricingItem>
                    </ul>
                    <Button size="sm" className="w-full" asChild>
                      <Link href="/create">購買次數</Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                每次生成產出一段 5-12 秒 AI 片段，用編輯器組合成完整影片
              </p>
            </div>

            {/* Track 2: Full Service */}
            <div className="space-y-6">
              <div className="text-center pb-4 border-b border-border">
                <h3 className="text-xl font-bold text-primary">全程代製服務</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  您提供照片，我們交付完整影片
                </p>
                <p className="text-xs text-muted-foreground">
                  Send us photos, we deliver a finished video
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                {/* Standard Package */}
                <Card className="border-border/50">
                  <CardContent className="p-5 space-y-4">
                    <div className="text-center">
                      <h4 className="font-semibold">標準方案</h4>
                      <p className="text-xs text-muted-foreground">Standard</p>
                      <div className="mt-2">
                        <span className="text-2xl font-bold">NT$2,999</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">60-90 秒影片</p>
                    </div>
                    <ul className="space-y-1.5 text-sm">
                      <PricingItem>5-10 張照片</PricingItem>
                      <PricingItem>配樂 + 字幕</PricingItem>
                      <PricingItem>3 個工作天交付</PricingItem>
                    </ul>
                    <Button variant="outline" size="sm" className="w-full" asChild>
                      <a href="mailto:glimmer.hello@gmail.com?subject=標準方案詢問">聯繫我們</a>
                    </Button>
                  </CardContent>
                </Card>

                {/* Premium Package */}
                <Card className="border-primary ring-1 ring-primary/20">
                  <CardContent className="p-5 space-y-4">
                    <div className="text-center">
                      <h4 className="font-semibold">精緻方案</h4>
                      <p className="text-xs text-muted-foreground">Premium</p>
                      <div className="mt-2">
                        <span className="text-2xl font-bold">NT$5,999</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">120-180 秒影片</p>
                    </div>
                    <ul className="space-y-1.5 text-sm">
                      <PricingItem highlight>10-20 張照片</PricingItem>
                      <PricingItem highlight>精緻剪輯 + 特效</PricingItem>
                      <PricingItem>1 次免費修改</PricingItem>
                    </ul>
                    <Button size="sm" className="w-full" asChild>
                      <a href="mailto:glimmer.hello@gmail.com?subject=精緻方案詢問">聯繫我們</a>
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                適合追思告別式、壽宴、婚禮等重要場合，專人服務確保品質
              </p>
            </div>
          </div>

          {/* Enterprise Note */}
          <div className="max-w-2xl mx-auto mt-12 p-6 rounded-xl border border-border/50 bg-card/50 text-center">
            <h4 className="font-semibold mb-2">殯葬業者 / 婚禮公司 / 活動企劃</h4>
            <p className="text-sm text-muted-foreground mb-4">
              提供企業專屬大量優惠方案，統一管理帳戶與帳單
            </p>
            <Button variant="outline" asChild>
              <a href="mailto:glimmer.hello@gmail.com?subject=企業合作詢問">
                洽談企業合作 Contact for Enterprise
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* For Businesses Section */}
      <section id="business" className="border-t border-border bg-card/50 scroll-mt-20">
        <div className="container mx-auto px-4 py-20 md:py-28">
          <div className="max-w-3xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              企業方案 For Businesses
            </div>

            <h2 className="text-3xl md:text-4xl font-bold">
              為您的客戶打造專屬回憶影片
            </h2>
            <p className="text-muted-foreground text-lg">
              Volume pricing for funeral homes, wedding planners, and event companies
            </p>
            <p className="text-muted-foreground">
              殯葬業者、婚禮企劃、活動公司 — 拾光提供企業專屬大量優惠方案，
              讓您為每一位客戶提供高品質的 AI 回憶影片服務。
            </p>

            <div className="grid sm:grid-cols-3 gap-6 pt-4">
              <div className="p-6 rounded-xl border border-border/50 space-y-2">
                <p className="text-2xl font-bold text-primary">量身定價</p>
                <p className="text-sm text-muted-foreground">依使用量客製化報價<br />Custom volume pricing</p>
              </div>
              <div className="p-6 rounded-xl border border-border/50 space-y-2">
                <p className="text-2xl font-bold text-primary">專屬帳戶</p>
                <p className="text-sm text-muted-foreground">統一管理 & 帳單<br />Unified management & billing</p>
              </div>
              <div className="p-6 rounded-xl border border-border/50 space-y-2">
                <p className="text-2xl font-bold text-primary">優先支援</p>
                <p className="text-sm text-muted-foreground">專人客服 & 技術支援<br />Dedicated support</p>
              </div>
            </div>

            <Button size="lg" variant="outline" asChild className="text-lg px-8 py-6">
              <a href="mailto:glimmer.hello@gmail.com">
                聯繫我們洽談合作
                <span className="ml-2 text-sm opacity-75">Contact Us</span>
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ Section (lazy-loaded) */}
      <Suspense fallback={<SectionSkeleton />}>
        <FaqSection />
      </Suspense>

      {/* Contact Section */}
      <section id="contact" className="border-t border-border scroll-mt-20">
        <div className="container mx-auto px-4 py-20 md:py-28">
          <div className="max-w-2xl mx-auto space-y-8">
            <div className="text-center space-y-4">
              <h2 className="text-3xl md:text-4xl font-bold">
                聯絡我們
              </h2>
              <p className="text-muted-foreground text-lg">
                Have questions? We&apos;d love to hear from you.
              </p>
              <p className="text-muted-foreground">
                如有任何問題或合作提案，歡迎填寫以下表單與我們聯繫。
              </p>
            </div>

            <Suspense fallback={<SectionSkeleton />}>
              <ContactForm />
            </Suspense>

            <div className="text-center pt-4">
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
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 mt-auto">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground text-center md:text-left">
              <p>&copy; 2026 拾光 Glimmer. All rights reserved.</p>
              <p className="mt-1 text-xs">
                聯絡信箱：<a href="mailto:glimmer.hello@gmail.com">glimmer.hello@gmail.com</a>
              </p>
            </div>
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


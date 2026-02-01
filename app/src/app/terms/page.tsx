import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

export const metadata: Metadata = {
  title: '服務條款 Terms of Service - 拾光 Glimmer',
  description: '拾光 Glimmer 服務條款',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <Logo />
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">服務條款</h1>
        <p className="text-muted-foreground mb-8">Terms of Service</p>
        <p className="text-sm text-muted-foreground mb-8">最後更新 Last updated: 2026-01-30</p>

        <div className="prose prose-invert max-w-none space-y-8 text-foreground/90">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. 服務說明 Service Description</h2>
            <p>
              拾光 Glimmer（以下簡稱「本服務」）是一個 AI 驅動的影片生成平台，
              允許用戶上傳照片並透過人工智慧技術將其轉化為影片。
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              Glimmer (&quot;the Service&quot;) is an AI-powered video generation platform that allows
              users to upload photos and transform them into videos using artificial intelligence technology.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. 使用資格 Eligibility</h2>
            <p>
              您必須年滿 18 歲或在您所在司法管轄區達到法定成年年齡才能使用本服務。
              使用本服務即表示您同意受這些條款約束。
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              You must be at least 18 years old or have reached the age of majority in your jurisdiction
              to use this Service. By using the Service, you agree to be bound by these terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. 用戶內容 User Content</h2>
            <p>
              您保留您上傳到本服務的所有照片和內容的所有權。透過上傳內容，您授予我們
              有限的許可，僅用於提供影片生成服務。我們不會將您的內容用於其他目的。
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              You retain ownership of all photos and content you upload. By uploading, you grant us
              a limited license solely to provide the video generation service. We will not use your
              content for any other purpose.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. 禁止用途 Prohibited Uses</h2>
            <p>您不得使用本服務：</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>上傳您無權使用的內容</li>
              <li>生成違法、仇恨、色情或有害內容</li>
              <li>嘗試逆向工程、濫用或攻擊本服務</li>
              <li>轉售或重新分發本服務的訪問權限</li>
            </ul>
            <p className="text-muted-foreground text-sm mt-2">
              You may not: upload content you don&apos;t have rights to use; generate illegal, hateful,
              pornographic, or harmful content; attempt to reverse-engineer, abuse, or attack the Service;
              resell or redistribute access to the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. 付費方案與退款 Pricing &amp; Refunds</h2>
            <p>
              本服務提供免費和付費方案。付費方案按月計費。如果影片生成因技術原因失敗，
              該次生成不會計入您的配額。我們目前不提供退款，但會在服務出現問題時提供額度補償。
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              The Service offers free and paid plans, billed monthly. Failed generations due to
              technical issues will not count against your quota. We do not currently offer refunds
              but will provide credit compensation for service issues.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. 服務可用性 Service Availability</h2>
            <p>
              我們努力維持服務的穩定運行，但不保證 100% 的可用性。
              AI 生成的影片品質可能因照片品質和內容而異。
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              We strive for stable operation but do not guarantee 100% uptime.
              AI-generated video quality may vary based on photo quality and content.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. 免責聲明 Disclaimer</h2>
            <p>
              本服務按「現狀」提供。我們不對 AI 生成的影片內容的準確性、
              適用性或品質做出任何保證。
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              The Service is provided &quot;as is.&quot; We make no warranties regarding the accuracy,
              suitability, or quality of AI-generated video content.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. 聯絡方式 Contact</h2>
            <p>
              如有任何問題，請透過以下方式聯絡我們：
            </p>
            <p className="mt-2">
              <a href="mailto:glimmer.hello@gmail.com" className="text-primary hover:underline">
                glimmer.hello@gmail.com
              </a>
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-border py-6 mt-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">&larr; 返回首頁 Back to Home</Link>
        </div>
      </footer>
    </div>
  );
}

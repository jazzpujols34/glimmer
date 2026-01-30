import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '隱私政策 Privacy Policy - 拾光 Glimmer',
  description: '拾光 Glimmer 隱私政策',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <Link href="/" className="text-lg font-bold hover:text-primary transition-colors">
            拾光 Glimmer
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">隱私政策</h1>
        <p className="text-muted-foreground mb-8">Privacy Policy</p>
        <p className="text-sm text-muted-foreground mb-8">最後更新 Last updated: 2026-01-30</p>

        <div className="prose prose-invert max-w-none space-y-8 text-foreground/90">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. 資訊收集 Information We Collect</h2>
            <p>我們收集以下類型的資訊：</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>您提供的資訊：</strong>姓名、電子郵件地址（註冊時）、上傳的照片</li>
              <li><strong>自動收集的資訊：</strong>IP 地址、瀏覽器類型、使用記錄</li>
              <li><strong>付款資訊：</strong>透過第三方支付處理商（Stripe）處理，我們不直接儲存信用卡資訊</li>
            </ul>
            <p className="text-muted-foreground text-sm mt-2">
              We collect: information you provide (name, email, uploaded photos);
              automatically collected data (IP address, browser type, usage logs);
              payment information processed through Stripe (we do not store credit card details).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. 資訊使用 How We Use Information</h2>
            <p>我們使用您的資訊來：</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>提供影片生成服務</li>
              <li>處理付款和管理帳戶</li>
              <li>改善服務品質</li>
              <li>與您溝通有關服務的事項</li>
            </ul>
            <p className="text-muted-foreground text-sm mt-2">
              We use your information to: provide the video generation service; process payments
              and manage accounts; improve service quality; communicate with you about the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. 照片與影片處理 Photo &amp; Video Processing</h2>
            <p>
              您上傳的照片會被傳送至第三方 AI 服務提供商（包括 BytePlus、Google Vertex AI、Kling AI）
              進行影片生成。這些提供商有各自的資料處理政策。照片在處理完成後不會被我們長期保留。
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              Uploaded photos are sent to third-party AI providers (BytePlus, Google Vertex AI, Kling AI)
              for video generation. These providers have their own data processing policies. Photos are
              not retained by us after processing is complete.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. 資料保留 Data Retention</h2>
            <p>
              生成的影片連結在完成後保留 24 小時（免費方案）或 30 天（付費方案）。
              帳戶資料在您刪除帳戶後 30 天內完全刪除。
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              Generated video links are retained for 24 hours (free plan) or 30 days (paid plans).
              Account data is fully deleted within 30 days of account deletion.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. 資料安全 Data Security</h2>
            <p>
              我們採用業界標準的安全措施保護您的資訊，包括傳輸加密（TLS）和安全的雲端儲存。
              但是，沒有任何網路傳輸或電子儲存方式是 100% 安全的。
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              We employ industry-standard security measures including TLS encryption and secure cloud
              storage. However, no method of transmission or storage is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. 第三方服務 Third-Party Services</h2>
            <p>本服務使用以下第三方服務：</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Cloudflare：</strong>託管與 CDN</li>
              <li><strong>BytePlus / Google AI / Kling AI：</strong>影片生成</li>
              <li><strong>Stripe：</strong>付款處理</li>
              <li><strong>OpenAI：</strong>語音轉文字（字幕功能）</li>
            </ul>
            <p className="text-muted-foreground text-sm mt-2">
              We use: Cloudflare (hosting &amp; CDN), BytePlus / Google AI / Kling AI (video generation),
              Stripe (payment processing), OpenAI (speech-to-text for subtitles).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. 您的權利 Your Rights</h2>
            <p>您有權：</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>訪問我們持有的您的個人資料</li>
              <li>要求更正不準確的資訊</li>
              <li>要求刪除您的資料和帳戶</li>
              <li>要求匯出您的資料</li>
            </ul>
            <p className="text-muted-foreground text-sm mt-2">
              You have the right to: access your personal data; request corrections;
              request deletion of your data and account; request data export.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Cookie 政策 Cookies</h2>
            <p>
              我們使用必要的 Cookie 來維持您的登入狀態和偏好設定。
              我們不使用追蹤型 Cookie 或第三方廣告 Cookie。
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              We use essential cookies for login sessions and preferences. We do not use
              tracking cookies or third-party advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. 聯絡方式 Contact</h2>
            <p>
              如有任何隱私相關問題，請聯絡：
            </p>
            <p className="mt-2">
              <a href="mailto:ro5112@hotmail.com" className="text-primary hover:underline">
                ro5112@hotmail.com
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

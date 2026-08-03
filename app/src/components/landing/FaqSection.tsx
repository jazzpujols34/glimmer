'use client';

export function FaqSection() {
  return (
    <section id="faq" className="border-t border-border bg-card/30 scroll-mt-20">
      <div className="container mx-auto px-4 py-20 md:py-28">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            常見問題
          </h2>
          <p className="text-muted-foreground text-lg">
            Frequently Asked Questions
          </p>
        </div>

        <div className="max-w-3xl mx-auto space-y-4">
          <FaqItem
            q="「生成」和「影片」有什麼不同？"
            qEn="What's the difference between a 'generation' and a 'video'?"
            a="「生成」會產出一段 5-12 秒的 AI 動態片段。一支完整的「影片」（90-180 秒）是由多個生成片段加上音樂、字幕剪輯而成。DIY 用戶可用編輯器自行組合，或選擇全程代製服務由我們為您完成。"
            aEn="One 'generation' creates a 5-12 second AI clip. A complete 'video' (90-180 sec) is made by combining multiple clips with music and subtitles. DIY users can edit themselves, or choose our full-service option."
          />
          <FaqItem
            q="免費體驗包含什麼？"
            qEn="What's included in the free trial?"
            a="每個 Email 可獲得 3 次免費 AI 生成、完整編輯器、無限次匯出。足夠試做幾段不同照片，確認效果再決定購買。"
            aEn="Each email gets 3 free AI generations, full editor access, and unlimited exports. Enough to try a few photo variations and decide before purchasing."
          />
          <FaqItem
            q="需要多久才能生成一段片段？"
            qEn="How long does one generation take?"
            a="每次生成大約 2-5 分鐘。生成過程中可以離開頁面，稍後在影片庫查看結果。"
            aEn="Each generation takes about 2-5 minutes. You can leave the page and check results in the gallery later."
          />
          <FaqItem
            q="全程代製服務如何運作？"
            qEn="How does the full-service option work?"
            a="您只需提供照片和場合說明，我們的團隊會為您完成所有生成、剪輯、配樂工作，交付一支可直接使用的完整影片。適合沒時間或不熟悉技術的用戶。"
            aEn="Just send us photos and occasion details. Our team handles all generation, editing, and music. We deliver a ready-to-use video. Perfect for those who prefer a hands-off approach."
          />
          <FaqItem
            q="支援哪些照片格式？"
            qEn="What photo formats are supported?"
            a="支援 JPG、PNG、WebP 等常見格式。建議使用解析度較高的照片以獲得最佳效果。"
            aEn="JPG, PNG, WebP and other common formats. Higher resolution photos produce better results."
          />
          <FaqItem
            q="點數會過期嗎？"
            qEn="Do generations expire?"
            a="不會！購買的點數永不過期，可以隨時使用。免費的 3 次也不會過期。"
            aEn="No! Purchased generations never expire. The 3 free generations don't expire either."
          />
          <FaqItem
            q="影片下載連結會過期嗎？"
            qEn="Do video download links expire?"
            a="AI 生成的片段連結會在 24 小時後過期，請及時下載。但使用編輯器匯出的完整影片會直接下載到您的裝置，不受影響。"
            aEn="AI-generated clip links expire after 24 hours — download promptly. However, videos exported from the editor download directly to your device."
          />
          <FaqItem
            q="需要安裝軟體嗎？"
            qEn="Do I need to install any software?"
            a="完全不需要。拾光是一個網頁應用程式，用瀏覽器打開就能使用，包括影片編輯和匯出功能。"
            aEn="Not at all. Glimmer is a web app — open your browser and start creating, including video editing and export."
          />
        </div>
      </div>
    </section>
  );
}

function FaqItem({
  q,
  qEn,
  a,
  aEn,
}: {
  q: string;
  qEn: string;
  a: string;
  aEn: string;
}) {
  return (
    <details className="group rounded-lg border border-border/50 hover:border-primary/30 transition-colors">
      <summary className="flex items-center justify-between cursor-pointer p-5 font-medium">
        <div>
          <span>{q}</span>
          <span className="block text-xs text-muted-foreground font-normal mt-0.5">{qEn}</span>
        </div>
        <svg
          className="w-5 h-5 text-muted-foreground flex-shrink-0 ml-4 transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="px-5 pb-5 space-y-2">
        <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
        <p className="text-xs text-muted-foreground/70 italic">{aEn}</p>
      </div>
    </details>
  );
}

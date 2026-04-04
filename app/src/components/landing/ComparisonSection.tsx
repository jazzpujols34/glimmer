import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function ComparisonSection() {
  return (
    <section id="why-us" className="border-t border-border bg-card/50 scroll-mt-20">
      <div className="container mx-auto px-4 py-20 md:py-28">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            與傳統方案比較
          </h2>
          <p className="text-muted-foreground text-lg">
            See how Glimmer compares
          </p>
        </div>

        {/* Desktop table */}
        <div className="max-w-4xl mx-auto hidden sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4 font-medium text-muted-foreground" />
                <th className="p-4 font-medium text-muted-foreground text-center">
                  傳統影片製作
                  <br />
                  <span className="text-xs font-normal">Traditional Production</span>
                </th>
                <th className="p-4 font-medium text-muted-foreground text-center">
                  DIY 剪輯軟體
                  <br />
                  <span className="text-xs font-normal">DIY Editing Software</span>
                </th>
                <th className="p-4 font-semibold text-primary text-center border-x border-primary/20 bg-primary/5 rounded-t-lg">
                  拾光 Glimmer
                  <br />
                  <span className="text-xs font-normal text-primary/80">AI-Powered</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <ComparisonRow label="所需時間" labelEn="Time needed" traditional="數天 ~ 數週" diy="數小時" glimmer="5 分鐘" />
              <ComparisonRow label="費用" labelEn="Cost" traditional="NT$15,000+" diy="免費 ~ $30/月" glimmer="免費 1 支 / NT$400 起" />
              <ComparisonRow label="技術門檻" labelEn="Skill required" traditional="專業剪輯師" diy="中等學習曲線" glimmer="零門檻" />
              <ComparisonRow label="AI 照片動畫" labelEn="AI photo animation" traditional="—" diy="—" glimmer="✓" isCheck />
              <ComparisonRow label="場合感知 AI" labelEn="Occasion-aware AI" traditional="手動調整" diy="手動調整" glimmer="✓ 自動適配" isCheck />
              <ComparisonRow label="瀏覽器編輯" labelEn="Browser-based editor" traditional="—" diy="需安裝軟體" glimmer="✓" isCheck />
              <ComparisonRow label="配樂 + 字幕" labelEn="Music + subtitles" traditional="額外收費" diy="需手動操作" glimmer="✓ 內建" isCheck />
            </tbody>
          </table>
        </div>

        {/* Mobile stacked cards */}
        <div className="sm:hidden space-y-4 max-w-md mx-auto">
          <MobileComparisonCard
            title="傳統影片製作"
            titleEn="Traditional Production"
            items={[
              { label: '所需時間', value: '數天 ~ 數週' },
              { label: '費用', value: 'NT$15,000+' },
              { label: '技術門檻', value: '專業剪輯師' },
              { label: 'AI 照片動畫', value: '—' },
              { label: '場合感知 AI', value: '手動調整' },
              { label: '瀏覽器編輯', value: '—' },
              { label: '配樂 + 字幕', value: '額外收費' },
            ]}
          />
          <MobileComparisonCard
            title="DIY 剪輯軟體"
            titleEn="DIY Editing Software"
            items={[
              { label: '所需時間', value: '數小時' },
              { label: '費用', value: '免費 ~ $30/月' },
              { label: '技術門檻', value: '中等學習曲線' },
              { label: 'AI 照片動畫', value: '—' },
              { label: '場合感知 AI', value: '手動調整' },
              { label: '瀏覽器編輯', value: '需安裝軟體' },
              { label: '配樂 + 字幕', value: '需手動操作' },
            ]}
          />
          <MobileComparisonCard
            title="拾光 Glimmer"
            titleEn="AI-Powered"
            isHighlighted
            items={[
              { label: '所需時間', value: '5 分鐘', isAdvantage: true },
              { label: '費用', value: '免費 1 支 / NT$400 起', isAdvantage: true },
              { label: '技術門檻', value: '零門檻', isAdvantage: true },
              { label: 'AI 照片動畫', value: '✓', isAdvantage: true },
              { label: '場合感知 AI', value: '✓ 自動適配', isAdvantage: true },
              { label: '瀏覽器編輯', value: '✓', isAdvantage: true },
              { label: '配樂 + 字幕', value: '✓ 內建', isAdvantage: true },
            ]}
          />
        </div>

        <div className="text-center mt-12">
          <Button size="lg" asChild>
            <Link href="/create">免費體驗 Try Free</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function ComparisonRow({
  label,
  labelEn,
  traditional,
  diy,
  glimmer,
  isCheck,
}: {
  label: string;
  labelEn: string;
  traditional: string;
  diy: string;
  glimmer: string;
  isCheck?: boolean;
}) {
  return (
    <tr className="border-b border-border/50">
      <td className="p-4 font-medium">
        {label}
        <br />
        <span className="text-xs text-muted-foreground font-normal">{labelEn}</span>
      </td>
      <td className="p-4 text-center text-muted-foreground">{traditional}</td>
      <td className="p-4 text-center text-muted-foreground">{diy}</td>
      <td className={`p-4 text-center border-x border-primary/20 bg-primary/5 font-semibold ${isCheck ? 'text-primary' : 'text-primary'}`}>
        {glimmer}
      </td>
    </tr>
  );
}

function MobileComparisonCard({
  title,
  titleEn,
  isHighlighted,
  items,
}: {
  title: string;
  titleEn: string;
  isHighlighted?: boolean;
  items: { label: string; value: string; isAdvantage?: boolean }[];
}) {
  return (
    <div className={`rounded-xl border p-5 space-y-3 ${isHighlighted ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border/50'}`}>
      <div className="text-center">
        <h4 className={`font-semibold ${isHighlighted ? 'text-primary' : ''}`}>{title}</h4>
        <p className={`text-xs ${isHighlighted ? 'text-primary/80' : 'text-muted-foreground'}`}>{titleEn}</p>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{item.label}</span>
            <span className={`font-medium ${item.isAdvantage ? 'text-primary' : ''}`}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

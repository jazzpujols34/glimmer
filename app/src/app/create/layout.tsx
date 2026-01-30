import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '建立回憶影片 Create Video',
  description:
    '上傳照片，選擇場合與 AI 模型，幾分鐘內生成感動人心的回憶影片。Upload photos and create AI-powered memorial videos in minutes.',
  alternates: { canonical: '/create' },
  openGraph: {
    title: '建立回憶影片 — 拾光 Glimmer',
    description: '上傳照片，AI 自動生成電影級回憶影片。',
  },
};

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return children;
}

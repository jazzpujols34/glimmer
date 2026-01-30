import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '影片庫 Gallery',
  description:
    '瀏覽您過去生成的所有 AI 回憶影片。Browse all your AI-generated memorial videos.',
  alternates: { canonical: '/gallery' },
  openGraph: {
    title: '影片庫 — 拾光 Glimmer',
    description: '瀏覽您過去生成的所有 AI 回憶影片。',
  },
};

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from 'next';

export const runtime = 'edge';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;

  return {
    title: '您的回憶影片已完成',
    description: '點擊觀看由 拾光 Glimmer AI 生成的動人回憶影片。上傳老照片，AI 自動生成電影級回憶影片。',
    openGraph: {
      title: '您的回憶影片已完成 | 拾光 Glimmer',
      description: '點擊觀看由 AI 生成的動人回憶影片',
      type: 'video.other',
      siteName: '拾光 Glimmer',
    },
    twitter: {
      card: 'summary_large_image',
      title: '您的回憶影片已完成 | 拾光 Glimmer',
      description: '點擊觀看由 AI 生成的動人回憶影片',
    },
  };
}

export default function GenerateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

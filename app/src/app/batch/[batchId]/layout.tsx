export const runtime = 'edge';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '批次生成進度 Batch Progress',
  description: '查看批次影片生成進度。View batch video generation progress.',
  robots: { index: false },
};

export default function BatchLayout({ children }: { children: React.ReactNode }) {
  return children;
}

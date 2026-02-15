export const runtime = 'edge';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '編輯影片 Edit Video',
  description: '使用拾光編輯器編輯、剪輯、添加字幕與音樂。Edit your video with Glimmer editor.',
  robots: { index: false },
};

export default function EditLayout({ children }: { children: React.ReactNode }) {
  return children;
}

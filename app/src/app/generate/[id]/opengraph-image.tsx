import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = '拾光 Glimmer — AI 回憶影片';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* Decorative circles */}
        <div
          style={{
            position: 'absolute',
            top: 40,
            left: 40,
            width: 150,
            height: 150,
            borderRadius: '50%',
            background: 'rgba(255, 215, 0, 0.1)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            right: 80,
            width: 200,
            height: 200,
            borderRadius: '50%',
            background: 'rgba(255, 215, 0, 0.05)',
          }}
        />

        {/* Video play icon */}
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #ffd700 0%, #ffb700 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(255, 215, 0, 0.4)',
            marginBottom: 32,
          }}
        >
          <svg
            width="50"
            height="50"
            viewBox="0 0 24 24"
            fill="#1a1a2e"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: '#ffffff',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <span>您的回憶影片已完成</span>
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 28,
            color: 'rgba(255, 255, 255, 0.7)',
            marginBottom: 48,
          }}
        >
          點擊觀看由 AI 生成的動人影片
        </div>

        {/* Brand */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #ffd700 0%, #ffb700 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#1a1a2e"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          </div>
          <span
            style={{
              fontSize: 32,
              fontWeight: 600,
              color: '#ffd700',
            }}
          >
            拾光 Glimmer
          </span>
        </div>

        {/* Video ID badge */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            fontSize: 16,
            color: 'rgba(255, 255, 255, 0.3)',
          }}
        >
          影片 ID: {id.slice(0, 8)}...
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

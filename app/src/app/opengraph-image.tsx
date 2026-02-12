import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = '拾光 Glimmer — AI 回憶影片服務';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
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
        }}
      >
        {/* Decorative elements */}
        <div
          style={{
            position: 'absolute',
            top: 40,
            left: 40,
            width: 120,
            height: 120,
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

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 24,
          }}
        >
          {/* Logo icon */}
          <div
            style={{
              width: 100,
              height: 100,
              borderRadius: 20,
              background: 'linear-gradient(135deg, #ffd700 0%, #ffb700 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(255, 215, 0, 0.3)',
            }}
          >
            <svg
              width="60"
              height="60"
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

          {/* Brand name */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 16,
            }}
          >
            <span
              style={{
                fontSize: 72,
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '-0.02em',
              }}
            >
              拾光
            </span>
            <span
              style={{
                fontSize: 48,
                fontWeight: 600,
                color: '#ffd700',
              }}
            >
              Glimmer
            </span>
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: 32,
              color: 'rgba(255, 255, 255, 0.8)',
              marginTop: 8,
            }}
          >
            AI 回憶影片服務
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: 22,
              color: 'rgba(255, 255, 255, 0.5)',
              marginTop: 16,
              display: 'flex',
              gap: 24,
            }}
          >
            <span>追思紀念</span>
            <span>·</span>
            <span>壽宴慶生</span>
            <span>·</span>
            <span>婚禮回憶</span>
            <span>·</span>
            <span>寵物紀念</span>
          </div>
        </div>

        {/* Bottom URL */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            fontSize: 20,
            color: 'rgba(255, 255, 255, 0.4)',
          }}
        >
          glimmer.video
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

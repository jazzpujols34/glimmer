'use client';

import { useState } from 'react';

// TODO: Replace with actual demo video URL when available
const DEMO_VIDEO_URL = '';

export function HeroDemoVideo() {
  const [isPlaying, setIsPlaying] = useState(false);

  if (DEMO_VIDEO_URL) {
    return (
      <div className="relative rounded-2xl border border-border/50 bg-card/50 overflow-hidden shadow-xl">
        <video
          src={DEMO_VIDEO_URL}
          className="w-full aspect-video object-cover"
          controls={isPlaying}
          muted
          playsInline
          autoPlay={isPlaying}
          onClick={() => setIsPlaying(true)}
          poster="/assets/demo-poster.jpg"
        />
        {!isPlaying && (
          <button
            onClick={() => setIsPlaying(true)}
            className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors group"
            aria-label="播放示範影片"
          >
            <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <svg className="w-8 h-8 text-primary-foreground ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </button>
        )}
      </div>
    );
  }

  // Placeholder when no demo video is configured
  return (
    <div className="relative rounded-2xl border border-border/50 bg-card/50 overflow-hidden shadow-xl">
      {/* Browser chrome bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-muted/30">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400/60" />
          <div className="w-3 h-3 rounded-full bg-yellow-400/60" />
          <div className="w-3 h-3 rounded-full bg-green-400/60" />
        </div>
        <div className="flex-1 text-center text-xs text-muted-foreground">glimmer.video/create</div>
      </div>

      {/* Before → After visualization */}
      <div className="grid grid-cols-2 divide-x divide-border/30">
        <div className="p-8 text-center space-y-3">
          <div className="w-24 h-24 mx-auto rounded-xl bg-muted/80 border border-border/50 flex items-center justify-center">
            <svg className="w-10 h-10 text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium">上傳一張照片</p>
          <p className="text-xs text-muted-foreground">Upload a photo</p>
        </div>
        <div className="p-8 text-center space-y-3 relative">
          <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-primary flex items-center justify-center z-10">
            <svg className="w-4 h-4 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </div>
          <div className="w-24 h-24 mx-auto rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
            <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-primary">AI 生成影片</p>
          <p className="text-xs text-muted-foreground">AI creates cinematic video</p>
        </div>
      </div>
    </div>
  );
}

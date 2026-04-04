'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface ShowcaseCardInteractiveProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  descEn: string;
  stat: string;
  videoUrl?: string;
  isPortrait?: boolean;
}

export function ShowcaseCardInteractive({
  icon,
  title,
  subtitle,
  description,
  descEn,
  stat,
  videoUrl,
  isPortrait,
}: ShowcaseCardInteractiveProps) {
  const [expanded, setExpanded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleClose = useCallback(() => {
    setExpanded(false);
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) handleClose();
    },
    [handleClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    },
    [handleClose]
  );

  // Portrait layout
  if (videoUrl && isPortrait) {
    return (
      <>
        <div
          className="group space-y-4 cursor-pointer"
          onClick={() => setExpanded(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setExpanded(true);
            }
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {icon}
              </svg>
            </div>
            <div>
              <h3 className="font-semibold">{title}</h3>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1 flex flex-col justify-center">
              <p className="text-sm text-foreground/80 leading-relaxed mb-2">{description}</p>
              <p className="text-xs text-muted-foreground">{descEn}</p>
            </div>
            <div className="w-32 flex-shrink-0">
              <div className="aspect-[9/16] rounded-xl bg-black border border-border/50 overflow-hidden group-hover:border-primary/30 transition-colors relative">
                <video
                  src={videoUrl}
                  className="w-full h-full object-cover"
                  muted
                  loop
                  playsInline
                  autoPlay
                  preload="metadata"
                />
                {/* Hover play icon overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-10 h-10 rounded-full bg-primary/90 flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary-foreground ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
                <div className="absolute bottom-2 right-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-white bg-black/60 backdrop-blur px-2 py-0.5 rounded-full">
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {stat}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Expanded modal */}
        {expanded && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={handleBackdropClick}
            onKeyDown={handleKeyDown}
            role="dialog"
            aria-modal="true"
            aria-label={`${title} preview`}
          >
            <div className="relative max-w-sm w-full bg-card rounded-2xl border border-border overflow-hidden">
              <button
                onClick={handleClose}
                className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="aspect-[9/16] bg-black">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full object-cover"
                  controls
                  autoPlay
                  loop
                  playsInline
                  preload="auto"
                />
              </div>
              <div className="p-4 space-y-3">
                <h3 className="font-semibold">{title} — {subtitle}</h3>
                <p className="text-sm text-muted-foreground">{description}</p>
                <Button size="sm" asChild className="w-full">
                  <Link href="/showcase">
                    觀看更多範例
                    <span className="ml-2 text-xs opacity-75">View More Samples</span>
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Landscape / no-video layout
  return (
    <>
      <div
        className="group space-y-4 cursor-pointer"
        onClick={() => setExpanded(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(true);
          }
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {icon}
            </svg>
          </div>
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="aspect-video rounded-xl bg-gradient-to-br from-muted/80 to-muted/40 border border-border/50 overflow-hidden group-hover:border-primary/30 transition-colors relative">
          {videoUrl ? (
            <>
              <video
                src={videoUrl}
                className="w-full h-full object-cover"
                muted
                loop
                playsInline
                autoPlay
                preload="metadata"
              />
              {/* Hover play icon overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-14 h-14 rounded-full bg-primary/90 flex items-center justify-center">
                  <svg className="w-7 h-7 text-primary-foreground ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">{description}</p>
              <p className="text-xs text-muted-foreground">{descEn}</p>
            </div>
          )}
          <div className="absolute bottom-3 right-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-background/90 backdrop-blur px-3 py-1 rounded-full border border-border/50">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {stat}
            </span>
          </div>
        </div>
        {videoUrl && (
          <div className="px-1">
            <p className="text-sm text-foreground/80 leading-relaxed mb-1">{description}</p>
            <p className="text-xs text-muted-foreground">{descEn}</p>
          </div>
        )}
      </div>

      {/* Expanded modal */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={handleBackdropClick}
          onKeyDown={handleKeyDown}
          role="dialog"
          aria-modal="true"
          aria-label={`${title} preview`}
        >
          <div className="relative max-w-3xl w-full bg-card rounded-2xl border border-border overflow-hidden">
            <button
              onClick={handleClose}
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {videoUrl ? (
              <div className="aspect-video bg-black">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full object-cover"
                  controls
                  autoPlay
                  loop
                  playsInline
                  preload="auto"
                />
              </div>
            ) : (
              <div className="aspect-video bg-gradient-to-br from-muted/80 to-muted/40 flex flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-lg text-foreground/80">{description}</p>
                <p className="text-sm text-muted-foreground">{descEn}</p>
              </div>
            )}
            <div className="p-5 space-y-3">
              <h3 className="font-semibold text-lg">{title} — {subtitle}</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
              <div className="flex gap-3">
                <Button size="sm" asChild>
                  <Link href="/create">
                    免費開始製作
                    <span className="ml-1 text-xs opacity-75">Start Free</span>
                  </Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/showcase">
                    觀看更多範例
                    <span className="ml-1 text-xs opacity-75">More Samples</span>
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

'use client';

export const runtime = 'edge';

import { useState, useRef, use } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { GenerationProgress } from '@/components/GenerationProgress';
import { ChevronLeft, ChevronRight, Clock, FolderOpen, Share2 } from 'lucide-react';
import { trackGenerationComplete, trackGenerationError } from '@/lib/analytics';

// Share button icons
function LineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

interface CompletionData {
  url: string;
  urls: string[];
  analysis?: string;
}

export default function GeneratePage({ params }: PageProps) {
  const { id } = use(params);
  const [result, setResult] = useState<CompletionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleComplete = (url: string, urls: string[], analysis?: string) => {
    setResult({ url, urls, analysis });

    // Track generation complete
    try {
      const stored = localStorage.getItem('glimmer_last_generation');
      if (stored) {
        const { occasion, model } = JSON.parse(stored);
        trackGenerationComplete(occasion, model);
        localStorage.removeItem('glimmer_last_generation');
      }
    } catch { /* ignore */ }
  };

  const handleError = (err: string) => {
    setError(err);

    // Track generation error
    try {
      const stored = localStorage.getItem('glimmer_last_generation');
      if (stored) {
        const { occasion, model } = JSON.parse(stored);
        trackGenerationError(occasion, model, err);
      }
    } catch { /* ignore */ }
  };

  // Current video URL based on carousel index
  const currentVideoUrl = result?.urls?.[currentVideoIndex] || result?.url;
  const totalVideos = result?.urls?.length || 1;
  const hasMultipleVideos = totalVideos > 1;

  // Check if result is an image or video - improved detection
  const isImage = result?.url?.startsWith('data:image/');
  const isVideo = !isImage && result?.url != null; // If not an image, assume it's a video

  const goToPreviousVideo = () => {
    setCurrentVideoIndex((prev) => (prev > 0 ? prev - 1 : totalVideos - 1));
  };

  const goToNextVideo = () => {
    setCurrentVideoIndex((prev) => (prev < totalVideos - 1 ? prev + 1 : 0));
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-3 sm:gap-6 text-sm">
            <Link href="/create" className="text-muted-foreground hover:text-foreground transition-colors">新影片</Link>
            <Link href="/gallery" className="text-muted-foreground hover:text-foreground transition-colors">影片庫</Link>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-12 md:py-20">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="p-8">
            {error ? (
              // Error state
              <div className="space-y-6 text-center">
                <div className="w-20 h-20 mx-auto rounded-full bg-destructive/20 flex items-center justify-center">
                  <svg className="w-10 h-10 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-semibold">發生錯誤</h2>
                  <p className="text-muted-foreground mt-2">{error}</p>
                </div>
                <Button asChild>
                  <Link href="/create">返回重試</Link>
                </Button>
              </div>
            ) : result ? (
              // Complete state
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <div className="w-20 h-20 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
                    <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-semibold">
                    {isVideo ? '影片已完成！' : '處理完成！'}
                  </h2>
                  <p className="text-muted-foreground">
                    {isVideo
                      ? '您的回憶影片已經準備好了'
                      : '已分析您的照片，正準備生成影片'}
                  </p>
                </div>

                {/* Preview - Video or Image with Carousel */}
                <div className="relative">
                  <div className="aspect-video bg-black rounded-lg overflow-hidden relative">
                    {isVideo ? (
                      <video
                        key={currentVideoUrl} // Force re-render on URL change
                        ref={videoRef}
                        src={currentVideoUrl}
                        controls
                        autoPlay
                        loop
                        preload="auto"
                        className="w-full h-full object-contain"
                      >
                        您的瀏覽器不支援影片播放
                      </video>
                    ) : (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={result.url}
                          alt="生成的影片預覽"
                          className="w-full h-full object-contain"
                        />
                        {isImage && (
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                            <p className="text-white text-sm text-center">
                              預覽圖片 - 完整影片生成需要 Veo API 存取權限
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Carousel navigation */}
                  {hasMultipleVideos && isVideo && (
                    <>
                      <button
                        onClick={goToPreviousVideo}
                        className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                        aria-label="上一個影片"
                      >
                        <ChevronLeft className="w-6 h-6" />
                      </button>
                      <button
                        onClick={goToNextVideo}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                        aria-label="下一個影片"
                      >
                        <ChevronRight className="w-6 h-6" />
                      </button>
                      {/* Video counter */}
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/50 text-white text-sm">
                        {currentVideoIndex + 1} / {totalVideos}
                      </div>
                    </>
                  )}
                </div>

                {/* Video thumbnails for multiple videos */}
                {hasMultipleVideos && isVideo && (
                  <div className="flex gap-2 overflow-x-auto py-2">
                    {result.urls.map((url, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentVideoIndex(index)}
                        className={`flex-shrink-0 w-20 h-12 rounded-md overflow-hidden border-2 transition-colors ${
                          index === currentVideoIndex
                            ? 'border-primary'
                            : 'border-transparent hover:border-primary/50'
                        }`}
                      >
                        <div className="w-full h-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
                          影片 {index + 1}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* AI Analysis (from Gemini fallback) */}
                {result.analysis && (
                  <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                    <h3 className="font-medium flex items-center gap-2">
                      <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      AI 動畫建議
                    </h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {result.analysis}
                    </p>
                  </div>
                )}

                {/* Expiration alert */}
                {isVideo && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <Clock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-600 dark:text-amber-400">影片連結 24 小時後失效</p>
                      <p className="text-xs text-muted-foreground mt-0.5">請盡快下載保存，過期後需重新生成</p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button asChild className="flex-1">
                    <a
                      href={currentVideoUrl || result.url}
                      download={isVideo ? `glimmer-memory-video-${currentVideoIndex + 1}.mp4` : 'glimmer-preview.jpg'}
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      {isVideo ? (hasMultipleVideos ? `下載影片 ${currentVideoIndex + 1}` : '下載生成影片') : '下載預覽圖'}
                    </a>
                  </Button>
                  <Button variant="outline" asChild className="flex-1">
                    <Link href="/create">製作另一支影片</Link>
                  </Button>
                </div>

                {/* Share buttons */}
                {isVideo && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Share2 className="w-4 h-4" />
                      <span>分享影片</span>
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00B900] hover:bg-[#00A000] text-white text-sm font-medium transition-colors"
                      >
                        <LineIcon className="w-5 h-5" />
                        LINE
                      </a>
                      <a
                        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1877F2] hover:bg-[#166FE5] text-white text-sm font-medium transition-colors"
                      >
                        <FacebookIcon className="w-5 h-5" />
                        Facebook
                      </a>
                    </div>
                  </div>
                )}

                {/* Gallery link */}
                {isVideo && (
                  <div className="text-center">
                    <Link href="/gallery" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      <FolderOpen className="w-4 h-4" />
                      前往影片庫查看所有影片
                    </Link>
                  </div>
                )}

                {isImage && (
                  <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                    <p className="text-sm text-center">
                      <strong>提示：</strong>您的 Google API 金鑰目前僅支援 Gemini。
                      如需完整影片生成功能，請啟用 Veo API 存取權限或使用 Vertex AI。
                    </p>
                  </div>
                )}
              </div>
            ) : (
              // Processing state
              <GenerationProgress
                jobId={id}
                onComplete={handleComplete}
                onError={handleError}
              />
            )}
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; 2026 拾光 Glimmer. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

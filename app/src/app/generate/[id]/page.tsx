'use client';

export const runtime = 'edge';

import { useState, useEffect, useRef, use } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { GenerationProgress } from '@/components/GenerationProgress';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
  const [videoPoster, setVideoPoster] = useState<string | null>(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleComplete = (url: string, urls: string[], analysis?: string) => {
    setResult({ url, urls, analysis });
  };

  const handleError = (err: string) => {
    setError(err);
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

  // Extract first frame from video for poster
  useEffect(() => {
    if (!isVideo || !currentVideoUrl) return;

    setVideoPoster(null); // Reset poster when video changes

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.src = currentVideoUrl;
    video.muted = true;

    video.onloadeddata = () => {
      video.currentTime = 0.1; // Seek to first frame
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        setVideoPoster(canvas.toDataURL('image/jpeg'));
      }
    };

    video.onerror = () => {
      console.log('Could not extract video frame for poster');
    };

    return () => {
      video.src = '';
    };
  }, [isVideo, currentVideoUrl]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/assets/glimmer-logo.jpeg"
              alt="Glimmer"
              width={150}
              height={80}
              className="h-20 w-auto"
            />
          </Link>
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
                  <Link href="/">返回首頁重試</Link>
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
                        className="w-full h-full object-contain"
                        poster={videoPoster || undefined}
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
                    <Link href="/">製作另一支影片</Link>
                  </Button>
                </div>

                {isImage && (
                  <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                    <p className="text-sm text-center">
                      <strong>提示：</strong>您的 Google API 金鑰目前僅支援 Gemini。
                      如需完整影片生成功能，請啟用 Veo API 存取權限或使用 Vertex AI。
                    </p>
                  </div>
                )}

                {isVideo && (
                  <p className="text-xs text-muted-foreground text-center">
                    影片連結將在 24 小時後失效，請盡快下載保存
                  </p>
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

'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Play, Download, Calendar, Film, ArrowLeft } from 'lucide-react';

interface GalleryJob {
  id: string;
  name: string;
  occasion: string;
  videoUrl: string;
  videoUrls?: string[];
  createdAt: string;
  settings?: {
    model: string;
    aspectRatio: string;
    videoLength: number;
    resolution: string;
  };
}

const occasionLabels: Record<string, string> = {
  memorial: '追思紀念',
  birthday: '生日慶祝',
  wedding: '婚禮紀念',
  other: '其他',
};

export default function GalleryPage() {
  const [jobs, setJobs] = useState<GalleryJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<GalleryJob | null>(null);

  useEffect(() => {
    async function loadGallery() {
      try {
        const res = await fetch('/api/gallery');
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || '載入失敗');
        }

        setJobs(data.jobs || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : '載入失敗');
      } finally {
        setLoading(false);
      }
    }

    loadGallery();
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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
          <Button variant="outline" asChild>
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回首頁
            </Link>
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-3xl font-bold mb-4">影片庫</h1>
            <p className="text-muted-foreground">
              瀏覽您過去生成的所有影片
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : error ? (
            <Card className="max-w-md mx-auto">
              <CardContent className="p-8 text-center">
                <p className="text-destructive mb-4">{error}</p>
                <Button onClick={() => window.location.reload()}>重試</Button>
              </CardContent>
            </Card>
          ) : jobs.length === 0 ? (
            <Card className="max-w-md mx-auto">
              <CardContent className="p-8 text-center">
                <Film className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">還沒有影片</h2>
                <p className="text-muted-foreground mb-6">
                  生成您的第一支回憶影片吧！
                </p>
                <Button asChild>
                  <Link href="/">開始製作</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {jobs.map((job) => (
                <Card
                  key={job.id}
                  className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => setSelectedJob(job)}
                >
                  <div className="aspect-video bg-black relative group">
                    <video
                      src={job.videoUrl}
                      className="w-full h-full object-contain"
                      muted
                      playsInline
                      onMouseEnter={(e) => e.currentTarget.play()}
                      onMouseLeave={(e) => {
                        e.currentTarget.pause();
                        e.currentTarget.currentTime = 0;
                      }}
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Play className="w-12 h-12 text-white" />
                    </div>
                    {job.videoUrls && job.videoUrls.length > 1 && (
                      <div className="absolute top-2 right-2 px-2 py-1 rounded bg-black/50 text-white text-xs">
                        {job.videoUrls.length} 支影片
                      </div>
                    )}
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-semibold truncate">{job.name}</h3>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Film className="w-3 h-3" />
                        {occasionLabels[job.occasion] || job.occasion}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(job.createdAt).split(' ')[0]}
                      </span>
                    </div>
                    {job.settings && (
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                          {job.settings.resolution}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                          {job.settings.aspectRatio}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                          {job.settings.videoLength}s
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Video modal */}
      {selectedJob && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedJob(null)}
        >
          <div
            className="bg-background rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-lg">{selectedJob.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {occasionLabels[selectedJob.occasion]} · {formatDate(selectedJob.createdAt)}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setSelectedJob(null)}>
                ✕
              </Button>
            </div>
            <div className="aspect-video bg-black">
              <video
                src={selectedJob.videoUrl}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
            {selectedJob.videoUrls && selectedJob.videoUrls.length > 1 && (
              <div className="p-4 border-t border-border">
                <p className="text-sm text-muted-foreground mb-2">
                  所有影片 ({selectedJob.videoUrls.length})
                </p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {selectedJob.videoUrls.map((url, index) => (
                    <a
                      key={index}
                      href={url}
                      download={`${selectedJob.name}-${index + 1}.mp4`}
                      className="flex-shrink-0 px-3 py-2 rounded bg-muted hover:bg-muted/80 text-sm flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      影片 {index + 1}
                    </a>
                  ))}
                </div>
              </div>
            )}
            <div className="p-4 border-t border-border flex gap-3">
              <Button asChild className="flex-1">
                <a href={selectedJob.videoUrl} download={`${selectedJob.name}.mp4`}>
                  <Download className="w-4 h-4 mr-2" />
                  下載影片
                </a>
              </Button>
              <Button variant="outline" asChild className="flex-1">
                <Link href={`/generate/${selectedJob.id}`}>
                  查看詳情
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-border py-8 mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; 2026 拾光 Glimmer. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

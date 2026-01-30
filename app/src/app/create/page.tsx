'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhotoUploader } from '@/components/PhotoUploader';
import { FrameUploader } from '@/components/FrameUploader';
import { SettingsSidebar } from '@/components/SettingsSidebar';
import type { OccasionType, GenerationSettings } from '@/types';
import { defaultSettings } from '@/types';

const occasions: { value: OccasionType; label: string; description: string }[] = [
  { value: 'memorial', label: '追思紀念', description: '告別式、追悼會' },
  { value: 'birthday', label: '壽宴慶生', description: '大壽、生日派對' },
  { value: 'wedding', label: '婚禮紀念', description: '婚禮、週年紀念' },
  { value: 'pet', label: '寵物紀念', description: '毛孩回憶、寵物紀念' },
  { value: 'other', label: '其他場合', description: '畢業、退休等' },
];

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [occasion, setOccasion] = useState<OccasionType>('memorial');
  const [photos, setPhotos] = useState<File[]>([]);
  const [firstFrame, setFirstFrame] = useState<File | null>(null);
  const [lastFrame, setLastFrame] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<GenerationSettings>(defaultSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isFrameMode = settings.taskType === 'first-last-frame';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('請輸入主角姓名');
      return;
    }
    if (isFrameMode) {
      if (!firstFrame) {
        setError('請上傳首幀圖片');
        return;
      }
    } else {
      if (photos.length < 1) {
        setError('請至少上傳 1 張照片');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('occasion', occasion);
      formData.append('settings', JSON.stringify(settings));

      if (isFrameMode) {
        // First frame is photo_0, last frame (optional) is photo_1
        formData.append('photo_0', firstFrame!);
        if (lastFrame) {
          formData.append('photo_1', lastFrame);
        }
      } else {
        photos.forEach((photo, i) => {
          formData.append(`photo_${i}`, photo);
        });
      }

      const res = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '發生錯誤');
      }

      router.push(`/generate/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤，請稍後再試');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border sticky top-0 bg-background z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            <nav className="hidden sm:flex items-center gap-6 text-sm">
              <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">首頁</Link>
              <Link href="/gallery" className="text-muted-foreground hover:text-foreground transition-colors">影片庫</Link>
            </nav>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="hidden lg:flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              設定
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          {/* Hero */}
          <section className="container mx-auto px-4 py-8 md:py-12">
            <div className="max-w-3xl mx-auto text-center space-y-4">
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
                讓珍貴回憶
                <span className="text-primary">活過來</span>
              </h1>
              <p className="text-lg text-muted-foreground">
                AI 驅動的回憶影片服務，將老照片轉化為動人的影片
              </p>
            </div>
          </section>

          {/* Current Settings Badge */}
          <section className="container mx-auto px-4 pb-4">
            <div className="max-w-2xl mx-auto">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-primary/10 text-primary">
                  {settings.model === 'byteplus' ? 'BytePlus Seedance' : settings.model === 'veo-3.1' ? 'Veo 3.1' : settings.model === 'veo-3.1-fast' ? 'Veo 3.1 Fast' : 'Kling AI'}
                </span>
                {settings.taskType === 'first-last-frame' && (
                  <span className="px-2 py-1 rounded-full bg-primary/10 text-primary">
                    首末幀
                  </span>
                )}
                {settings.cameraFixed && (
                  <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground">
                    固定鏡頭
                  </span>
                )}
                <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground">
                  {settings.aspectRatio}
                </span>
                <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground">
                  {settings.videoLength}秒
                </span>
                <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground">
                  {settings.resolution}
                </span>
                {settings.numResults > 1 && (
                  <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground">
                    {settings.numResults} 個結果
                  </span>
                )}
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="px-2 py-1 rounded-full bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  調整設定 →
                </button>
              </div>
            </div>
          </section>

          {/* Main Form */}
          <section className="container mx-auto px-4 pb-20">
            <Card className="max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle>建立回憶影片</CardTitle>
                <CardDescription>
                  上傳照片，我們的 AI 將為您製作一支感動人心的影片
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Name */}
                  <div className="space-y-2">
                    <Label htmlFor="name">{occasion === 'pet' ? '寵物名字' : '主角姓名'}</Label>
                    <Input
                      id="name"
                      placeholder={occasion === 'pet' ? '例如：Lucky、小花' : '例如：王小明'}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>

                  {/* Occasion */}
                  <div className="space-y-2">
                    <Label>場合類型</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {occasions.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setOccasion(item.value)}
                          className={`
                            p-3 rounded-lg border text-left transition-all
                            ${occasion === item.value
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50'
                            }
                          `}
                        >
                          <div className="font-medium">{item.label}</div>
                          <div className="text-sm text-muted-foreground">{item.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Prompt (if set) */}
                  {settings.prompt && (
                    <div className="p-3 rounded-lg bg-muted/50 text-sm">
                      <span className="font-medium">提示詞：</span> {settings.prompt}
                    </div>
                  )}

                  {/* Photo Upload */}
                  <div className="space-y-2">
                    <Label>{isFrameMode ? '上傳首末幀圖片' : '上傳照片'}</Label>
                    {isFrameMode ? (
                      <FrameUploader
                        firstFrame={firstFrame}
                        lastFrame={lastFrame}
                        onFirstFrameChange={setFirstFrame}
                        onLastFrameChange={setLastFrame}
                      />
                    ) : (
                      <PhotoUploader
                        photos={photos}
                        onPhotosChange={setPhotos}
                        maxPhotos={10}
                      />
                    )}
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                      {error}
                    </div>
                  )}

                  {/* Submit */}
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={isSubmitting || (isFrameMode ? !firstFrame : photos.length < 1)}
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        處理中...
                      </>
                    ) : (
                      '開始製作影片'
                    )}
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    點擊「開始製作」即表示您同意我們的服務條款和隱私政策
                  </p>
                </form>
              </CardContent>
            </Card>
          </section>

          {/* Footer */}
          <footer className="border-t border-border py-8 mt-auto">
            <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
              <p>&copy; 2026 拾光 Glimmer. All rights reserved.</p>
            </div>
          </footer>
        </main>

        {/* Settings Sidebar */}
        <SettingsSidebar
          settings={settings}
          onSettingsChange={setSettings}
          isOpen={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
      </div>
    </div>
  );
}

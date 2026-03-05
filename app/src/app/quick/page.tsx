'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhotoUploader } from '@/components/PhotoUploader';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useTranslation } from '@/lib/i18n';
import {
  QUICK_TEMPLATES,
  getTemplatesByOccasion,
  type QuickTemplate,
} from '@/lib/templates';
import type { OccasionType, CreditBalance } from '@/types';
import { Sparkles, Loader2, Check, ArrowLeft } from 'lucide-react';

const OCCASIONS: { value: OccasionType; label: string; labelEn: string }[] = [
  { value: 'memorial', label: '追思', labelEn: 'Memorial' },
  { value: 'birthday', label: '生日', labelEn: 'Birthday' },
  { value: 'wedding', label: '婚禮', labelEn: 'Wedding' },
  { value: 'pet', label: '寵物', labelEn: 'Pet' },
  { value: 'other', label: '其他', labelEn: 'Other' },
];

export default function QuickPage() {
  return (
    <Suspense>
      <QuickPageInner />
    </Suspense>
  );
}

function QuickPageInner() {
  const router = useRouter();
  const t = useTranslation();

  // Form state
  const [email, setEmail] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('glimmer_email') || '';
    return '';
  });
  const [photos, setPhotos] = useState<File[]>([]);
  const [occasion, setOccasion] = useState<OccasionType>('memorial');
  const [selectedTemplate, setSelectedTemplate] = useState<QuickTemplate | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [message, setMessage] = useState('');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [creditLoading, setCreditLoading] = useState(false);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const availableTemplates = getTemplatesByOccasion(occasion);

  // Auto-select first template when occasion changes
  useEffect(() => {
    const templates = getTemplatesByOccasion(occasion);
    setSelectedTemplate(templates[0] || null);
  }, [occasion]);

  // Check credits when email changes
  useEffect(() => {
    if (!email || !isValidEmail) {
      setCreditBalance(null);
      return;
    }
    const timer = setTimeout(async () => {
      setCreditLoading(true);
      try {
        const res = await fetch(`/api/credits?email=${encodeURIComponent(email)}`);
        if (res.ok) {
          setCreditBalance(await res.json());
        }
      } catch { /* ignore */ } finally {
        setCreditLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [email, isValidEmail]);

  // Persist email
  useEffect(() => {
    if (email && isValidEmail) {
      localStorage.setItem('glimmer_email', email);
    }
  }, [email, isValidEmail]);

  // Calculate required credits (N photos = N-1 segments)
  const requiredCredits = photos.length > 1 ? photos.length - 1 : 1;
  const hasEnoughCredits = creditBalance && creditBalance.remaining >= requiredCredits;

  const canSubmit =
    photos.length >= 2 &&
    selectedTemplate &&
    name.trim() &&
    isValidEmail &&
    hasEnoughCredits &&
    !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit || !selectedTemplate) return;

    setIsSubmitting(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('email', email);
      formData.append('templateId', selectedTemplate.id);
      formData.append('name', name.trim());
      formData.append('date', date.trim());
      formData.append('message', message.trim());
      formData.append('occasion', occasion);
      photos.forEach((photo) => formData.append('photos', photo));

      const res = await fetch('/api/quick-generate', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'EMAIL_NOT_VERIFIED') {
          try {
            const verifyRes = await fetch('/api/verify/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email }),
            });
            const verifyData = await verifyRes.json();
            if (verifyData.data?.alreadyVerified) {
              setCreditBalance(prev => prev ? { ...prev, verified: true } : null);
              setError('Email 已驗證，請再次點擊生成');
            } else {
              setVerificationSent(true);
              setError('已發送驗證信至 ' + email + '，請查收信箱並點擊驗證連結後再試');
            }
          } catch {
            setError('發送驗證信失敗，請稍後再試');
          }
          setIsSubmitting(false);
          return;
        }
        throw new Error(data.error || '生成失敗');
      }

      // Redirect to batch progress page (reuse existing page to save bundle size)
      router.push(`/batch/${data.batchId}?quick=${data.quickId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤');
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 flex h-14 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">返回</span>
            </Link>
            <Logo compact />
          </div>
          <LanguageToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center justify-center gap-2">
            <Sparkles className="w-7 h-7 text-primary" />
            快速生成
          </h1>
          <p className="text-muted-foreground">
            上傳照片，選擇模板，一鍵生成完整影片
          </p>
        </div>

        <div className="space-y-6">
          {/* Step 1: Photos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">1. 上傳照片</CardTitle>
              <CardDescription>上傳 2 張以上照片，系統將自動生成過場動畫</CardDescription>
            </CardHeader>
            <CardContent>
              <PhotoUploader
                photos={photos}
                onPhotosChange={setPhotos}
                maxPhotos={20}
              />
              {photos.length >= 2 && (
                <p className="text-sm text-muted-foreground mt-2">
                  將生成 {photos.length - 1} 段影片（需 {photos.length - 1} 點數）
                </p>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Template */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2. 選擇模板</CardTitle>
              <CardDescription>模板包含配樂、標題樣式、轉場效果</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Occasion Tabs */}
              <div className="flex flex-wrap gap-2">
                {OCCASIONS.map((occ) => (
                  <button
                    key={occ.value}
                    onClick={() => setOccasion(occ.value)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                      occasion === occ.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    {occ.label}
                  </button>
                ))}
              </div>

              {/* Template Cards */}
              <div className="grid gap-3">
                {availableTemplates.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => setSelectedTemplate(tmpl)}
                    className={`p-4 rounded-lg border text-left transition-all ${
                      selectedTemplate?.id === tmpl.id
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-12 h-12 rounded-lg flex-shrink-0"
                        style={{ backgroundColor: tmpl.previewColor }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{tmpl.name}</span>
                          {selectedTemplate?.id === tmpl.id && (
                            <Check className="w-4 h-4 text-primary" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{tmpl.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Step 3: Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">3. 填寫資訊</CardTitle>
              <CardDescription>這些資訊會顯示在影片的標題卡上</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">名稱 *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={occasion === 'pet' ? '寵物名字' : '姓名'}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="date">日期（選填）</Label>
                <Input
                  id="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  placeholder="例：1950-2024 或 2024/03/15"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="message">留言（選填）</Label>
                <Input
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="想說的話..."
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Step 4: Email & Submit */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">4. 確認生成</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="email">電子郵件 *</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="mt-1"
                />
                {creditBalance && (
                  <p className="text-sm mt-1 text-muted-foreground">
                    剩餘點數：{creditBalance.remaining}
                    {!hasEnoughCredits && photos.length >= 2 && (
                      <span className="text-destructive ml-2">
                        （需要 {requiredCredits} 點數）
                      </span>
                    )}
                  </p>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  {error}
                </div>
              )}

              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full"
                size="lg"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    開始生成
                  </>
                )}
              </Button>

              {photos.length < 2 && (
                <p className="text-sm text-center text-muted-foreground">
                  請上傳至少 2 張照片
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

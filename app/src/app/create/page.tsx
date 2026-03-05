'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhotoUploader } from '@/components/PhotoUploader';
import { FrameUploader } from '@/components/FrameUploader';
import { SettingsSidebar } from '@/components/SettingsSidebar';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useTranslation, type TranslationKey } from '@/lib/i18n';
import { useAccess } from '@/hooks/useAccess';
import type { OccasionType, GenerationSettings, CreditBalance, Project } from '@/types';
import { defaultSettings } from '@/types';
import { FolderOpen, ChevronDown, Layers } from 'lucide-react';
import { trackGenerationStart, trackPurchaseStart } from '@/lib/analytics';

const occasionKeys: { value: OccasionType; labelKey: TranslationKey; descKey: TranslationKey }[] = [
  { value: 'memorial', labelKey: 'occasion.memorial', descKey: 'occasion.memorialDesc' },
  { value: 'birthday', labelKey: 'occasion.birthday', descKey: 'occasion.birthdayDesc' },
  { value: 'wedding', labelKey: 'occasion.wedding', descKey: 'occasion.weddingDesc' },
  { value: 'pet', labelKey: 'occasion.pet', descKey: 'occasion.petDesc' },
  { value: 'other', labelKey: 'occasion.other', descKey: 'occasion.otherDesc' },
];

export default function CreatePage() {
  return (
    <Suspense>
      <CreatePageInner />
    </Suspense>
  );
}

function CreatePageInner() {
  const router = useRouter();
  const t = useTranslation();
  const { hasPaidAccess } = useAccess();
  const [email, setEmail] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('glimmer_email') || '';
    return '';
  });
  const [name, setName] = useState('');
  const [occasion, setOccasion] = useState<OccasionType>('memorial');
  const [photos, setPhotos] = useState<File[]>([]);
  const [firstFrame, setFirstFrame] = useState<File | null>(null);
  const [lastFrame, setLastFrame] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<GenerationSettings>(defaultSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [creditLoading, setCreditLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  const isFrameMode = settings.taskType === 'first-last-frame';
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // Batch mode requires at least 2 photos and not in frame mode
  const canEnableBatch = !isFrameMode && photos.length >= 2;
  const batchSegments = batchMode && canEnableBatch ? photos.length - 1 : 0;

  // Check credits when email changes (debounced)
  useEffect(() => {
    if (!email || !isValidEmail) {
      setCreditBalance(null);
      setVerificationSent(false);
      return;
    }
    setVerificationSent(false);
    const timer = setTimeout(async () => {
      setCreditLoading(true);
      try {
        const res = await fetch(`/api/credits?email=${encodeURIComponent(email)}`);
        if (res.ok) {
          const data = await res.json();
          setCreditBalance(data);
        }
      } catch { /* ignore */ } finally {
        setCreditLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  // Persist email to localStorage
  useEffect(() => {
    if (email && isValidEmail) {
      localStorage.setItem('glimmer_email', email);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  // Scroll to error when it appears
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error]);

  // Load projects list
  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch('/api/projects');
        if (res.ok) {
          const data = await res.json();
          setProjects(data.projects || []);
        }
      } catch { /* ignore */ }
    }
    loadProjects();
  }, []);

  // Handle projectId from URL and verification callback
  useEffect(() => {
    const projectId = searchParams.get('projectId');
    if (projectId) {
      setSelectedProjectId(projectId);
    }

    const verified = searchParams.get('verified');
    const verifyError = searchParams.get('verify_error');
    if (verified === '1') {
      // Refresh credit balance to pick up verified status
      setCreditBalance(prev => prev ? { ...prev, verified: true } : null);
      // Clean URL but keep projectId
      const newUrl = projectId ? `/create?projectId=${projectId}` : '/create';
      router.replace(newUrl, { scroll: false });
    } else if (verifyError) {
      const messages: Record<string, string> = {
        expired: '驗證連結已過期，請重新發送',
        invalid: '驗證連結無效',
        error: '驗證過程發生錯誤，請稍後再試',
      };
      setError(messages[verifyError] || '驗證失敗');
      router.replace('/create', { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !isValidEmail) {
      setError('請輸入有效的 Email 地址');
      return;
    }
    if (!name.trim()) {
      setError('請輸入主角姓名');
      return;
    }
    // Check credits - batch mode needs N-1 credits
    const creditsNeeded = batchMode && canEnableBatch ? batchSegments : 1;
    if (creditBalance && creditBalance.remaining < creditsNeeded) {
      setError(batchMode
        ? `點數不足，批次生成需要 ${creditsNeeded} 點，您目前有 ${creditBalance.remaining} 點`
        : '點數不足，請先購買點數'
      );
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
      formData.append('email', email);
      formData.append('name', name);
      formData.append('occasion', occasion);
      formData.append('settings', JSON.stringify(settings));
      if (selectedProjectId) {
        formData.append('projectId', selectedProjectId);
      }

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

      // Use batch endpoint if batch mode is enabled
      const endpoint = batchMode && canEnableBatch ? '/api/generate-batch' : '/api/generate';
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'EMAIL_NOT_VERIFIED') {
          setCreditBalance(prev => prev ? { ...prev, verified: false } : null);
          setIsSubmitting(false);
          return;
        }
        if (res.status === 402) {
          setCreditBalance(prev => prev ? { ...prev, remaining: 0 } : null);
        }
        throw new Error(data.error || '發生錯誤');
      }

      // Track generation start
      trackGenerationStart(occasion, settings.model);
      // Store for completion tracking
      localStorage.setItem('glimmer_last_generation', JSON.stringify({ occasion, model: settings.model }));

      // Redirect to batch page or generate page
      if (batchMode && data.batchId) {
        router.push(`/batch/${data.batchId}`);
      } else {
        router.push(`/generate/${data.id}`);
      }
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
          <div className="flex items-center gap-2 sm:gap-4">
            <nav className="flex items-center gap-3 sm:gap-6 text-sm">
              <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">{t('nav.home')}</Link>
              <Link href="/gallery" className="text-muted-foreground hover:text-foreground transition-colors">{t('nav.gallery')}</Link>
            </nav>
            <LanguageToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="hidden sm:inline">{t('create.settings')}</span>
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
                {t('hero.title1')}
                <span className="text-primary">{t('hero.title2')}</span>
              </h1>
              <p className="text-lg text-muted-foreground">
                {t('create.subtitle')}
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
                  {t('create.adjustSettings')} →
                </button>
              </div>
            </div>
          </section>

          {/* Main Form */}
          <section className="container mx-auto px-4 pb-20">
            <Card className="max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle>{t('create.title')}</CardTitle>
                <CardDescription>
                  {t('create.subtitle')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Email */}
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('create.email')}</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                    {/* Credit balance display */}
                    {email && isValidEmail && (
                      <div className="p-3 rounded-lg border border-border bg-card text-sm">
                        {creditLoading ? (
                          <p className="text-muted-foreground">{t('credits.checking')}</p>
                        ) : creditBalance ? (
                          creditBalance.remaining > 0 ? (
                            creditBalance.isAdmin ? (
                              // Admin user
                              <p className="text-purple-600 dark:text-purple-400 font-medium">
                                👑 {t('credits.admin')}
                              </p>
                            ) : !creditBalance.verified ? (
                              // Email not verified
                              <div className="space-y-2">
                                <p className="text-amber-600 dark:text-amber-400 font-medium">
                                  請先驗證 Email 以開始使用
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  驗證後可獲得 {creditBalance.freeTotal} 次免費生成額度
                                </p>
                                {verificationSent ? (
                                  <p className="text-xs text-green-600 dark:text-green-400">
                                    驗證信已發送，請查收信箱
                                  </p>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={sendingVerification}
                                    className="text-xs text-primary hover:underline disabled:opacity-50"
                                    onClick={async () => {
                                      setSendingVerification(true);
                                      try {
                                        const res = await fetch('/api/verify/send', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ email }),
                                        });
                                        const data = await res.json();
                                        if (data.data?.alreadyVerified) {
                                          setCreditBalance(prev => prev ? { ...prev, verified: true } : null);
                                        } else {
                                          setVerificationSent(true);
                                        }
                                      } catch {
                                        setError('發送驗證信失敗，請稍後再試');
                                      } finally {
                                        setSendingVerification(false);
                                      }
                                    }}
                                  >
                                    {sendingVerification ? '發送中...' : '發送驗證信'}
                                  </button>
                                )}
                              </div>
                            ) : (
                              // Show remaining generations
                              <div className="space-y-1">
                                <p className="text-green-600 dark:text-green-400 font-medium">
                                  {t('credits.remaining', { count: creditBalance.remaining })}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {creditBalance.freeTotal - creditBalance.freeUsed > 0
                                    ? t('credits.free', { count: creditBalance.freeTotal - creditBalance.freeUsed })
                                    : ''}
                                  {creditBalance.freeTotal - creditBalance.freeUsed > 0 && creditBalance.paidTotal - creditBalance.paidUsed > 0 ? ' + ' : ''}
                                  {creditBalance.paidTotal - creditBalance.paidUsed > 0
                                    ? t('credits.paid', { count: creditBalance.paidTotal - creditBalance.paidUsed })
                                    : ''}
                                </p>
                              </div>
                            )
                          ) : (
                            <div className="space-y-3">
                              <p className="text-amber-600 dark:text-amber-400 font-medium">
                                {t('credits.exhausted')}
                              </p>
                              <div className="flex gap-2 flex-wrap">
                                <PurchaseButton email={email} packId="pack20" label="20 次 NT$299" />
                                <PurchaseButton email={email} packId="pack50" label="50 次 NT$599" />
                              </div>
                            </div>
                          )
                        ) : (
                          <p className="text-muted-foreground">{t('credits.enterEmail')}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Name */}
                  <div className="space-y-2">
                    <Label htmlFor="name">{occasion === 'pet' ? t('create.petName') : t('create.name')}</Label>
                    <Input
                      id="name"
                      placeholder={occasion === 'pet' ? t('create.petNamePlaceholder') : t('create.namePlaceholder')}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>

                  {/* Occasion */}
                  <div className="space-y-2">
                    <Label>{t('create.occasionType')}</Label>
                    <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t('create.occasionType')}>
                      {occasionKeys.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          role="radio"
                          aria-checked={occasion === item.value}
                          onClick={() => setOccasion(item.value)}
                          className={`
                            p-3 rounded-lg border text-left transition-all
                            ${occasion === item.value
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50'
                            }
                          `}
                        >
                          <div className="font-medium">{t(item.labelKey)}</div>
                          <div className="text-sm text-muted-foreground">{t(item.descKey)}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Project selector */}
                  {/* Add to Project - only for paid users */}
                  {hasPaidAccess && (
                    <div className="space-y-2">
                      <Label>{t('create.addToProject')}</Label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
                          className="w-full flex items-center justify-between px-4 py-2 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors text-left"
                        >
                          <span className="flex items-center gap-2">
                            <FolderOpen className="w-4 h-4 text-muted-foreground" />
                            {selectedProjectId
                              ? projects.find(p => p.id === selectedProjectId)?.name || t('create.noProject')
                              : t('create.noProject')}
                          </span>
                          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${projectDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {projectDropdownOpen && (
                          <div className="absolute z-10 mt-1 w-full bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProjectId(null);
                                setProjectDropdownOpen(false);
                              }}
                              className="w-full px-4 py-2 text-left hover:bg-muted/50 transition-colors text-sm"
                            >
                              {t('create.noProject')}
                            </button>
                            {projects.map(project => (
                              <button
                                key={project.id}
                                type="button"
                                onClick={() => {
                                  setSelectedProjectId(project.id);
                                  setProjectDropdownOpen(false);
                                }}
                                className={`w-full px-4 py-2 text-left hover:bg-muted/50 transition-colors text-sm ${
                                  selectedProjectId === project.id ? 'bg-primary/10 text-primary' : ''
                                }`}
                              >
                                {project.name}
                                <span className="text-xs text-muted-foreground ml-2">
                                  ({project.jobIds.length} videos)
                                </span>
                              </button>
                            ))}
                            {projects.length === 0 && (
                              <div className="px-4 py-2 text-sm text-muted-foreground">
                                {t('create.noProjects')} —{' '}
                                <Link href="/projects" className="text-primary hover:underline">
                                  {t('create.createProject')}
                                </Link>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Prompt (if set) */}
                  {settings.prompt && (
                    <div className="p-3 rounded-lg bg-muted/50 text-sm">
                      <span className="font-medium">提示詞：</span> {settings.prompt}
                    </div>
                  )}

                  {/* Photo Upload */}
                  <div className="space-y-2">
                    <Label>{isFrameMode ? t('create.uploadFrames') : t('create.uploadPhotos')}</Label>
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

                  {/* Batch Mode Toggle - shows when 2+ photos uploaded */}
                  {canEnableBatch && (
                    <div className="p-4 rounded-lg border border-border bg-card space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Layers className="w-5 h-5 text-primary" />
                          <div>
                            <p className="font-medium">批次生成模式</p>
                            <p className="text-sm text-muted-foreground">
                              將 {photos.length} 張照片連接成 {photos.length - 1} 段影片
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={batchMode}
                          onClick={() => setBatchMode(!batchMode)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            batchMode ? 'bg-primary' : 'bg-muted'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              batchMode ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                      {batchMode && (
                        <div className="text-sm space-y-2 pt-2 border-t border-border">
                          <p className="text-muted-foreground">
                            每對相鄰照片會生成一段過渡影片：
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {photos.slice(0, -1).map((_, i) => (
                              <span key={i} className="px-2 py-1 rounded bg-primary/10 text-primary text-xs">
                                照片 {i + 1} → {i + 2}
                              </span>
                            ))}
                          </div>
                          <p className="text-amber-600 dark:text-amber-400 font-medium">
                            將使用 {batchSegments} 點數
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error */}
                  {error && (
                    <div ref={errorRef} className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm" role="alert">
                      {error}
                    </div>
                  )}

                  {/* Submit or Verify CTA */}
                  {creditBalance && !creditBalance.verified && !creditBalance.isAdmin ? (
                    <div className="space-y-3">
                      <Button
                        type="button"
                        size="lg"
                        className="w-full"
                        disabled={sendingVerification || verificationSent}
                        onClick={async () => {
                          setSendingVerification(true);
                          setError('');
                          try {
                            const res = await fetch('/api/verify/send', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ email }),
                            });
                            const data = await res.json();
                            if (data.data?.alreadyVerified) {
                              setCreditBalance(prev => prev ? { ...prev, verified: true } : null);
                            } else if (res.ok) {
                              setVerificationSent(true);
                            } else {
                              setError(data.error || '發送驗證信失敗');
                            }
                          } catch {
                            setError('發送驗證信失敗，請稍後再試');
                          } finally {
                            setSendingVerification(false);
                          }
                        }}
                      >
                        {sendingVerification ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            發送中...
                          </>
                        ) : verificationSent ? (
                          '驗證信已發送，請查收信箱'
                        ) : (
                          '驗證 Email 以解鎖免費額度'
                        )}
                      </Button>
                      {verificationSent && (
                        <p className="text-xs text-muted-foreground text-center">
                          已發送至 {email}，點擊信中連結後回到此頁即可開始生成
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                      <Button
                        type="submit"
                        size="lg"
                        className="w-full"
                        disabled={
                          isSubmitting ||
                          !isValidEmail ||
                          (creditBalance?.remaining ?? 1) < (batchMode && canEnableBatch ? batchSegments : 1) ||
                          (isFrameMode ? !firstFrame : photos.length < 1)
                        }
                      >
                        {isSubmitting ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            {t('create.processing')}
                          </>
                        ) : (
                          t('create.submit')
                        )}
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        {t('create.terms')}
                      </p>
                    </>
                  )}
                </form>
              </CardContent>
            </Card>
          </section>

          {/* Footer */}
          <footer className="border-t border-border py-8 mt-auto">
            <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
              <p>{t('footer.copyright')}</p>
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

function PurchaseButton({ email, packId, label }: { email: string; packId: string; label: string }) {
  const [loading, setLoading] = useState(false);

  const handlePurchase = async () => {
    setLoading(true);
    // Track purchase start
    const packAmount = packId === 'pack20' ? 299 : packId === 'pack50' ? 599 : 0;
    trackPurchaseStart(packId, packAmount);

    try {
      localStorage.setItem('glimmer_email', email);
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, packId }),
      });
      const data = await res.json();
      // Store purchase info for completion tracking
      if (data.orderId) {
        localStorage.setItem('glimmer_pending_purchase', JSON.stringify({ packId, amount: packAmount, orderId: data.orderId }));
      }

      if (data.paymentUrl && data.formData) {
        // ECPay requires form POST to payment URL
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = data.paymentUrl;
        form.style.display = 'none';

        for (const [key, value] of Object.entries(data.formData)) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = String(value);
          form.appendChild(input);
        }

        document.body.appendChild(form);
        form.submit();
      } else if (data.error) {
        alert(data.error);
        setLoading(false);
      }
    } catch {
      alert('付款系統發生錯誤，請稍後再試');
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handlePurchase}
      disabled={loading}
    >
      {loading ? '處理中...' : label}
    </Button>
  );
}

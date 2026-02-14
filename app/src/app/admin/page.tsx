'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Video,
  Users,
  CreditCard,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  RefreshCw,
} from 'lucide-react';

interface AdminStats {
  jobs: {
    total: number;
    completed: number;
    error: number;
    processing: number;
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
  models: Record<string, number>;
  occasions: Record<string, number>;
  credits: {
    totalPaid: number;
    totalUsed: number;
    totalPurchases: number;
    totalRevenue: number;
  };
  users: {
    unique: number;
    paying: number;
  };
  recentPurchases: Array<{
    id: string;
    email: string;
    credits: number;
    amountTWD: number;
    createdAt: string;
  }>;
  recentJobs: Array<{
    id: string;
    name?: string;
    status: string;
    occasion?: string;
    model?: string;
    email?: string;
    createdAt: string;
    error?: string;
  }>;
  generatedAt: string;
}

const MODEL_LABELS: Record<string, string> = {
  byteplus: 'BytePlus Seedance',
  'veo-3.1': 'Veo 3.1',
  'veo-3.1-fast': 'Veo 3.1 Fast',
  'kling-ai': 'Kling AI',
  unknown: '未知',
};

const OCCASION_LABELS: Record<string, string> = {
  memorial: '追思紀念',
  birthday: '壽宴慶生',
  wedding: '婚禮紀念',
  pet: '寵物紀念',
  other: '其他場合',
  unknown: '未知',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  complete: { label: '完成', color: 'text-green-500', icon: CheckCircle },
  processing: { label: '處理中', color: 'text-blue-500', icon: Clock },
  queued: { label: '排隊中', color: 'text-yellow-500', icon: Clock },
  error: { label: '錯誤', color: 'text-red-500', icon: AlertCircle },
};

export default function AdminPage() {
  const [email, setEmail] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('glimmer_admin_email');
    if (saved) {
      setEmail(saved);
      fetchStats(saved);
    }
  }, []);

  const fetchStats = async (adminEmail: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/stats?email=${encodeURIComponent(adminEmail)}`);
      if (res.status === 401) {
        setError('此 Email 沒有管理員權限');
        setIsAuthenticated(false);
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      setStats(data);
      setIsAuthenticated(true);
      localStorage.setItem('glimmer_admin_email', adminEmail);
    } catch {
      setError('載入統計資料失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      fetchStats(email.trim());
    }
  };

  const handleRefresh = () => {
    if (email) fetchStats(email);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-TW', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border">
          <div className="container mx-auto px-4 py-4">
            <Logo />
          </div>
        </header>
        <main className="container mx-auto px-4 py-20">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle>管理員登入</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <Input
                  type="email"
                  placeholder="管理員 Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? '驗證中...' : '登入'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border sticky top-0 bg-background z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Logo />
            <span className="text-sm text-muted-foreground">管理後台</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{email}</span>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              重新整理
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                localStorage.removeItem('glimmer_admin_email');
                setIsAuthenticated(false);
                setStats(null);
              }}
            >
              登出
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {stats && (
          <div className="space-y-8">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <Video className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stats.jobs.total}</p>
                      <p className="text-xs text-muted-foreground">總影片數</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <Users className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stats.users.unique}</p>
                      <p className="text-xs text-muted-foreground">總用戶數</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <CreditCard className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stats.credits.totalPurchases}</p>
                      <p className="text-xs text-muted-foreground">總購買次數</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/10">
                      <TrendingUp className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">NT${stats.credits.totalRevenue.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">總營收</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Job Stats */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">影片生成統計</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xl font-bold text-green-500">{stats.jobs.completed}</p>
                      <p className="text-xs text-muted-foreground">完成</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xl font-bold text-red-500">{stats.jobs.error}</p>
                      <p className="text-xs text-muted-foreground">錯誤</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xl font-bold text-blue-500">{stats.jobs.processing}</p>
                      <p className="text-xs text-muted-foreground">處理中</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xl font-bold">{stats.jobs.today}</p>
                      <p className="text-xs text-muted-foreground">今日</p>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-border">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">本週</span>
                      <span className="font-medium">{stats.jobs.thisWeek}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">本月</span>
                      <span className="font-medium">{stats.jobs.thisMonth}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">模型使用分布</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(stats.models)
                      .sort(([, a], [, b]) => b - a)
                      .map(([model, count]) => {
                        const total = Object.values(stats.models).reduce((a, b) => a + b, 0);
                        const pct = total > 0 ? (count / total) * 100 : 0;
                        return (
                          <div key={model}>
                            <div className="flex justify-between text-sm mb-1">
                              <span>{MODEL_LABELS[model] || model}</span>
                              <span className="text-muted-foreground">{count} ({pct.toFixed(0)}%)</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Occasion Stats & Credits */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">場合類型分布</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(stats.occasions)
                      .sort(([, a], [, b]) => b - a)
                      .map(([occasion, count]) => {
                        const total = Object.values(stats.occasions).reduce((a, b) => a + b, 0);
                        const pct = total > 0 ? (count / total) * 100 : 0;
                        return (
                          <div key={occasion}>
                            <div className="flex justify-between text-sm mb-1">
                              <span>{OCCASION_LABELS[occasion] || occasion}</span>
                              <span className="text-muted-foreground">{count} ({pct.toFixed(0)}%)</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">點數統計</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xl font-bold">{stats.credits.totalPaid}</p>
                      <p className="text-xs text-muted-foreground">已售點數</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xl font-bold">{stats.credits.totalUsed}</p>
                      <p className="text-xs text-muted-foreground">已用點數</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xl font-bold">{stats.users.paying}</p>
                      <p className="text-xs text-muted-foreground">付費用戶</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xl font-bold">
                        {stats.users.paying > 0
                          ? `NT$${Math.round(stats.credits.totalRevenue / stats.users.paying).toLocaleString()}`
                          : 'N/A'}
                      </p>
                      <p className="text-xs text-muted-foreground">ARPU</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">最近購買</CardTitle>
                </CardHeader>
                <CardContent>
                  {stats.recentPurchases.length === 0 ? (
                    <p className="text-sm text-muted-foreground">尚無購買記錄</p>
                  ) : (
                    <div className="space-y-3">
                      {stats.recentPurchases.map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-sm">
                          <div>
                            <p className="font-medium">{p.email}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-green-500">+{p.credits} 點</p>
                            <p className="text-xs text-muted-foreground">NT${p.amountTWD}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">最近影片</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {stats.recentJobs.map((job) => {
                      const statusConfig = STATUS_CONFIG[job.status] || STATUS_CONFIG.queued;
                      const StatusIcon = statusConfig.icon;
                      return (
                        <div key={job.id} className="flex items-start justify-between text-sm">
                          <div className="flex items-start gap-2">
                            <StatusIcon className={`w-4 h-4 mt-0.5 ${statusConfig.color}`} />
                            <div>
                              <p className="font-medium">{job.name || '未命名'}</p>
                              <p className="text-xs text-muted-foreground">
                                {OCCASION_LABELS[job.occasion || 'unknown']} · {MODEL_LABELS[job.model || 'unknown']}
                              </p>
                              {job.error && (
                                <p className="text-xs text-red-500 mt-1">{job.error}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">{formatDate(job.createdAt)}</p>
                            {job.email && (
                              <p className="text-xs text-muted-foreground truncate max-w-24">{job.email}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Footer */}
            <div className="text-center text-xs text-muted-foreground">
              最後更新：{new Date(stats.generatedAt).toLocaleString('zh-TW')}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

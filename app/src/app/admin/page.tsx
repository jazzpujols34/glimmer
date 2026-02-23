'use client';

import { useState, useEffect } from 'react';
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
  Search,
  Gift,
  LayoutDashboard,
  User,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import type { CreditBalance, CreditRecord, GenerationJob } from '@/types';

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

interface UserData {
  email: string;
  isAdmin: boolean;
  credits: CreditBalance;
  creditRecord: CreditRecord;
  jobs: GenerationJob[];
  totalJobs: number;
}

type AdminTab = 'dashboard' | 'users';

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

  // Tab state
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  // Users tab state
  const [userSearch, setUserSearch] = useState('');
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState('');
  const [userData, setUserData] = useState<UserData | null>(null);
  const [grantCredits, setGrantCredits] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [granting, setGranting] = useState(false);
  const [grantSuccess, setGrantSuccess] = useState('');

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

  const searchUser = async (userEmail: string) => {
    if (!userEmail.trim()) return;
    setUserLoading(true);
    setUserError('');
    setUserData(null);
    setGrantSuccess('');
    try {
      const res = await fetch(
        `/api/admin/users?email=${encodeURIComponent(userEmail.trim())}&adminEmail=${encodeURIComponent(email)}`
      );
      if (res.status === 401) {
        setUserError('沒有權限');
        return;
      }
      if (res.status === 400) {
        setUserError('請輸入 Email');
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch user');
      const data = await res.json();
      setUserData(data);
    } catch {
      setUserError('查詢用戶失敗');
    } finally {
      setUserLoading(false);
    }
  };

  const handleSearchUser = (e: React.FormEvent) => {
    e.preventDefault();
    searchUser(userSearch);
  };

  const handleGrantCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData || !grantCredits) return;
    const credits = parseInt(grantCredits, 10);
    if (isNaN(credits) || credits <= 0) {
      setUserError('請輸入有效的點數');
      return;
    }
    setGranting(true);
    setGrantSuccess('');
    setUserError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail: email,
          userEmail: userData.email,
          credits,
          reason: grantReason || '管理員贈送',
        }),
      });
      if (!res.ok) throw new Error('Failed to grant credits');
      const result = await res.json();
      setGrantSuccess(`成功贈送 ${credits} 點 (新餘額: ${result.newRemaining})`);
      setGrantCredits('');
      setGrantReason('');
      // Refresh user data
      searchUser(userData.email);
    } catch {
      setUserError('贈送點數失敗');
    } finally {
      setGranting(false);
    }
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
        {/* Tab Navigation */}
        <div className="container mx-auto px-4">
          <div className="flex gap-1 border-b border-transparent -mb-px">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'dashboard'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              總覽
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'users'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Users className="w-4 h-4" />
              用戶管理
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && stats && (
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

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            {/* Search */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  查詢用戶
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSearchUser} className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="輸入用戶 Email"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="flex-1"
                  />
                  <Button type="submit" disabled={userLoading || !userSearch.trim()}>
                    {userLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </Button>
                </form>
                {userError && (
                  <p className="mt-2 text-sm text-destructive">{userError}</p>
                )}
              </CardContent>
            </Card>

            {/* User Details */}
            {userData && (
              <div className="grid md:grid-cols-2 gap-6">
                {/* User Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <User className="w-4 h-4" />
                      用戶資訊
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Email</span>
                      <span className="text-sm font-medium">{userData.email}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">身份</span>
                      <span className="text-sm font-medium flex items-center gap-1">
                        {userData.isAdmin ? (
                          <>
                            <ShieldCheck className="w-4 h-4 text-amber-500" />
                            管理員
                          </>
                        ) : (
                          '一般用戶'
                        )}
                      </span>
                    </div>
                    <div className="pt-2 border-t border-border">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xl font-bold text-green-500">
                            {userData.credits.remaining}
                          </p>
                          <p className="text-xs text-muted-foreground">可用點數</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xl font-bold">
                            {userData.creditRecord.total}
                          </p>
                          <p className="text-xs text-muted-foreground">購買總數</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xl font-bold">
                            {userData.creditRecord.used}
                          </p>
                          <p className="text-xs text-muted-foreground">已使用</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xl font-bold">{userData.totalJobs}</p>
                          <p className="text-xs text-muted-foreground">總生成數</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">免費額度使用</span>
                      <span>
                        {userData.credits.freeUsed} / {userData.credits.freeTotal}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Grant Credits */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Gift className="w-4 h-4" />
                      贈送點數
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleGrantCredits} className="space-y-4">
                      <div>
                        <label className="text-sm text-muted-foreground">點數</label>
                        <Input
                          type="number"
                          min="1"
                          placeholder="輸入點數"
                          value={grantCredits}
                          onChange={(e) => setGrantCredits(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">原因（選填）</label>
                        <Input
                          type="text"
                          placeholder="補償、測試、促銷..."
                          value={grantReason}
                          onChange={(e) => setGrantReason(e.target.value)}
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={granting || !grantCredits}
                      >
                        {granting ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            處理中...
                          </>
                        ) : (
                          <>
                            <Gift className="w-4 h-4 mr-2" />
                            贈送點數
                          </>
                        )}
                      </Button>
                      {grantSuccess && (
                        <p className="text-sm text-green-500 flex items-center gap-1">
                          <CheckCircle className="w-4 h-4" />
                          {grantSuccess}
                        </p>
                      )}
                    </form>
                  </CardContent>
                </Card>

                {/* Purchase History */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <CreditCard className="w-4 h-4" />
                      購買記錄
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {userData.creditRecord.purchases.length === 0 ? (
                      <p className="text-sm text-muted-foreground">尚無購買記錄</p>
                    ) : (
                      <div className="space-y-3 max-h-60 overflow-y-auto">
                        {userData.creditRecord.purchases
                          .slice()
                          .reverse()
                          .map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0"
                            >
                              <div>
                                <p className="font-medium">
                                  +{p.credits} 點
                                  {p.provider === 'admin' && (
                                    <span className="ml-2 text-xs text-amber-500">
                                      (管理員贈送)
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(p.createdAt)}
                                </p>
                                {p.adminReason && (
                                  <p className="text-xs text-muted-foreground">
                                    原因：{p.adminReason}
                                  </p>
                                )}
                              </div>
                              <div className="text-right">
                                {p.amountTWD > 0 ? (
                                  <p className="font-medium">NT${p.amountTWD}</p>
                                ) : (
                                  <p className="text-muted-foreground">免費</p>
                                )}
                                <p className="text-xs text-muted-foreground">{p.id}</p>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Recent Jobs */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Video className="w-4 h-4" />
                      最近生成 ({userData.totalJobs})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {userData.jobs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">尚無生成記錄</p>
                    ) : (
                      <div className="space-y-3 max-h-60 overflow-y-auto">
                        {userData.jobs.map((job) => {
                          const statusConfig =
                            STATUS_CONFIG[job.status] || STATUS_CONFIG.queued;
                          const StatusIcon = statusConfig.icon;
                          return (
                            <div
                              key={job.id}
                              className="flex items-start justify-between text-sm border-b border-border pb-2 last:border-0"
                            >
                              <div className="flex items-start gap-2">
                                <StatusIcon
                                  className={`w-4 h-4 mt-0.5 ${statusConfig.color}`}
                                />
                                <div>
                                  <p className="font-medium">{job.name || '未命名'}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {OCCASION_LABELS[job.occasion || 'unknown']} ·{' '}
                                    {MODEL_LABELS[job.settings?.model || 'unknown']}
                                  </p>
                                  {job.error && (
                                    <p className="text-xs text-red-500">{job.error}</p>
                                  )}
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(job.createdAt)}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

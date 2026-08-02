'use client';

import { useState, useEffect, Fragment } from 'react';
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
  Loader2,
  ChevronDown,
  ChevronRight,
  Zap,
  Coins,
} from 'lucide-react';
import type { OverviewResult, SpendDayPoint } from '@/lib/admin-overview';
import type { AdminUserRow } from '@/lib/admin-users';
import type { AdminJobRow } from '@/lib/admin-jobs';

interface OverviewResponse extends OverviewResult {
  jobs: AdminJobRow[];
  truncated: boolean;
  generatedAt: string;
}

interface UsersListResponse {
  users: AdminUserRow[];
  truncated: boolean;
  generatedAt: string;
}

type AdminTab = 'overview' | 'users' | 'jobs';
type UserSort = 'remaining' | 'lastJobAt';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  complete: { label: '完成', color: 'text-green-500', icon: CheckCircle },
  processing: { label: '處理中', color: 'text-blue-500', icon: Clock },
  queued: { label: '排隊中', color: 'text-yellow-500', icon: Clock },
  error: { label: '錯誤', color: 'text-red-500', icon: AlertCircle },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('zh-TW', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(dateStr: string) {
  // dateStr is a UTC YYYY-MM-DD date key (spend:YYYY-MM-DD), not a full timestamp.
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function currentMonthRevenueTWD(purchases: OverviewResponse['revenue']['purchases']): number {
  const now = new Date();
  return purchases
    .filter((p) => {
      const d = new Date(p.createdAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((sum, p) => sum + (p.amountTWD || 0), 0);
}

function clampPercent(pct: number): number {
  return Math.min(92, Math.max(8, pct));
}

/**
 * Inline SVG bar chart — no chart library. `points` chronological oldest -> newest.
 * Hover (desktop) / tap (touch, via onClick toggle) shows a tooltip above the
 * column and dims the other bars. Zero-value days still render a small muted
 * stub at the baseline so an all-zero window reads as data, not an empty void.
 */
function MiniBarChart({
  points,
  valueKey,
  barClassName,
  valueFormatter,
}: {
  points: SpendDayPoint[];
  valueKey: 'tokens' | 'estCostUSD';
  barClassName: string;
  valueFormatter: (v: number) => string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const width = 320;
  const height = 64;
  const gap = 2;
  const stubHeight = 2;
  const values = points.map((p) => p[valueKey]);
  const max = Math.max(1, ...values);
  const slot = width / Math.max(1, points.length);
  const barWidth = Math.max(1, slot - gap);

  const toggleHover = (i: number) => setHovered((h) => (h === i ? null : i));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-16" preserveAspectRatio="none" role="img">
        <line x1={0} y1={height - 1} x2={width} y2={height - 1} className="stroke-muted-foreground/25" strokeWidth={1} />
        {points.map((p, i) => {
          const value = p[valueKey];
          const isZero = value <= 0;
          const barHeight = isZero ? stubHeight : Math.max(1, (value / max) * (height - 4));
          const x = i * slot + gap / 2;
          const y = height - barHeight;
          const dimmed = hovered !== null && hovered !== i;
          return (
            <rect
              key={p.date}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx="1"
              className={isZero ? 'fill-muted-foreground/25' : barClassName}
              style={{ opacity: dimmed ? 0.7 : 1 }}
            />
          );
        })}
        {/* Invisible full-column-height hit targets — zero-value days stay hoverable too */}
        {points.map((p, i) => (
          <rect
            key={`hit-${p.date}`}
            x={i * slot}
            y={0}
            width={slot}
            height={height}
            fill="transparent"
            style={{ pointerEvents: 'all', cursor: 'pointer' }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => toggleHover(i)}
          />
        ))}
      </svg>
      {hovered !== null && (
        <div
          className="absolute bottom-full mb-1 -translate-x-1/2 z-10 whitespace-nowrap rounded-md border bg-popover text-popover-foreground text-xs px-2 py-1 shadow-md pointer-events-none"
          style={{ left: `${clampPercent(((hovered + 0.5) / points.length) * 100)}%` }}
        >
          <div className="font-medium">{formatShortDate(points[hovered].date)}</div>
          <div className="text-muted-foreground">{valueFormatter(points[hovered][valueKey])}</div>
        </div>
      )}
      {points.length > 0 && (
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>{formatShortDate(points[0].date)}</span>
          <span>{formatShortDate(points[points.length - 1].date)}</span>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const [email, setEmail] = useState('');
  const [adminSecret, setAdminSecret] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  // Overview tab (also carries the 生成紀錄 feed — see /api/admin/overview)
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');

  // Users tab
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userSort, setUserSort] = useState<UserSort>('lastJobAt');
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [grantCredits, setGrantCredits] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState('');
  const [grantSuccess, setGrantSuccess] = useState('');

  // Jobs tab (filter can be linked in from a 用戶 row)
  const [jobsEmailFilter, setJobsEmailFilter] = useState('');

  useEffect(() => {
    const savedEmail = localStorage.getItem('glimmer_admin_email');
    const savedSecret = localStorage.getItem('glimmer_admin_secret');
    if (savedEmail && savedSecret) {
      setEmail(savedEmail);
      setAdminSecret(savedSecret);
      fetchOverview(savedEmail, savedSecret);
    }
    // Mount-only bootstrap: restore saved credentials from localStorage and fetch once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 401 = auth rejected (bad email, bad secret, or secret rotated server-side).
  // Clear the stored secret and drop back to the login screen to re-prompt.
  const handleUnauthorized = (message: string) => {
    localStorage.removeItem('glimmer_admin_secret');
    setAdminSecret('');
    setIsAuthenticated(false);
    setError(message);
  };

  const fetchOverview = async (adminEmail: string, secret: string) => {
    setLoading(true);
    setOverviewLoading(true);
    setError('');
    setOverviewError('');
    try {
      const res = await fetch(`/api/admin/overview?email=${encodeURIComponent(adminEmail)}`, {
        headers: { 'x-admin-secret': secret },
      });
      if (res.status === 401) {
        handleUnauthorized('驗證失敗，請確認 Email 與管理密鑰');
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch overview');
      const data = await res.json();
      setOverview(data);
      setIsAuthenticated(true);
      localStorage.setItem('glimmer_admin_email', adminEmail);
      localStorage.setItem('glimmer_admin_secret', secret);
    } catch {
      setError('載入總覽資料失敗');
      setOverviewError('載入總覽資料失敗');
    } finally {
      setLoading(false);
      setOverviewLoading(false);
    }
  };

  const fetchUsers = async (adminEmail: string, secret: string) => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const res = await fetch(`/api/admin/users?adminEmail=${encodeURIComponent(adminEmail)}`, {
        headers: { 'x-admin-secret': secret },
      });
      if (res.status === 401) {
        handleUnauthorized('驗證失敗，請確認 Email 與管理密鑰');
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch users');
      const data: UsersListResponse = await res.json();
      setUsers(data.users);
    } catch {
      setUsersError('載入用戶資料失敗');
    } finally {
      setUsersLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() && adminSecret.trim()) {
      fetchOverview(email.trim(), adminSecret.trim());
    }
  };

  const handleRefresh = () => {
    if (!email || !adminSecret) return;
    fetchOverview(email, adminSecret);
    if (users !== null) fetchUsers(email, adminSecret);
  };

  const handleTabChange = (tab: AdminTab) => {
    setActiveTab(tab);
    if (tab === 'users' && users === null && !usersLoading) {
      fetchUsers(email, adminSecret);
    }
  };

  const viewUserJobs = (targetEmail: string) => {
    setJobsEmailFilter(targetEmail);
    setActiveTab('jobs');
  };

  const toggleExpanded = (targetEmail: string) => {
    setExpandedEmail((current) => (current === targetEmail ? null : targetEmail));
    setGrantCredits('');
    setGrantReason('');
    setGrantError('');
    setGrantSuccess('');
  };

  const handleGrantCredits = async (e: React.FormEvent, targetEmail: string) => {
    e.preventDefault();
    const credits = parseInt(grantCredits, 10);
    if (isNaN(credits) || credits <= 0) {
      setGrantError('請輸入有效的點數');
      return;
    }
    setGranting(true);
    setGrantError('');
    setGrantSuccess('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret },
        body: JSON.stringify({
          adminEmail: email,
          userEmail: targetEmail,
          credits,
          reason: grantReason || '管理員贈送',
        }),
      });
      if (res.status === 401) {
        handleUnauthorized('驗證失敗，請確認 Email 與管理密鑰');
        return;
      }
      if (!res.ok) throw new Error('Failed to grant credits');
      const result = await res.json();
      setGrantSuccess(`成功贈送 ${credits} 點（新餘額：${result.newRemaining}）`);
      setGrantCredits('');
      setGrantReason('');
      fetchUsers(email, adminSecret);
    } catch {
      setGrantError('贈送點數失敗');
    } finally {
      setGranting(false);
    }
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
                <Input
                  type="password"
                  placeholder="管理密鑰"
                  value={adminSecret}
                  onChange={(e) => setAdminSecret(e.target.value)}
                />
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={loading || !email.trim() || !adminSecret.trim()}>
                  {loading ? '驗證中...' : '登入'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // --- Derived view data ---

  const capPct = overview && overview.spend.cap > 0
    ? Math.min(100, (overview.spend.today.tokens / overview.spend.cap) * 100)
    : 0;
  const capBarColor = capPct >= 100 ? 'bg-red-500' : capPct >= 80 ? 'bg-amber-500' : 'bg-primary';

  const filteredUsers = (users || [])
    .filter((u) => u.email.toLowerCase().includes(userSearch.trim().toLowerCase()))
    .slice()
    .sort((a, b) => {
      if (userSort === 'remaining') return b.paidRemaining - a.paidRemaining;
      if (!a.lastJobAt && !b.lastJobAt) return 0;
      if (!a.lastJobAt) return 1;
      if (!b.lastJobAt) return -1;
      return new Date(b.lastJobAt).getTime() - new Date(a.lastJobAt).getTime();
    });

  const filteredJobs = (overview?.jobs || []).filter((j) =>
    jobsEmailFilter.trim() ? (j.email || '').toLowerCase().includes(jobsEmailFilter.trim().toLowerCase()) : true
  );

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
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading || usersLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading || usersLoading ? 'animate-spin' : ''}`} />
              重新整理
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                localStorage.removeItem('glimmer_admin_email');
                localStorage.removeItem('glimmer_admin_secret');
                setAdminSecret('');
                setIsAuthenticated(false);
                setOverview(null);
                setUsers(null);
              }}
            >
              登出
            </Button>
          </div>
        </div>
        {/* Tab Navigation */}
        <div className="container mx-auto px-4">
          <div className="flex gap-1 border-b border-transparent -mb-px">
            {(
              [
                { id: 'overview' as const, label: '總覽', icon: LayoutDashboard },
                { id: 'users' as const, label: '用戶', icon: Users },
                { id: 'jobs' as const, label: '生成紀錄', icon: Video },
              ]
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* 總覽 */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {overviewLoading && !overview && (
              <p className="text-sm text-muted-foreground">載入中...</p>
            )}
            {overviewError && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {overviewError}
              </p>
            )}
            {overview && (
              <>
                {overview.truncated && (
                  <p className="text-xs text-amber-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    資料量過大，本次統計已截斷（僅計算前 2000 筆）
                  </p>
                )}

                {/* Stat tiles */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-500/10">
                          <Zap className="w-5 h-5 text-blue-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-lg font-bold truncate">
                            {overview.spend.today.tokens.toLocaleString()}
                            {overview.spend.cap > 0 && (
                              <span className="text-xs text-muted-foreground"> / {overview.spend.cap.toLocaleString()}</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">今日代幣用量</p>
                        </div>
                      </div>
                      {overview.spend.cap > 0 && (
                        <div className="h-2 bg-muted rounded-full overflow-hidden mt-3">
                          <div className={`h-full rounded-full ${capBarColor}`} style={{ width: `${capPct}%` }} />
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-amber-500/10">
                          <TrendingUp className="w-5 h-5 text-amber-500" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">US${overview.spend.today.estCostUSD.toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">今日預估成本</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-green-500/10">
                          <Coins className="w-5 h-5 text-green-500" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">NT${currentMonthRevenueTWD(overview.revenue.purchases).toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">本月營收</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-purple-500/10">
                          <Users className="w-5 h-5 text-purple-500" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{overview.totals.payingUsers}</p>
                          <p className="text-xs text-muted-foreground">付費用戶數</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Spend chart + revenue vs cost */}
                <div className="grid md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">近 15 日代幣用量</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <MiniBarChart
                        points={overview.spend.days}
                        valueKey="tokens"
                        barClassName="fill-blue-500"
                        valueFormatter={(v) => `${v.toLocaleString()} tokens`}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">近 15 日預估成本（USD）</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <MiniBarChart
                        points={overview.spend.days}
                        valueKey="estCostUSD"
                        barClassName="fill-amber-500"
                        valueFormatter={(v) => `US$${v.toFixed(2)}`}
                      />
                      <p className="text-xs text-muted-foreground mt-2">
                        總營收 NT${overview.revenue.totalTWD.toLocaleString()}（幣別不同，僅供成本趨勢參考，非同幣別毛利）
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Job status + recent purchases */}
                <div className="grid md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">生成狀態分布</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {Object.keys(overview.totals.jobsByStatus).length === 0 ? (
                        <p className="text-sm text-muted-foreground">尚無生成紀錄</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          {Object.entries(overview.totals.jobsByStatus).map(([status, count]) => {
                            const cfg = STATUS_CONFIG[status];
                            return (
                              <div key={status} className="p-3 rounded-lg bg-muted/50">
                                <p className={`text-xl font-bold ${cfg?.color || ''}`}>{count}</p>
                                <p className="text-xs text-muted-foreground">{cfg?.label || status}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="pt-4 mt-2 border-t border-border grid grid-cols-2 gap-4 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">已驗證用戶</span>
                          <span className="font-medium">{overview.totals.verifiedUsers}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">免費層用戶</span>
                          <span className="font-medium">{overview.totals.freeUsers}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <CreditCard className="w-4 h-4" />
                        最近購買
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {overview.revenue.purchases.length === 0 ? (
                        <p className="text-sm text-muted-foreground">尚無購買記錄</p>
                      ) : (
                        <div className="space-y-3 max-h-60 overflow-y-auto">
                          {overview.revenue.purchases.slice(0, 10).map((p) => (
                            <div key={p.id} className="flex items-center justify-between text-sm">
                              <div>
                                <p className="font-medium">{p.email}</p>
                                <p className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-medium text-green-500">+{p.credits} 點</p>
                                <p className="text-xs text-muted-foreground">
                                  {p.amountTWD > 0 ? `NT$${p.amountTWD}` : '免費'}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="text-center text-xs text-muted-foreground">
                  最後更新：{formatDate(overview.generatedAt)}
                </div>
              </>
            )}
          </div>
        )}

        {/* 用戶 */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-6 flex flex-col sm:flex-row gap-3 sm:items-center">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="搜尋 Email"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex gap-1">
                  <Button
                    variant={userSort === 'lastJobAt' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setUserSort('lastJobAt')}
                  >
                    依最後生成時間
                  </Button>
                  <Button
                    variant={userSort === 'remaining' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setUserSort('remaining')}
                  >
                    依剩餘點數
                  </Button>
                </div>
              </CardContent>
            </Card>

            {usersLoading && (
              <p className="text-sm text-muted-foreground">載入中...</p>
            )}
            {usersError && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {usersError}
              </p>
            )}
            {!usersLoading && !usersError && users !== null && filteredUsers.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {userSearch ? '找不到符合的用戶' : '尚無用戶資料'}
              </p>
            )}

            {!usersLoading && filteredUsers.length > 0 && (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="p-3 font-medium">Email</th>
                        <th className="p-3 font-medium">驗證</th>
                        <th className="p-3 font-medium">剩餘 / 已用</th>
                        <th className="p-3 font-medium">免費額度</th>
                        <th className="p-3 font-medium">最後生成</th>
                        <th className="p-3 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => (
                        <Fragment key={u.email}>
                          <tr className="border-b border-border last:border-0">
                            <td className="p-3 font-medium">{u.email}</td>
                            <td className="p-3">
                              {u.verified ? (
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              ) : (
                                <span className="text-xs text-muted-foreground">未驗證</span>
                              )}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="text-green-500 font-medium">{u.paidRemaining}</span>
                              <span className="text-muted-foreground"> / {u.paidUsed}</span>
                            </td>
                            <td className="p-3 whitespace-nowrap text-muted-foreground">{u.freeUsed} / 3</td>
                            <td className="p-3 whitespace-nowrap text-muted-foreground">
                              {u.lastJobAt ? formatDate(u.lastJobAt) : '—'}
                            </td>
                            <td className="p-3 text-right whitespace-nowrap">
                              <Button variant="ghost" size="sm" onClick={() => viewUserJobs(u.email)}>
                                生成紀錄
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => toggleExpanded(u.email)}>
                                {expandedEmail === u.email ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </Button>
                            </td>
                          </tr>
                          {expandedEmail === u.email && (
                            <tr className="border-b border-border last:border-0 bg-muted/30">
                              <td colSpan={6} className="p-4">
                                <div className="grid md:grid-cols-2 gap-6">
                                  <div>
                                    <p className="text-sm font-medium mb-2 flex items-center gap-1">
                                      <CreditCard className="w-4 h-4" />
                                      購買紀錄（{u.purchases.length}）
                                    </p>
                                    {u.purchases.length === 0 ? (
                                      <p className="text-sm text-muted-foreground">尚無購買記錄</p>
                                    ) : (
                                      <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {u.purchases
                                          .slice()
                                          .reverse()
                                          .map((p) => (
                                            <div key={p.id} className="flex items-center justify-between text-xs border-b border-border pb-1 last:border-0">
                                              <div>
                                                <p>{formatDate(p.createdAt)}</p>
                                                {p.ecpayTradeNo && (
                                                  <p className="text-muted-foreground">交易序號：{p.ecpayTradeNo}</p>
                                                )}
                                                {p.adminReason && <p className="text-muted-foreground">原因：{p.adminReason}</p>}
                                              </div>
                                              <div className="text-right">
                                                <p className="text-green-500">+{p.credits} 點</p>
                                                <p className="text-muted-foreground">
                                                  {p.amountTWD > 0 ? `NT$${p.amountTWD}` : '免費'}
                                                </p>
                                              </div>
                                            </div>
                                          ))}
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium mb-2 flex items-center gap-1">
                                      <Gift className="w-4 h-4" />
                                      贈送點數
                                    </p>
                                    <form onSubmit={(e) => handleGrantCredits(e, u.email)} className="space-y-2">
                                      <Input
                                        type="number"
                                        min="1"
                                        placeholder="點數"
                                        value={grantCredits}
                                        onChange={(e) => setGrantCredits(e.target.value)}
                                      />
                                      <Input
                                        type="text"
                                        placeholder="原因（選填）"
                                        value={grantReason}
                                        onChange={(e) => setGrantReason(e.target.value)}
                                      />
                                      <Button type="submit" size="sm" disabled={granting || !grantCredits}>
                                        {granting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Gift className="w-4 h-4 mr-2" />}
                                        贈送
                                      </Button>
                                      {grantError && <p className="text-xs text-destructive">{grantError}</p>}
                                      {grantSuccess && (
                                        <p className="text-xs text-green-500 flex items-center gap-1">
                                          <CheckCircle className="w-3 h-3" />
                                          {grantSuccess}
                                        </p>
                                      )}
                                    </form>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* 生成紀錄 */}
        {activeTab === 'jobs' && (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-6 flex flex-col sm:flex-row gap-3 sm:items-center">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="以 Email 篩選"
                    value={jobsEmailFilter}
                    onChange={(e) => setJobsEmailFilter(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {jobsEmailFilter && (
                  <Button variant="outline" size="sm" onClick={() => setJobsEmailFilter('')}>
                    清除篩選
                  </Button>
                )}
              </CardContent>
            </Card>

            {overviewLoading && !overview && (
              <p className="text-sm text-muted-foreground">載入中...</p>
            )}
            {overviewError && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {overviewError}
              </p>
            )}
            {overview && filteredJobs.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {jobsEmailFilter ? '找不到符合篩選條件的生成紀錄' : '尚無生成紀錄'}
              </p>
            )}

            {overview && filteredJobs.length > 0 && (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="p-3 font-medium">時間</th>
                        <th className="p-3 font-medium">Email</th>
                        <th className="p-3 font-medium">IP</th>
                        <th className="p-3 font-medium">設定</th>
                        <th className="p-3 font-medium">點數</th>
                        <th className="p-3 font-medium">預估成本</th>
                        <th className="p-3 font-medium">狀態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredJobs.map((j) => {
                        const cfg = STATUS_CONFIG[j.status] || STATUS_CONFIG.queued;
                        const StatusIcon = cfg.icon;
                        return (
                          <tr key={j.id} className="border-b border-border last:border-0">
                            <td className="p-3 whitespace-nowrap text-muted-foreground">{formatDate(j.createdAt)}</td>
                            <td className="p-3 whitespace-nowrap">{j.email || '—'}</td>
                            <td className="p-3 whitespace-nowrap text-muted-foreground">{j.ip || '—'}</td>
                            <td className="p-3 whitespace-nowrap text-muted-foreground">{j.settingsSummary}</td>
                            <td className="p-3 whitespace-nowrap">{j.creditsCharged}</td>
                            <td className="p-3 whitespace-nowrap text-muted-foreground">US${j.estCostUSD.toFixed(3)}</td>
                            <td className="p-3 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 ${cfg.color}`}>
                                <StatusIcon className="w-3.5 h-3.5" />
                                {cfg.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

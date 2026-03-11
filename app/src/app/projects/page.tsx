'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AccessGate } from '@/components/AccessGate';
import { ArrowLeft, Plus, FolderOpen, Calendar, Film, Pencil, Check, X } from 'lucide-react';
import type { Project } from '@/types';

export default function ProjectsPage() {
  return (
    <AccessGate>
      <ProjectsPageContent />
    </AccessGate>
  );
}

function ProjectsPageContent() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('載入失敗');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setCreating(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      if (!res.ok) throw new Error('建立失敗');
      const data = await res.json();
      setProjects((prev) => [data.project, ...prev]);
      setNewProjectName('');
    } catch (err) {
      alert(err instanceof Error ? err.message : '建立失敗');
    } finally {
      setCreating(false);
    }
  }

  async function handleRename(projectId: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '重新命名失敗');
      }
      setProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, name: trimmed } : p
      ));
      setRenamingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : '重新命名失敗');
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Logo />
          <Button variant="outline" asChild>
            <Link href="/gallery">
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回影片庫
            </Link>
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-4">專案管理</h1>
            <p className="text-muted-foreground">
              將多個影片片段整理成一個專案，方便管理與製作
            </p>
          </div>

          {/* Create new project */}
          <Card className="mb-8">
            <CardContent className="p-6">
              <form onSubmit={handleCreateProject} className="flex gap-4">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="輸入專案名稱，例如：媽媽追思影片"
                  className="flex-1 px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  maxLength={100}
                />
                <Button type="submit" disabled={creating || !newProjectName.trim()}>
                  <Plus className="w-4 h-4 mr-2" />
                  {creating ? '建立中...' : '建立專案'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Projects list */}
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <CardContent className="p-6">
                    <div className="h-6 bg-muted animate-pulse rounded w-2/3 mb-4" />
                    <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : error ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-destructive mb-4">{error}</p>
                <Button onClick={() => window.location.reload()}>重試</Button>
              </CardContent>
            </Card>
          ) : projects.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FolderOpen className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">還沒有專案</h2>
                <p className="text-muted-foreground">
                  建立一個專案來開始整理您的影片
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {projects.map((project) => (
                <Card key={project.id} className="overflow-hidden hover:shadow-lg transition-shadow h-full">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      {renamingId === project.id ? (
                        <form
                          className="flex items-center gap-2 flex-1"
                          onSubmit={(e) => { e.preventDefault(); handleRename(project.id); }}
                        >
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="flex-1 px-2 py-1 rounded border border-border bg-background text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
                            maxLength={100}
                            autoFocus
                            onKeyDown={(e) => { if (e.key === 'Escape') setRenamingId(null); }}
                          />
                          <Button type="submit" size="icon" variant="ghost" disabled={!renameValue.trim()}>
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button type="button" size="icon" variant="ghost" onClick={() => setRenamingId(null)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </form>
                      ) : (
                        <>
                          <Link href={`/projects/${project.id}`} className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg hover:text-primary transition-colors truncate">
                              {project.name}
                            </h3>
                          </Link>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={() => { setRenamingId(project.id); setRenameValue(project.name); }}
                            title="重新命名"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                    {project.description && (
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {project.description}
                      </p>
                    )}
                    <Link href={`/projects/${project.id}`}>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Film className="w-4 h-4" />
                          {project.jobIds.length} 支影片
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(project.updatedAt)}
                        </span>
                      </div>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
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

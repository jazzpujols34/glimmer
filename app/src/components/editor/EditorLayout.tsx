'use client';

import { useState } from 'react';
import { useEditor, useEditorDispatch } from './EditorContext';
import { Timeline } from './Timeline';
import { VideoPreview } from './VideoPreview';
import { ClipPropertiesPanel } from './ClipPropertiesPanel';
import { SubtitlePanel } from './SubtitlePanel';
import { MusicPanel } from './MusicPanel';
import { TitleCardPanel } from './TitleCardPanel';
import { SfxPanel } from './SfxPanel';
import { ExportPanel } from './ExportPanel';
import { AddClipsDialog } from './AddClipsDialog';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import {
  ArrowLeft,
  Film,
  Type,
  Music,
  LayoutTemplate,
  Zap,
  Download,
  Play,
  Pause,
  SkipBack,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EditorPanel } from '@/types/editor';

const PANEL_TABS: { panel: EditorPanel; label: string; icon: typeof Film }[] = [
  { panel: 'clips', label: '片段', icon: Film },
  { panel: 'subtitles', label: '字幕', icon: Type },
  { panel: 'music', label: '音樂', icon: Music },
  { panel: 'sfx', label: '音效', icon: Zap },
  { panel: 'titles', label: '片頭片尾', icon: LayoutTemplate },
  { panel: 'export', label: '匯出', icon: Download },
];

export function EditorLayout() {
  const state = useEditor();
  const dispatch = useEditorDispatch();
  const [showAddClips, setShowAddClips] = useState(false);

  const handlePlayPause = () => {
    dispatch({ type: 'SET_PLAYING', payload: !state.isPlaying });
  };

  const handleRestart = () => {
    dispatch({ type: 'SET_PLAYHEAD', payload: 0 });
    dispatch({ type: 'SET_PLAYING', payload: false });
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-background">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/gallery">
                <ArrowLeft className="w-4 h-4 mr-1" />
                返回
              </Link>
            </Button>
            <div className="h-5 w-px bg-border" />
            <Logo compact />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate max-w-[200px]">
              {state.jobName || '影片編輯'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Add clips */}
            <Button variant="outline" size="sm" onClick={() => setShowAddClips(true)}>
              <Plus className="w-4 h-4 mr-1" />
              新增片段
            </Button>
            <div className="h-5 w-px bg-border" />
            {/* Playback controls */}
            <Button variant="ghost" size="sm" onClick={handleRestart}>
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handlePlayPause}>
              {state.isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Main area: Preview + Properties panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Preview area */}
        <div className="flex-1 bg-black flex items-center justify-center relative">
          <VideoPreview />
        </div>

        {/* Right panel */}
        <div className="w-72 border-l border-border bg-background flex flex-col">
          {/* Panel tabs */}
          <div className="flex border-b border-border overflow-x-auto">
            {PANEL_TABS.map(({ panel, label, icon: Icon }) => (
              <button
                key={panel}
                onClick={() => dispatch({ type: 'SET_ACTIVE_PANEL', payload: panel })}
                className={cn(
                  'flex-1 flex flex-col items-center gap-0.5 py-2 px-1 text-[10px] transition-colors min-w-[48px]',
                  state.activePanel === panel
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto">
            {state.activePanel === 'clips' && <ClipPropertiesPanel />}
            {state.activePanel === 'subtitles' && <SubtitlePanel />}
            {state.activePanel === 'music' && <MusicPanel />}
            {state.activePanel === 'sfx' && <SfxPanel />}
            {state.activePanel === 'titles' && <TitleCardPanel />}
            {state.activePanel === 'export' && <ExportPanel />}
          </div>
        </div>
      </div>

      {/* Timeline at the bottom */}
      <Timeline />

      {/* Add clips dialog */}
      <AddClipsDialog open={showAddClips} onClose={() => setShowAddClips(false)} />
    </div>
  );
}


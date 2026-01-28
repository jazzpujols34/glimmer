'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { GenerationSettings, TaskType, ModelType, AspectRatio, Resolution } from '@/types';

interface SettingsSidebarProps {
  settings: GenerationSettings;
  onSettingsChange: (settings: GenerationSettings) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const taskTypes: { value: TaskType; label: string; description: string }[] = [
  { value: 'image-to-video', label: 'Image to Video', description: '將照片轉換為影片' },
  { value: 'reference-subject', label: 'Reference (Subject)', description: '以參考圖作為主題' },
  { value: 'reference-style', label: 'Reference (Style)', description: '以參考圖作為風格' },
];

const models: { value: ModelType; label: string; description: string }[] = [
  { value: 'byteplus', label: 'BytePlus Seedance', description: '推薦，2-12秒影片' },
  { value: 'veo-3.1', label: 'Veo 3.1', description: 'Google，8秒固定' },
  { value: 'veo-3.1-fast', label: 'Veo 3.1 Fast', description: 'Google 快速' },
  { value: 'kling-ai', label: 'Kling AI', description: '5或10秒' },
];

const aspectRatios: { value: AspectRatio; label: string }[] = [
  { value: '16:9', label: '16:9 (橫向)' },
  { value: '9:16', label: '9:16 (直向)' },
];

const resolutions: { value: Resolution; label: string }[] = [
  { value: '720p', label: '720p (HD)' },
  { value: '1080p', label: '1080p (Full HD)' },
];

// Helper to check model type
const isVeoModel = (model: ModelType) => model === 'veo-3.1' || model === 'veo-3.1-fast';
const isBytePlusModel = (model: ModelType) => model === 'byteplus';
const isKlingModel = (model: ModelType) => model === 'kling-ai';

function SettingsContent({ settings, onSettingsChange }: Omit<SettingsSidebarProps, 'isOpen' | 'onOpenChange'>) {
  const updateSetting = <K extends keyof GenerationSettings>(key: K, value: GenerationSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  // Handle model change with auto-adjustment of dependent settings
  const handleModelChange = (newModel: ModelType) => {
    const updates: Partial<GenerationSettings> = { model: newModel };

    if (isVeoModel(newModel)) {
      // Veo: fixed 8s, can use 720p or 1080p
      updates.videoLength = 8;
    } else if (isBytePlusModel(newModel)) {
      // BytePlus: 2-12s, 720p or 1080p
      updates.videoLength = Math.min(Math.max(settings.videoLength, 2), 12);
    } else if (isKlingModel(newModel)) {
      // Kling: 5s or 10s, locked to 720p
      updates.videoLength = settings.videoLength <= 5 ? 5 : 10;
      updates.resolution = '720p';
    }

    onSettingsChange({ ...settings, ...updates });
  };

  const isVeo = isVeoModel(settings.model);
  const isBytePlus = isBytePlusModel(settings.model);
  const isKling = isKlingModel(settings.model);

  return (
    <div className="space-y-6 py-4">
      {/* Task Type */}
      <div className="space-y-2">
        <Label>任務類型</Label>
        <Select value={settings.taskType} onValueChange={(v) => updateSetting('taskType', v as TaskType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {taskTypes.map((task) => (
              <SelectItem key={task.value} value={task.value}>
                <div>
                  <div className="font-medium">{task.label}</div>
                  <div className="text-xs text-muted-foreground">{task.description}</div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Model */}
      <div className="space-y-2">
        <Label>模型</Label>
        <Select value={settings.model} onValueChange={(v) => handleModelChange(v as ModelType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {models.map((model) => (
              <SelectItem key={model.value} value={model.value}>
                <div>
                  <div className="font-medium">{model.label}</div>
                  <div className="text-xs text-muted-foreground">{model.description}</div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Prompt */}
      <div className="space-y-2">
        <Label>提示詞 (Prompt)</Label>
        <Textarea
          placeholder="描述您想要的影片效果..."
          value={settings.prompt}
          onChange={(e) => updateSetting('prompt', e.target.value)}
          rows={3}
        />
      </div>

      <Separator />

      <div className="text-sm font-medium text-muted-foreground">進階設定</div>

      {/* Aspect Ratio */}
      <div className="space-y-2">
        <Label>畫面比例</Label>
        <Select value={settings.aspectRatio} onValueChange={(v) => updateSetting('aspectRatio', v as AspectRatio)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {aspectRatios.map((ratio) => (
              <SelectItem key={ratio.value} value={ratio.value}>
                {ratio.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Number of Results */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>生成數量</Label>
          <span className="text-sm text-muted-foreground">{settings.numResults}</span>
        </div>
        <Slider
          value={[settings.numResults]}
          onValueChange={([v]) => updateSetting('numResults', v)}
          min={1}
          max={4}
          step={1}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>1</span>
          <span>4</span>
        </div>
      </div>

      {/* Video Length */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>影片長度</Label>
          <span className="text-sm text-muted-foreground">{settings.videoLength} 秒</span>
        </div>
        {isVeo ? (
          // Veo: Fixed 8 seconds
          <div className="text-sm text-muted-foreground p-2 bg-muted rounded-md">
            Veo 模型固定為 8 秒
          </div>
        ) : isBytePlus ? (
          // BytePlus: 2-12 seconds slider
          <>
            <Slider
              value={[settings.videoLength]}
              onValueChange={([v]) => updateSetting('videoLength', v)}
              min={2}
              max={12}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>2秒</span>
              <span>12秒</span>
            </div>
          </>
        ) : (
          // Kling: 5s or 10s toggle
          <div className="flex gap-2">
            <Button
              type="button"
              variant={settings.videoLength === 5 ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => updateSetting('videoLength', 5)}
            >
              5 秒
            </Button>
            <Button
              type="button"
              variant={settings.videoLength === 10 ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => updateSetting('videoLength', 10)}
            >
              10 秒
            </Button>
          </div>
        )}
      </div>

      {/* Resolution */}
      <div className="space-y-2">
        <Label>輸出解析度</Label>
        {(isVeo || isBytePlus) ? (
          // Veo & BytePlus: 720p or 1080p
          <Select value={settings.resolution} onValueChange={(v) => updateSetting('resolution', v as Resolution)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {resolutions.map((res) => (
                <SelectItem key={res.value} value={res.value}>
                  {res.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          // Kling: locked to 720p
          <div className="text-sm text-muted-foreground p-2 bg-muted rounded-md">
            Kling AI 免費版固定為 720p
          </div>
        )}
      </div>

      {/* Seed */}
      <div className="space-y-2">
        <Label>種子碼 (Seed)</Label>
        <Input
          type="number"
          placeholder="留空使用隨機種子"
          value={settings.seed ?? ''}
          onChange={(e) => updateSetting('seed', e.target.value ? parseInt(e.target.value) : undefined)}
        />
        <p className="text-xs text-muted-foreground">
          相同種子與輸入可產生相似結果
        </p>
      </div>
    </div>
  );
}

export function SettingsSidebar({ settings, onSettingsChange, isOpen, onOpenChange }: SettingsSidebarProps) {
  return (
    <>
      {/* Mobile: Sheet */}
      <div className="lg:hidden">
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full shadow-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>生成設定</SheetTitle>
            </SheetHeader>
            <SettingsContent settings={settings} onSettingsChange={onSettingsChange} />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: Sidebar */}
      <div className="hidden lg:block">
        {isOpen ? (
          <aside className="w-80 border-l border-border bg-card p-4 overflow-y-auto h-[calc(100vh-65px)] sticky top-[65px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">生成設定</h2>
              <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>
            <SettingsContent settings={settings} onSettingsChange={onSettingsChange} />
          </aside>
        ) : (
          <Button
            variant="outline"
            size="icon"
            onClick={() => onOpenChange(true)}
            className="fixed right-4 top-20 z-40"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Button>
        )}
      </div>
    </>
  );
}

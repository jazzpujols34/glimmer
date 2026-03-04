import type { OccasionType } from '@/types/index';
import type { BundledTrack } from '@/types/editor';

// --- Occasion Labels ---

/** Full labels for gallery, admin, detail views */
export const OCCASION_LABELS: Record<OccasionType | string, string> = {
  memorial: '追思紀念',
  birthday: '生日慶祝',
  wedding: '婚禮紀念',
  pet: '寵物紀念',
  other: '其他',
};

/** Short labels for filters, tags, compact UI */
export const OCCASION_LABELS_SHORT: Record<OccasionType, string> = {
  memorial: '追思',
  birthday: '生日',
  wedding: '婚禮',
  pet: '寵物',
  other: '其他',
};

// --- Music ---

export const BUNDLED_TRACKS: BundledTrack[] = [
  { id: 'gentle-piano', name: '溫柔鋼琴', filename: 'gentle-piano.mp3', occasion: 'all', durationSeconds: 60 },
  { id: 'memorial-01', name: '追思旋律', filename: 'memorial-01.mp3', occasion: 'memorial', durationSeconds: 60 },
  { id: 'birthday-01', name: '歡樂慶祝', filename: 'birthday-01.mp3', occasion: 'birthday', durationSeconds: 60 },
  { id: 'wedding-01', name: '浪漫時刻', filename: 'wedding-01.mp3', occasion: 'wedding', durationSeconds: 60 },
];

// --- Title Card Color Presets ---

export const COLOR_PRESETS = [
  // Classic
  { bg: '#000000', text: '#ffffff', label: '黑底白字' },
  { bg: '#ffffff', text: '#1a1a1a', label: '白底黑字' },
  { bg: '#1e293b', text: '#e2e8f0', label: '深藍' },
  { bg: '#fef3c7', text: '#78350f', label: '暖黃' },
  { bg: '#f3e8ff', text: '#581c87', label: '淡紫' },
  // Elegant tones
  { bg: '#85325c', text: '#f0eada', label: '玫瑰木' },
  { bg: '#3d348b', text: '#e1e2dc', label: '皇家靛' },
  { bg: '#73362a', text: '#f0eada', label: '可可棕' },
  { bg: '#aa7733', text: '#f5edd7', label: '金銅色' },
  { bg: '#73754c', text: '#edeae5', label: '橄欖綠' },
];

/**
 * Quick Template System
 *
 * Pre-configured video templates for one-click video generation.
 * Each template includes: music, title card, outro card, transitions.
 */

import type { OccasionType } from '@/types';
import type { StoryboardTransitionType, StoryboardMusic, StoryboardTitleCard } from '@/types';

export interface QuickTemplate {
  id: string;
  name: string;
  nameEn: string;
  occasion: OccasionType;
  description: string;
  descriptionEn: string;

  // Pre-configured settings
  music: Omit<StoryboardMusic, 'name'> & { name: string };
  titleCard: Omit<StoryboardTitleCard, 'text' | 'subtitle'> & {
    textTemplate: string;      // e.g., "永遠懷念 {name}"
    subtitleTemplate?: string; // e.g., "{date}"
  };
  outroCard: Omit<StoryboardTitleCard, 'text' | 'subtitle'> & {
    textTemplate: string;
    subtitleTemplate?: string;
  };
  transition: StoryboardTransitionType;

  // Visual preview
  previewColor: string;  // For UI card background
}

export interface QuickGenerateInput {
  templateId: string;
  photos: File[];

  // User inputs for template placeholders
  name: string;           // Person/pet name
  date?: string;          // Date or date range
  message?: string;       // Custom message

  // Generation settings
  model: string;
  aspectRatio: '16:9' | '9:16';

  // User identity
  email: string;
}

// === Template Definitions ===

export const QUICK_TEMPLATES: QuickTemplate[] = [
  // --- Memorial Templates ---
  {
    id: 'memorial-gentle',
    name: '溫馨追思',
    nameEn: 'Gentle Memorial',
    occasion: 'memorial',
    description: '柔和鋼琴配樂，適合追思與懷念',
    descriptionEn: 'Soft piano music for remembrance',
    music: {
      type: 'bundled',
      src: 'gentle-piano.mp3',
      name: '溫柔鋼琴',
      volume: 0.25,
    },
    titleCard: {
      textTemplate: '永遠懷念 {name}',
      subtitleTemplate: '{date}',
      durationSeconds: 4,
      backgroundColor: '#1a1a2e',
      textColor: '#ffffff',
    },
    outroCard: {
      textTemplate: '願您安息',
      subtitleTemplate: '{message}',
      durationSeconds: 4,
      backgroundColor: '#1a1a2e',
      textColor: '#ffffff',
    },
    transition: 'crossfade-1000',
    previewColor: '#1a1a2e',
  },
  {
    id: 'memorial-classic',
    name: '經典追思',
    nameEn: 'Classic Memorial',
    occasion: 'memorial',
    description: '莊重配樂，適合正式追思會',
    descriptionEn: 'Solemn music for formal memorial',
    music: {
      type: 'bundled',
      src: 'memorial-01.mp3',
      name: '經典追思',
      volume: 0.25,
    },
    titleCard: {
      textTemplate: '追思 {name}',
      subtitleTemplate: '{date}',
      durationSeconds: 5,
      backgroundColor: '#000000',
      textColor: '#ffffff',
    },
    outroCard: {
      textTemplate: '永誌不忘',
      subtitleTemplate: '{message}',
      durationSeconds: 5,
      backgroundColor: '#000000',
      textColor: '#ffffff',
    },
    transition: 'crossfade-1000',
    previewColor: '#000000',
  },

  // --- Birthday Templates ---
  {
    id: 'birthday-joyful',
    name: '歡樂慶生',
    nameEn: 'Joyful Birthday',
    occasion: 'birthday',
    description: '活潑歡樂的生日祝福',
    descriptionEn: 'Cheerful birthday celebration',
    music: {
      type: 'bundled',
      src: 'birthday-01.mp3',
      name: '生日快樂',
      volume: 0.3,
    },
    titleCard: {
      textTemplate: '生日快樂 {name}',
      subtitleTemplate: '{date}',
      durationSeconds: 3,
      backgroundColor: '#ff6b6b',
      textColor: '#ffffff',
    },
    outroCard: {
      textTemplate: '願你年年有今日',
      subtitleTemplate: '{message}',
      durationSeconds: 3,
      backgroundColor: '#ff6b6b',
      textColor: '#ffffff',
    },
    transition: 'crossfade-500',
    previewColor: '#ff6b6b',
  },

  // --- Wedding Templates ---
  {
    id: 'wedding-romantic',
    name: '浪漫婚禮',
    nameEn: 'Romantic Wedding',
    occasion: 'wedding',
    description: '溫馨浪漫的婚禮回顧',
    descriptionEn: 'Romantic wedding memories',
    music: {
      type: 'bundled',
      src: 'wedding-01.mp3',
      name: '浪漫婚禮',
      volume: 0.3,
    },
    titleCard: {
      textTemplate: '{name}',
      subtitleTemplate: '{date}',
      durationSeconds: 4,
      backgroundColor: '#f8e8e8',
      textColor: '#8b4557',
    },
    outroCard: {
      textTemplate: '永浴愛河',
      subtitleTemplate: '{message}',
      durationSeconds: 4,
      backgroundColor: '#f8e8e8',
      textColor: '#8b4557',
    },
    transition: 'crossfade-1000',
    previewColor: '#f8e8e8',
  },

  // --- Pet Templates ---
  {
    id: 'pet-memorial',
    name: '寵物追思',
    nameEn: 'Pet Memorial',
    occasion: 'pet',
    description: '懷念毛小孩的美好時光',
    descriptionEn: 'Cherish memories of your pet',
    music: {
      type: 'bundled',
      src: 'gentle-piano.mp3',
      name: '溫柔鋼琴',
      volume: 0.25,
    },
    titleCard: {
      textTemplate: '永遠的夥伴 {name}',
      subtitleTemplate: '{date}',
      durationSeconds: 4,
      backgroundColor: '#2d4a3e',
      textColor: '#ffffff',
    },
    outroCard: {
      textTemplate: '謝謝你來過',
      subtitleTemplate: '{message}',
      durationSeconds: 4,
      backgroundColor: '#2d4a3e',
      textColor: '#ffffff',
    },
    transition: 'crossfade-1000',
    previewColor: '#2d4a3e',
  },

  // --- Other/General Templates ---
  {
    id: 'other-simple',
    name: '簡約風格',
    nameEn: 'Simple Style',
    occasion: 'other',
    description: '簡潔俐落的通用模板',
    descriptionEn: 'Clean and simple for any occasion',
    music: {
      type: 'bundled',
      src: 'gentle-piano.mp3',
      name: '溫柔鋼琴',
      volume: 0.25,
    },
    titleCard: {
      textTemplate: '{name}',
      subtitleTemplate: '{date}',
      durationSeconds: 3,
      backgroundColor: '#2c3e50',
      textColor: '#ecf0f1',
    },
    outroCard: {
      textTemplate: '{message}',
      subtitleTemplate: '',
      durationSeconds: 3,
      backgroundColor: '#2c3e50',
      textColor: '#ecf0f1',
    },
    transition: 'crossfade-500',
    previewColor: '#2c3e50',
  },
];

// === Helper Functions ===

export function getTemplateById(id: string): QuickTemplate | undefined {
  return QUICK_TEMPLATES.find(t => t.id === id);
}

export function getTemplatesByOccasion(occasion: OccasionType): QuickTemplate[] {
  return QUICK_TEMPLATES.filter(t => t.occasion === occasion);
}

export function getDefaultTemplate(occasion: OccasionType): QuickTemplate {
  const templates = getTemplatesByOccasion(occasion);
  return templates[0] || QUICK_TEMPLATES[QUICK_TEMPLATES.length - 1]; // fallback to 'other-simple'
}

/**
 * Fill template placeholders with user inputs
 */
export function fillTemplate(
  template: string,
  inputs: { name: string; date?: string; message?: string }
): string {
  return template
    .replace('{name}', inputs.name || '')
    .replace('{date}', inputs.date || '')
    .replace('{message}', inputs.message || '')
    .trim();
}

/**
 * Build title card from template + user inputs
 */
export function buildTitleCard(
  template: QuickTemplate,
  inputs: { name: string; date?: string; message?: string }
): StoryboardTitleCard {
  return {
    text: fillTemplate(template.titleCard.textTemplate, inputs),
    subtitle: template.titleCard.subtitleTemplate
      ? fillTemplate(template.titleCard.subtitleTemplate, inputs)
      : undefined,
    durationSeconds: template.titleCard.durationSeconds,
    backgroundColor: template.titleCard.backgroundColor,
    textColor: template.titleCard.textColor,
  };
}

/**
 * Build outro card from template + user inputs
 */
export function buildOutroCard(
  template: QuickTemplate,
  inputs: { name: string; date?: string; message?: string }
): StoryboardTitleCard {
  return {
    text: fillTemplate(template.outroCard.textTemplate, inputs),
    subtitle: template.outroCard.subtitleTemplate
      ? fillTemplate(template.outroCard.subtitleTemplate, inputs)
      : undefined,
    durationSeconds: template.outroCard.durationSeconds,
    backgroundColor: template.outroCard.backgroundColor,
    textColor: template.outroCard.textColor,
  };
}

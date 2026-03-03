/**
 * Shared validation utilities for API routes.
 * Centralizes validation logic to reduce duplication and ensure consistency.
 */

import type { GenerationSettings, OccasionType } from '@/types';
import { defaultSettings } from '@/types';

// Validation constants
export const VALID_OCCASIONS = ['memorial', 'birthday', 'wedding', 'pet', 'other'] as const;
export const VALID_MODELS = ['veo-3.1', 'veo-3.1-fast', 'kling-ai', 'byteplus'] as const;
export const VALID_ASPECT_RATIOS = ['16:9', '9:16'] as const;
export const VALID_RESOLUTIONS = ['720p', '1080p'] as const;
export const VALID_TASK_TYPES = ['image-to-video', 'first-last-frame'] as const;

export const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_NAME_LENGTH = 100;
export const MAX_PROMPT_LENGTH = 500;

/**
 * Email validation using standard regex pattern.
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validate occasion type.
 */
export function isValidOccasion(value: unknown): value is OccasionType {
  return VALID_OCCASIONS.includes(value as OccasionType);
}

/**
 * Validate and sanitize generation settings.
 * Returns a validated settings object with defaults applied.
 */
export function validateSettings(input: unknown): GenerationSettings {
  const settings = { ...defaultSettings };

  if (!input || typeof input !== 'object') {
    return settings;
  }

  const parsed = input as Partial<GenerationSettings>;

  // Validate model
  if (parsed.model && VALID_MODELS.includes(parsed.model as typeof VALID_MODELS[number])) {
    settings.model = parsed.model;
  }

  // Validate aspect ratio
  if (parsed.aspectRatio && VALID_ASPECT_RATIOS.includes(parsed.aspectRatio as typeof VALID_ASPECT_RATIOS[number])) {
    settings.aspectRatio = parsed.aspectRatio;
  }

  // Validate resolution
  if (parsed.resolution && VALID_RESOLUTIONS.includes(parsed.resolution as typeof VALID_RESOLUTIONS[number])) {
    settings.resolution = parsed.resolution;
  }

  // Validate task type
  if (parsed.taskType && VALID_TASK_TYPES.includes(parsed.taskType as typeof VALID_TASK_TYPES[number])) {
    settings.taskType = parsed.taskType;
  }

  // Clamp numResults to 1-4
  if (typeof parsed.numResults === 'number') {
    settings.numResults = Math.max(1, Math.min(4, Math.floor(parsed.numResults)));
  }

  // Clamp videoLength to 2-12 seconds
  if (typeof parsed.videoLength === 'number') {
    settings.videoLength = Math.max(2, Math.min(12, Math.floor(parsed.videoLength)));
  }

  // Sanitize prompt
  if (typeof parsed.prompt === 'string') {
    settings.prompt = parsed.prompt.slice(0, MAX_PROMPT_LENGTH);
  }

  // Boolean flags
  if (typeof parsed.cameraFixed === 'boolean') {
    settings.cameraFixed = parsed.cameraFixed;
  }

  return settings;
}

/**
 * Validate name field.
 */
export function validateName(name: unknown): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: '請提供姓名' };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return { valid: false, error: `姓名不得超過 ${MAX_NAME_LENGTH} 個字元` };
  }
  return { valid: true };
}

/**
 * Validate email field.
 */
export function validateEmail(email: unknown): { valid: boolean; error?: string } {
  if (!email || typeof email !== 'string' || !isValidEmail(email)) {
    return { valid: false, error: '請提供有效的 Email 地址' };
  }
  return { valid: true };
}

/**
 * Validate photo file.
 */
export function validatePhoto(file: Blob): { valid: boolean; error?: string } {
  if (file.size > MAX_PHOTO_SIZE) {
    return { valid: false, error: `照片大小不得超過 ${MAX_PHOTO_SIZE / 1024 / 1024} MB` };
  }
  if (!file.type.startsWith('image/')) {
    return { valid: false, error: '僅接受圖片檔案 (Only image files are accepted)' };
  }
  return { valid: true };
}

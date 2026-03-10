'use client';

import { useRef, useCallback, useState } from 'react';
import type * as NSFWJS from 'nsfwjs';
import { logger } from '@/lib/logger';

// Lazy-loaded NSFW.js model
type NSFWModel = Awaited<ReturnType<typeof NSFWJS.load>>;
let modelPromise: Promise<NSFWModel> | null = null;

async function getModel(): Promise<NSFWModel> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const nsfwjs = await import('nsfwjs');
      // Use the smaller/faster MobileNetV2 model
      return nsfwjs.load();
    })();
  }
  return modelPromise;
}

export interface NSFWResult {
  isNSFW: boolean;
  confidence: number;
  category?: string;
}

// Per-category thresholds — 'Sexy' needs higher confidence because
// nsfwjs MobileNet frequently misclassifies pet photos and skin-toned
// objects as 'Sexy'. Porn/Hentai are more reliable at lower thresholds.
const NSFW_THRESHOLDS: Record<string, number> = {
  Porn: 0.7,
  Hentai: 0.7,
  Sexy: 0.85,
};

/**
 * Check if an image file is NSFW
 */
async function checkImage(file: File): Promise<NSFWResult> {
  const model = await getModel();

  // Create an image element from the file
  const img = document.createElement('img');
  const url = URL.createObjectURL(file);

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });

    const predictions = await model.classify(img);

    // Check each NSFW category against its specific threshold
    let maxNSFWScore = 0;
    let maxCategory = '';
    let isNSFW = false;
    for (const pred of predictions) {
      const threshold = NSFW_THRESHOLDS[pred.className];
      if (threshold !== undefined && pred.probability > maxNSFWScore) {
        maxNSFWScore = pred.probability;
        maxCategory = pred.className;
        if (pred.probability >= threshold) {
          isNSFW = true;
        }
      }
    }

    return {
      isNSFW,
      confidence: maxNSFWScore,
      category: maxCategory || undefined,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface BlockedFile {
  file: File;
  category: string;
  confidence: number;
}

export interface UseNSFWCheckResult {
  checkFiles: (files: File[]) => Promise<{ safe: File[]; blocked: BlockedFile[]; error?: string }>;
  isLoading: boolean;
  isModelLoaded: boolean;
}

/**
 * Hook for checking files for NSFW content
 * Lazy loads the model on first use
 */
export function useNSFWCheck(): UseNSFWCheckResult {
  const [isLoading, setIsLoading] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const modelLoadedRef = useRef(false);

  const checkFiles = useCallback(async (files: File[]): Promise<{ safe: File[]; blocked: BlockedFile[]; error?: string }> => {
    if (files.length === 0) {
      return { safe: [], blocked: [] };
    }

    setIsLoading(true);

    try {
      // Preload model if not loaded
      if (!modelLoadedRef.current) {
        await getModel();
        modelLoadedRef.current = true;
        setIsModelLoaded(true);
      }

      const safe: File[] = [];
      const blocked: BlockedFile[] = [];

      // Check files in parallel for speed
      const results = await Promise.all(
        files.map(async (file) => {
          try {
            const result = await checkImage(file);
            logger.debug('nsfw', `${file.name} → ${result.category || 'clean'} (${(result.confidence * 100).toFixed(0)}%)`);
            return { file, result };
          } catch {
            // If check fails, allow the file (don't block on errors)
            return { file, result: { isNSFW: false, confidence: 0 } as NSFWResult };
          }
        })
      );

      for (const { file, result } of results) {
        if (result.isNSFW) {
          blocked.push({ file, category: result.category || 'unknown', confidence: result.confidence });
        } else {
          safe.push(file);
        }
      }

      return { safe, blocked };
    } catch (error) {
      logger.error('NSFW check error:', error);
      // On model load failure, allow all files (fail open)
      return { safe: files, blocked: [], error: 'Content check unavailable' };
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { checkFiles, isLoading, isModelLoaded };
}

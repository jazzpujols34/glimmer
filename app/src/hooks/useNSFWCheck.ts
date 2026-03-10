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

// NSFW categories to flag
const NSFW_CATEGORIES = ['Porn', 'Hentai'];
const NSFW_THRESHOLD = 0.7; // 70% confidence threshold — 'Sexy' removed (too many false positives on pets/skin-toned objects)

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

    // Find the highest NSFW category score
    let maxNSFWScore = 0;
    let maxCategory = '';
    for (const pred of predictions) {
      if (NSFW_CATEGORIES.includes(pred.className) && pred.probability > maxNSFWScore) {
        maxNSFWScore = pred.probability;
        maxCategory = pred.className;
      }
    }

    return {
      isNSFW: maxNSFWScore >= NSFW_THRESHOLD,
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

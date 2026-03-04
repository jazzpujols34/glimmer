/**
 * Google Analytics 4 event tracking utilities
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type GTagEvent = {
  action: string;
  category: string;
  label?: string;
  value?: number;
  [key: string]: string | number | undefined;
};

/**
 * Track a custom event in GA4
 */
export function trackEvent({ action, category, label, value, ...params }: GTagEvent): void {
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', action, {
    event_category: category,
    event_label: label,
    value,
    ...params,
  });
}

// Pre-defined events for common actions

/** Track when user starts video generation */
export function trackGenerationStart(occasion: string, model: string): void {
  trackEvent({
    action: 'generation_start',
    category: 'video',
    label: occasion,
    model,
  });
}

/** Track when video generation completes */
export function trackGenerationComplete(occasion: string, model: string): void {
  trackEvent({
    action: 'generation_complete',
    category: 'video',
    label: occasion,
    model,
  });
}

/** Track when user initiates purchase */
export function trackPurchaseStart(packId: string, amount: number): void {
  trackEvent({
    action: 'begin_checkout',
    category: 'purchase',
    label: packId,
    value: amount,
    currency: 'TWD',
  });
}

/** Track successful purchase */
export function trackPurchaseComplete(packId: string, amount: number, orderId: string): void {
  trackEvent({
    action: 'purchase',
    category: 'purchase',
    label: packId,
    value: amount,
    currency: 'TWD',
    transaction_id: orderId,
  });
}

/** Track storyboard creation */
export function trackStoryboardCreate(slotCount: number, aspectRatio: string): void {
  trackEvent({
    action: 'storyboard_create',
    category: 'storyboard',
    label: aspectRatio,
    value: slotCount,
  });
}

/** Track video export */
export function trackVideoExport(source: 'editor' | 'storyboard' | 'server', duration: number): void {
  trackEvent({
    action: 'video_export',
    category: 'export',
    label: source,
    value: Math.round(duration),
  });
}

// Additional funnel events for drop-off tracking

/** Track when user views gallery */
export function trackGalleryView(videoCount: number): void {
  trackEvent({
    action: 'gallery_view',
    category: 'funnel',
    value: videoCount,
  });
}

/** Track when user views upgrade page */
export function trackUpgradePageView(creditBalance: number): void {
  trackEvent({
    action: 'upgrade_view',
    category: 'funnel',
    value: creditBalance,
  });
}

/** Track when generation fails */
export function trackGenerationError(occasion: string, model: string, errorCode?: string): void {
  trackEvent({
    action: 'generation_error',
    category: 'video',
    label: occasion,
    model,
    error_code: errorCode,
  });
}

/** Track when user opens editor */
export function trackEditorOpen(clipCount: number): void {
  trackEvent({
    action: 'editor_open',
    category: 'editor',
    value: clipCount,
  });
}

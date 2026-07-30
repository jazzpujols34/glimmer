/**
 * Watermark fail-safe: whether an export should have the watermark burned in.
 * `watermark` is a server-computed decision passed through from /api/gallery/[id]
 * (never client email). Missing/undefined must mean "apply the watermark" —
 * never silently default to a free unwatermarked export.
 */
export function shouldApplyWatermark(watermark?: boolean): boolean {
  return watermark !== false;
}

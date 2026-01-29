import type { FilterPreset } from '@/types/editor';

/** CSS filter strings for Canvas 2D preview rendering */
export const CANVAS_FILTERS: Record<FilterPreset, string> = {
  warm: 'sepia(20%) saturate(120%) brightness(105%)',
  vintage: 'sepia(40%) contrast(90%) brightness(95%) saturate(80%)',
  bw: 'grayscale(100%)',
  vivid: 'saturate(150%) contrast(110%) brightness(105%)',
};

/** FFmpeg filter strings for export */
export const FFMPEG_FILTERS: Record<FilterPreset, string> = {
  warm: 'colorbalance=rs=0.1:gs=0.05:bs=-0.1,eq=saturation=1.2:brightness=0.05',
  vintage: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0,eq=contrast=0.9:brightness=-0.05:saturation=0.8',
  bw: 'colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3',
  vivid: 'eq=saturation=1.5:contrast=1.1:brightness=0.05',
};

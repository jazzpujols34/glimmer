/**
 * Card layout templates for title/outro/text cards.
 *
 * Each template defines:
 * - Preview layout (CSS classes for React rendering)
 * - FFmpeg filter builder (drawtext expressions for Cloud Run export)
 *
 * All templates use the same data: text, subtitle, backgroundColor, textColor.
 * They only differ in how text is positioned and sized.
 */

export interface CardTemplate {
  id: string;
  name: string;
  description: string;
  /** CSS classes for preview rendering */
  preview: {
    container: string;
    title: string;
    subtitle: string;
    /** Optional decorative element between title and subtitle */
    divider?: 'line' | 'dot' | 'dash';
  };
}

export const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: 'classic-center',
    name: '經典置中',
    description: '標題置中，副標題在下方',
    preview: {
      container: 'flex flex-col items-center justify-center',
      title: 'text-4xl md:text-6xl font-bold text-center px-8',
      subtitle: 'text-xl md:text-2xl mt-4 text-center px-8',
    },
  },
  {
    id: 'lower-third',
    name: '下方橫條',
    description: '文字靠下方，現代感',
    preview: {
      container: 'flex flex-col justify-end pb-[15%] px-[8%]',
      title: 'text-3xl md:text-5xl font-bold',
      subtitle: 'text-lg md:text-xl mt-2 opacity-80',
      divider: 'line',
    },
  },
  {
    id: 'top-title',
    name: '頂部標題',
    description: '標題在上方，正式莊重',
    preview: {
      container: 'flex flex-col items-center pt-[15%]',
      title: 'text-3xl md:text-5xl font-bold text-center px-8',
      subtitle: 'text-lg md:text-xl mt-6 text-center px-8 opacity-80',
      divider: 'line',
    },
  },
  {
    id: 'elegant-stack',
    name: '優雅排列',
    description: '大標題與精緻分隔線',
    preview: {
      container: 'flex flex-col items-center justify-center',
      title: 'text-5xl md:text-7xl font-light tracking-widest text-center px-8',
      subtitle: 'text-base md:text-lg mt-6 tracking-[0.3em] text-center px-8 opacity-70',
      divider: 'dot',
    },
  },
  {
    id: 'date-stamp',
    name: '日期印記',
    description: '適合姓名 + 日期',
    preview: {
      container: 'flex flex-col items-center justify-center',
      title: 'text-4xl md:text-6xl font-semibold tracking-wide text-center px-8',
      subtitle: 'text-sm md:text-base mt-5 tracking-[0.5em] uppercase text-center px-8 opacity-60',
      divider: 'dash',
    },
  },
  {
    id: 'minimal',
    name: '極簡留白',
    description: '大量留白，氣質感',
    preview: {
      container: 'flex flex-col items-center justify-center',
      title: 'text-2xl md:text-4xl font-light tracking-wider text-center px-12',
      subtitle: 'text-xs md:text-sm mt-8 tracking-[0.4em] text-center px-12 opacity-50',
    },
  },
];

export function getCardTemplate(templateId?: string): CardTemplate {
  return CARD_TEMPLATES.find(t => t.id === templateId) || CARD_TEMPLATES[0];
}

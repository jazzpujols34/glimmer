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
  // --- 原有 ---
  { id: 'gentle-piano', name: '溫柔鋼琴', filename: 'gentle-piano.mp3', occasion: 'all', durationSeconds: 60 },
  { id: 'memorial-01', name: '追思旋律', filename: 'memorial-01.mp3', occasion: 'memorial', durationSeconds: 60 },
  { id: 'birthday-01', name: '歡樂慶祝', filename: 'birthday-01.mp3', occasion: 'birthday', durationSeconds: 60 },
  { id: 'wedding-01', name: '浪漫時刻', filename: 'wedding-01.mp3', occasion: 'wedding', durationSeconds: 60 },

  // --- 追思 / 感性 ---
  { id: 'leva-eternity', name: '永恆之光', filename: 'lemonmusicstudio-leva-eternity-149473-60s.mp3', occasion: 'memorial', durationSeconds: 60 },
  { id: 'inside-you', name: '心靈深處', filename: 'lemonmusicstudio-inside-you-162760-60s.mp3', occasion: 'memorial', durationSeconds: 60 },
  { id: 'waterfall', name: '瀑布流水', filename: 'romansenykmusic-waterfall-140894-60s.mp3', occasion: 'memorial', durationSeconds: 60 },
  { id: 'reflected-light', name: '光的倒影', filename: 'sergepavkinmusic-reflected-light-147979-60s.mp3', occasion: 'memorial', durationSeconds: 60 },
  { id: 'field-grass', name: '草地微風', filename: 'sergepavkinmusic-field-grass-115973-60s.mp3', occasion: 'memorial', durationSeconds: 60 },
  { id: 'small-miracle', name: '小小奇蹟', filename: 'romarecord1973-a-small-miracle-132333-60s.mp3', occasion: 'memorial', durationSeconds: 60 },
  { id: 'midnight-forest', name: '午夜森林', filename: 'syouki_takahashi-midnight-forest-184304-60s.mp3', occasion: 'memorial', durationSeconds: 60 },
  { id: 'coniferous-forest', name: '松林漫步', filename: 'orangery-coniferous-forest-142569-60s.mp3', occasion: 'memorial', durationSeconds: 60 },

  // --- 溫馨 / 日常 ---
  { id: 'relaxing', name: '悠然自在', filename: 'music_for_videos-relaxing-145038-60s.mp3', occasion: 'all', durationSeconds: 60 },
  { id: 'easy-lifestyle', name: '輕鬆日常', filename: 'music_for_video-easy-lifestyle-137766-60s.mp3', occasion: 'all', durationSeconds: 60 },
  { id: 'perfect-beauty', name: '完美時光', filename: 'good_b_music-perfect-beauty-191271-60s.mp3', occasion: 'all', durationSeconds: 60 },
  { id: 'summer-walk', name: '夏日散步', filename: 'folk_acoustic-summer-walk-152722-60s.mp3', occasion: 'all', durationSeconds: 60 },
  { id: 'beat-of-nature', name: '自然脈動', filename: 'folk_acoustic-the-beat-of-nature-122841-60s.mp3', occasion: 'all', durationSeconds: 60 },
  { id: 'call-to-soul', name: '靈魂呼喚', filename: 'folk_acoustic_music-a-call-to-the-soul-149262-60s.mp3', occasion: 'all', durationSeconds: 60 },
  { id: 'organic-flow', name: '有機旋律', filename: 'aberrantrealities-organic-flow-1015-remastered-485950-60s.mp3', occasion: 'all', durationSeconds: 60 },
  { id: 'fresh', name: '清新活力', filename: 'bransboynd-fresh-457883-60s.mp3', occasion: 'all', durationSeconds: 60 },

  // --- 勵志 / 史詩 ---
  { id: 'inspiring-piano', name: '勵志鋼琴', filename: 'music_for_videos-inspiring-emotional-uplifting-piano-112623-60s.mp3', occasion: 'all', durationSeconds: 60 },
  { id: 'inspiring-cinematic', name: '電影感靈感', filename: 'lexin_music-inspiring-cinematic-ambient-116199-60s.mp3', occasion: 'all', durationSeconds: 60 },
  { id: 'cinematic-doc', name: '紀錄片配樂', filename: 'lexin_music-cinematic-documentary-115669-60s.mp3', occasion: 'all', durationSeconds: 60 },
  { id: 'mountain-path', name: '山間小徑', filename: 'epic_musictracks-mountain-path-125573-60s.mp3', occasion: 'all', durationSeconds: 60 },
  { id: 'inspiring-cinematic-2', name: '壯闊旅程', filename: 'tunetank-inspiring-cinematic-music-409347-60s.mp3', occasion: 'all', durationSeconds: 60 },
  { id: 'epic', name: '史詩序曲', filename: 'kornevmusic-epic-478847-60s.mp3', occasion: 'all', durationSeconds: 60 },
  { id: 'for-p', name: '鋼琴獨白', filename: 'ilyatruhanov-for-p-453681-60s.mp3', occasion: 'all', durationSeconds: 60 },

  // --- 歡樂 / 活潑 ---
  { id: 'upbeat-happy', name: '陽光正向', filename: 'kornevmusic-upbeat-happy-corporate-487426-60s.mp3', occasion: 'birthday', durationSeconds: 60 },
  { id: 'sport-rock', name: '搖滾活力', filename: 'alexgrohl-motivation-sport-rock-trailer-478796-60s.mp3', occasion: 'birthday', durationSeconds: 60 },
  { id: 'comedy-cartoon', name: '歡樂卡通', filename: 'starostin-comedy-cartoon-funny-background-music-492540-60s.mp3', occasion: 'birthday', durationSeconds: 60 },
  { id: 'vlog-hiphop', name: 'Vlog 嘻哈', filename: 'producesplatinum-vlog-hip-hop-483574-60s.mp3', occasion: 'birthday', durationSeconds: 60 },

  // --- 特殊風格 ---
  { id: 'blues-ballad', name: '藍調情歌', filename: 'alec_koff-blues-ballad-487408-60s.mp3', occasion: 'all', durationSeconds: 60 },
  { id: 'lofi-jazzy', name: 'Lo-Fi 爵士', filename: 'sonican-lo-fi-music-loop-sentimental-jazzy-love-473154-60s.mp3', occasion: 'all', durationSeconds: 60 },
  { id: 'wizard-school', name: '魔法學院', filename: 'domartistudios-magical-wizard-school-orchestral-fantasy-488126-60s.mp3', occasion: 'other', durationSeconds: 60 },
  { id: 'lunar-new-year', name: '農曆新年', filename: 'viacheslavstarostin-chinese-lunar-new-year-465871-60s.mp3', occasion: 'other', durationSeconds: 60 },
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

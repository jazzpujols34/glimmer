# 拾光 Glimmer

**AI-powered memorial video creation platform** — Transform cherished photos into moving video tributes for life's most important moments.

Upload old photos, generate AI video clips, and edit them in a full-featured browser-based video editor. No software installation required.

## Features

### AI Video Generation
- **Photo-to-Video** — Upload a photo and generate an AI video clip with natural motion
- **Multi-provider support** — BytePlus Seedance, Google Veo, Kling AI
- **Custom prompts** — Describe the motion and atmosphere you want
- **Aspect ratio options** — 16:9, 9:16, 1:1
- **Gallery** — Browse and manage all generated video clips

### Browser-Based Video Editor
- **Multi-track timeline** — Video, subtitle, music, and SFX tracks
- **Free clip positioning** — Drag clips anywhere on the timeline
- **Resize handles** — Trim clip in/out points by dragging edges
- **Split tool** — Cut clips at the playhead position (video + music)
- **Multi-select** — Shift/Cmd-click to select multiple clips
- **Snap & Ripple** — Snap clips to close gaps, ripple delete
- **Music clips** — Add multiple positioned, trimmable background music clips
- **Subtitles** — Add text overlays with drag-to-position on preview
- **SFX** — Sound effects with timeline positioning
- **Title & Outro cards** — Customizable intro/outro screens
- **Video filters** — Warm, vintage, B&W, vivid presets
- **Speed control** — 0.5x to 2x playback speed per clip
- **In-browser export** — FFmpeg WASM renders the final MP4 entirely in the browser

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4, Radix UI, shadcn/ui |
| Video Export | FFmpeg (WASM) — in-browser, no server upload |
| AI Video | BytePlus Seedance, Google Veo 3.1, Kling AI |
| Icons | Lucide React |

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- API keys for at least one video generation provider

### Setup

```bash
# Clone the repo
git clone https://github.com/jazzpujols34/glimmer.git
cd glimmer/app

# Install dependencies
npm install

# Copy env template and add your API keys
cp .env.example .env.local

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

Copy `.env.example` to `.env.local` and fill in your API keys:

| Variable | Description | Required |
|----------|-------------|----------|
| `BYTEPLUS_API_KEY` | BytePlus Seedance API key | Yes (primary) |
| `BYTEPLUS_MODEL_ID` | BytePlus model endpoint ID | Yes (primary) |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID for Veo | Optional |
| `GOOGLE_CLOUD_LOCATION` | Vertex AI region | Optional |
| `GOOGLE_API_KEY` | Google AI API key | Optional |
| `KLING_ACCESS_KEY` | Kling AI access key | Optional |
| `KLING_SECRET_KEY` | Kling AI secret key | Optional |

### Build

```bash
npm run build
```

## Project Structure

```
glimmer/
├── app/                          # Next.js application
│   ├── src/
│   │   ├── app/                  # App router pages & API routes
│   │   │   ├── api/generate/     # Video generation API
│   │   │   ├── api/gallery/      # Gallery CRUD API
│   │   │   ├── api/transcribe/   # Audio transcription API
│   │   │   ├── edit/[id]/        # Video editor page
│   │   │   ├── gallery/          # Gallery page
│   │   │   └── generate/[id]/    # Generation progress page
│   │   ├── components/
│   │   │   ├── editor/           # Editor components
│   │   │   │   ├── EditorContext.tsx   # State management (useReducer)
│   │   │   │   ├── EditorLayout.tsx   # Panel layout
│   │   │   │   ├── Timeline.tsx       # Multi-track timeline
│   │   │   │   ├── VideoPreview.tsx   # Live preview with playback
│   │   │   │   ├── MusicPanel.tsx     # Music clip browser & editor
│   │   │   │   ├── ExportPanel.tsx    # FFmpeg export UI
│   │   │   │   └── ...
│   │   │   └── ui/               # shadcn/ui components
│   │   ├── lib/
│   │   │   ├── editor/
│   │   │   │   ├── timeline-utils.ts  # Timeline calculations
│   │   │   │   ├── ffmpeg-export.ts   # FFmpeg WASM export pipeline
│   │   │   │   └── filter-maps.ts     # Video filter presets
│   │   │   ├── veo.ts            # AI video generation client
│   │   │   ├── storage.ts        # Local file-based storage
│   │   │   └── prompts.ts        # Prompt templates
│   │   └── types/
│   │       ├── editor.ts         # Editor type definitions
│   │       └── index.ts          # Shared types
│   ├── public/
│   │   └── audio/bundled/        # Built-in music tracks
│   ├── .env.example              # Environment template
│   └── package.json
└── assets/brand/                 # Logo and favicon
```

## Deployment

This app is designed to deploy on **Cloudflare Pages** (or any static/edge platform that supports Next.js).

```bash
# Build for production
cd app
npm run build
```

All video export processing happens client-side via FFmpeg WASM — no server-side video processing infrastructure needed.

## License

MIT

---

Built with Claude Code.

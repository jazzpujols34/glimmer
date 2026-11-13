# Glimmer app

The Next.js application for 拾光 Glimmer. Setup, architecture and deployment notes live in
[`../README.md`](../README.md), [`../CLAUDE.md`](../CLAUDE.md) and [`../RUNBOOK.md`](../RUNBOOK.md).

```bash
npm ci
npm run dev        # http://localhost:3200
npm test           # Vitest
npm run build      # production build, includes the type check
```

Production runs on Cloudflare Pages and deploys on every push to `main`.

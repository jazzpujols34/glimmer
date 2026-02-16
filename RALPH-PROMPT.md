# Ralph Loop Task: Add Error Capture to API Routes

## Objective
Add Sentry error capture to 11 API routes that are currently missing it.

## Routes to Fix
1. `/api/storyboards/route.ts` (GET, POST handlers)
2. `/api/storyboards/[id]/route.ts` (GET, PUT, DELETE handlers)
3. `/api/verify/confirm/route.ts`
4. `/api/gallery/route.ts`
5. `/api/admin/stats/route.ts`
6. `/api/export-status/route.ts`
7. `/api/upload-clip/route.ts`
8. `/api/proxy-r2/route.ts`
9. `/api/upload-music/route.ts`
10. `/api/transcribe/route.ts`
11. `/api/credits/route.ts`

## Pattern to Apply

```typescript
import { captureError } from '@/lib/errors';

// In each catch block, add:
captureError(error, { route: '/api/xxx' });
```

## Steps for Each Route
1. Check if `captureError` import exists, add if missing
2. Find all try-catch blocks in all handlers (GET, POST, PUT, DELETE)
3. Add `captureError(error, { route: '/api/route-path' })` in catch blocks
4. Keep existing error response logic intact
5. Run `npm run build` to verify no TypeScript errors

## Completion Criteria
- All 11 routes have `captureError` in their catch blocks
- `npm run build` passes
- `npm test` passes
- Create git commit: "fix: add error capture to remaining API routes"

## When Complete
Output: `[PROMISE]COMPLETE[/PROMISE]`

## If Blocked
If you hit API rate limits, repeated errors, or cannot proceed:
1. Document progress in PROGRESS.md
2. Output: `[PROMISE]BLOCKED[/PROMISE]`

## Working Directory
`/Users/jazz.lien/Desktop/jazz/0_GitHub/Repositories/17_ultimate_Claude/拾光glimmer/app`

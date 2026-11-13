/**
 * Waits for a server export to finish. The single client-side copy of the
 * export lifecycle: processing -> complete | error, plus the ways the wait
 * itself can end (lost job, unreachable status endpoint, timeout).
 *
 * Resolves with the download URL; rejects with a message fit to show the user.
 */
export interface WaitForExportOptions {
  /** Called before each poll with the fraction of the time budget used (0-1). */
  onTick?: (fraction: number) => void;
  timeoutMessage?: string;
  maxPolls?: number;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

// A blip on the status endpoint says nothing about the export itself.
const MAX_CONSECUTIVE_FAILURES = 5;

export async function waitForExport(exportId: string, opts: WaitForExportOptions = {}): Promise<string> {
  const {
    onTick,
    timeoutMessage = '匯出逾時，請重試',
    maxPolls = 120, // 10 minutes at the default interval
    intervalMs = 5000,
    fetchImpl = fetch,
    sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
  } = opts;

  let failures = 0;
  for (let poll = 1; poll <= maxPolls; poll++) {
    await sleep(intervalMs);
    onTick?.(poll / maxPolls);

    let result: { status?: string; downloadUrl?: string; error?: string } | undefined;
    let notFound = false;
    try {
      const response = await fetchImpl(`/api/export-status?exportId=${encodeURIComponent(exportId)}`);
      notFound = response.status === 404;
      if (response.ok) result = await response.json();
    } catch {
      // fall through as a failed poll
    }

    if (!result) {
      // "Not found" counts as a failed poll too: one stale read must not end a healthy export.
      if (++failures >= MAX_CONSECUTIVE_FAILURES) {
        throw new Error(notFound ? '找不到匯出任務，請重新匯出' : '無法取得匯出進度，請稍後再試');
      }
      continue;
    }
    failures = 0;

    if (result.status === 'complete') {
      if (!result.downloadUrl) throw new Error('未收到下載連結');
      return result.downloadUrl;
    }
    if (result.status === 'error') throw new Error(result.error || '匯出失敗');
  }

  throw new Error(timeoutMessage);
}

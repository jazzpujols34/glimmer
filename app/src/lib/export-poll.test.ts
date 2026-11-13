import { describe, it, expect, vi } from 'vitest';
import { waitForExport } from './export-poll';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const noSleep = () => Promise.resolve();

function run(responses: Array<Response | Error>, extra: Parameters<typeof waitForExport>[1] = {}) {
  const fetchImpl = vi.fn(() => {
    const next = responses.shift();
    if (!next) return Promise.resolve(json({ status: 'processing' }));
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  return { fetchImpl, promise: waitForExport('exp_1', { fetchImpl: fetchImpl as typeof fetch, sleep: noSleep, ...extra }) };
}

describe('waitForExport', () => {
  it('resolves with the download link when the export completes', async () => {
    const { promise } = run([json({ status: 'processing' }), json({ status: 'complete', downloadUrl: '/api/export-download?key=x' })]);
    await expect(promise).resolves.toBe('/api/export-download?key=x');
  });

  it('rejects with the service error', async () => {
    const { promise } = run([json({ status: 'error', error: 'ffmpeg failed' })]);
    await expect(promise).rejects.toThrow('ffmpeg failed');
  });

  it('rides out a gateway error page and a dropped connection', async () => {
    const { promise } = run([
      new Response('<html>502</html>', { status: 502 }),
      new Error('network'),
      json({ status: 'complete', downloadUrl: '/d' }),
    ]);
    await expect(promise).resolves.toBe('/d');
  });

  it('gives up after five failed status checks in a row instead of waiting ten minutes', async () => {
    const { promise, fetchImpl } = run(Array.from({ length: 10 }, () => new Response('', { status: 503 })));
    await expect(promise).rejects.toThrow('無法取得匯出進度');
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it('gives up after five "not found" answers in a row, with the lost-job message', async () => {
    const { promise, fetchImpl } = run(Array.from({ length: 10 }, () => json({ status: 'not_found' }, 404)));
    await expect(promise).rejects.toThrow('找不到匯出任務');
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it('survives a single stale "not found" on a healthy export', async () => {
    const { promise } = run([json({ status: 'not_found' }, 404), json({ status: 'complete', downloadUrl: '/d' })]);
    await expect(promise).resolves.toBe('/d');
  });

  it('rejects a completed export that carries no link', async () => {
    const { promise } = run([json({ status: 'complete' })]);
    await expect(promise).rejects.toThrow('未收到下載連結');
  });

  it('times out with the caller\'s message and reports progress along the way', async () => {
    const onTick = vi.fn();
    const { promise } = run([], { maxPolls: 3, timeoutMessage: '太久了', onTick });
    await expect(promise).rejects.toThrow('太久了');
    expect(onTick.mock.calls.map(c => c[0])).toEqual([1 / 3, 2 / 3, 1]);
  });
});

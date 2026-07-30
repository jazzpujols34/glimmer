import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the KV module before importing storage — same pattern as credits.test.ts
const mockStore = new Map<string, string>();

vi.mock('./kv', () => ({
  kvGet: vi.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  kvPut: vi.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
  kvDelete: vi.fn((key: string) => {
    mockStore.delete(key);
    return Promise.resolve();
  }),
  kvListKeys: vi.fn((prefix: string) =>
    Promise.resolve(Array.from(mockStore.keys()).filter((k) => k.startsWith(prefix)))
  ),
}));

import { createJob, setJobComplete } from './storage';
import { getCompletedJobs } from './storage';

beforeEach(() => {
  mockStore.clear();
});

describe('getCompletedJobs', () => {
  it('returns all completed jobs when no email filter is given', async () => {
    await createJob('job_1', { email: 'a@example.com' });
    await setJobComplete('job_1', 'https://cdn.example.com/a.mp4');
    await createJob('job_2', { email: 'b@example.com' });
    await setJobComplete('job_2', 'https://cdn.example.com/b.mp4');

    const jobs = await getCompletedJobs();
    expect(jobs).toHaveLength(2);
  });

  it('filters to only jobs owned by the given email', async () => {
    await createJob('job_1', { email: 'a@example.com' });
    await setJobComplete('job_1', 'https://cdn.example.com/a.mp4');
    await createJob('job_2', { email: 'b@example.com' });
    await setJobComplete('job_2', 'https://cdn.example.com/b.mp4');

    const jobs = await getCompletedJobs('a@example.com');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe('job_1');
  });

  it('matches the email filter case-insensitively', async () => {
    await createJob('job_1', { email: 'Albert@Example.com' });
    await setJobComplete('job_1', 'https://cdn.example.com/a.mp4');

    const jobs = await getCompletedJobs('albert@example.com');
    expect(jobs).toHaveLength(1);
  });

  it('excludes jobs with no email when a filter is given', async () => {
    await createJob('job_1'); // no email set
    await setJobComplete('job_1', 'https://cdn.example.com/a.mp4');

    const jobs = await getCompletedJobs('a@example.com');
    expect(jobs).toHaveLength(0);
  });

  it('still excludes non-complete jobs when filtering by email', async () => {
    await createJob('job_1', { email: 'a@example.com' }); // stays 'queued'

    const jobs = await getCompletedJobs('a@example.com');
    expect(jobs).toHaveLength(0);
  });
});

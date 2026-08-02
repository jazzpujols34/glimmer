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
import { createProject, createBatch, createQuickJob, createStoryboard } from './storage';
import { defaultSettings } from '@/types';

beforeEach(() => {
  mockStore.clear();
});

describe('ID generation — crypto.randomUUID, not Date.now()+Math.random()', () => {
  const UUID_SUFFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  it('createProject produces a project_<uuid> id', async () => {
    const project = await createProject('測試專案', 'a@example.com');
    expect(project.id.startsWith('project_')).toBe(true);
    expect(project.id.slice('project_'.length)).toMatch(UUID_SUFFIX);
  });

  it('createBatch produces a batch_<uuid> id', async () => {
    const batch = await createBatch('測試', 'a@example.com', 'memorial', defaultSettings, 1, 'proj_1');
    expect(batch.id.startsWith('batch_')).toBe(true);
    expect(batch.id.slice('batch_'.length)).toMatch(UUID_SUFFIX);
  });

  it('createQuickJob produces a quick_<uuid> id', async () => {
    const quick = await createQuickJob('a@example.com', 'memorial-gentle', '測試', 'batch_1');
    expect(quick.id.startsWith('quick_')).toBe(true);
    expect(quick.id.slice('quick_'.length)).toMatch(UUID_SUFFIX);
  });

  it('createStoryboard produces a storyboard_<uuid> id and slot_<uuid> slot ids', async () => {
    const storyboard = await createStoryboard('測試', 2, '16:9', 'a@example.com');
    expect(storyboard.id.startsWith('storyboard_')).toBe(true);
    expect(storyboard.id.slice('storyboard_'.length)).toMatch(UUID_SUFFIX);
    expect(storyboard.slots).toHaveLength(2);
    for (const slot of storyboard.slots) {
      expect(slot.id.startsWith('slot_')).toBe(true);
      expect(slot.id.slice('slot_'.length)).toMatch(UUID_SUFFIX);
    }
  });
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

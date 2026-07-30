import { describe, it, expect, vi } from 'vitest';

// Mock the admin check so ownership tests don't depend on env vars.
vi.mock('./credits', () => ({
  isAdmin: (email: string) => email.toLowerCase().trim() === 'admin@example.com',
}));

import { getRequesterEmail, ownsOrAdmin } from './owner';

describe('getRequesterEmail', () => {
  it('reads ?email= from the URL and normalizes to lowercase', () => {
    const request = { url: 'https://glimmer.video/api/gallery?email=User%40Example.com' };
    expect(getRequesterEmail(request)).toBe('user@example.com');
  });

  it('trims surrounding whitespace', () => {
    const request = { url: `https://glimmer.video/api/gallery?email=${encodeURIComponent('  user@example.com  ')}` };
    expect(getRequesterEmail(request)).toBe('user@example.com');
  });

  it('returns null when the email param is absent', () => {
    const request = { url: 'https://glimmer.video/api/gallery' };
    expect(getRequesterEmail(request)).toBeNull();
  });

  it('returns null when the email param is not a valid email', () => {
    const request = { url: 'https://glimmer.video/api/gallery?email=not-an-email' };
    expect(getRequesterEmail(request)).toBeNull();
  });

  it('returns null when the email param is empty', () => {
    const request = { url: 'https://glimmer.video/api/gallery?email=' };
    expect(getRequesterEmail(request)).toBeNull();
  });
});

describe('ownsOrAdmin', () => {
  it('returns true when the resource email matches the requester exactly', () => {
    expect(ownsOrAdmin('user@example.com', 'user@example.com')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(ownsOrAdmin('User@Example.com', 'user@example.com')).toBe(true);
  });

  it('matches ignoring surrounding whitespace', () => {
    expect(ownsOrAdmin('  user@example.com  ', 'user@example.com')).toBe(true);
  });

  it('returns false for a non-owner', () => {
    expect(ownsOrAdmin('owner@example.com', 'stranger@example.com')).toBe(false);
  });

  it('returns false when the resource has no email field — nobody owns it', () => {
    expect(ownsOrAdmin(undefined, 'user@example.com')).toBe(false);
  });

  it('admin bypasses ownership when resource has an owner', () => {
    expect(ownsOrAdmin('owner@example.com', 'admin@example.com')).toBe(true);
  });

  it('admin bypasses ownership when resource has no owner', () => {
    expect(ownsOrAdmin(undefined, 'admin@example.com')).toBe(true);
  });
});

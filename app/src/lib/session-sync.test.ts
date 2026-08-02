import { describe, it, expect } from 'vitest';
import { resolveSyncedEmail } from './session-sync';

describe('resolveSyncedEmail', () => {
  it('returns null when there is no session (anonymous, unchanged behavior)', () => {
    expect(resolveSyncedEmail({ authenticated: false }, 'typed@example.com')).toBeNull();
  });

  it('returns null when the session response is null (e.g. fetch failed)', () => {
    expect(resolveSyncedEmail(null, 'typed@example.com')).toBeNull();
  });

  it('returns null when authenticated but the resolved email is missing', () => {
    expect(resolveSyncedEmail({ authenticated: true }, 'typed@example.com')).toBeNull();
  });

  it('returns null when the resolved email already matches what is stored', () => {
    expect(resolveSyncedEmail({ authenticated: true, email: 'same@example.com' }, 'same@example.com')).toBeNull();
  });

  it('returns the resolved email when it differs from the stored value', () => {
    const result = resolveSyncedEmail({ authenticated: true, email: 'signed-in@example.com' }, 'typed@example.com');
    expect(result).toBe('signed-in@example.com');
  });

  it('returns the resolved email when nothing was stored yet', () => {
    const result = resolveSyncedEmail({ authenticated: true, email: 'signed-in@example.com' }, null);
    expect(result).toBe('signed-in@example.com');
  });
});

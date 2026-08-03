import { describe, it, expect } from 'vitest';
import { parseLinkPurpose, shouldArmSession, emailSub, isEmailSub } from './magic-link';

describe('parseLinkPurpose', () => {
  it('recognises an explicit login link', () => {
    expect(parseLinkPurpose('login')).toBe('login');
  });

  it('recognises an explicit verify link', () => {
    expect(parseLinkPurpose('verify')).toBe('verify');
  });

  it('defaults to verify for a token minted before purpose existed', () => {
    expect(parseLinkPurpose(undefined)).toBe('verify');
    expect(parseLinkPurpose(null)).toBe('verify');
  });

  it('defaults to verify for anything unrecognised — never arms on junk input', () => {
    for (const junk of ['LOGIN', 'Login', ' login', 'admin', '', 0, 1, true, {}, []]) {
      expect(parseLinkPurpose(junk)).toBe('verify');
    }
  });
});

describe('shouldArmSession', () => {
  it('arms only for login links', () => {
    expect(shouldArmSession('login')).toBe(true);
    expect(shouldArmSession('verify')).toBe(false);
  });

  it('never arms off unparsed input routed through parseLinkPurpose', () => {
    expect(shouldArmSession(parseLinkPurpose('anything-else'))).toBe(false);
    expect(shouldArmSession(parseLinkPurpose(undefined))).toBe(false);
  });
});

describe('emailSub', () => {
  it('namespaces the sub so it cannot collide with a Google numeric sub', () => {
    expect(emailSub('a@b.com')).toBe('email:a@b.com');
    expect(isEmailSub(emailSub('a@b.com'))).toBe(true);
    expect(isEmailSub('104715399479452712199')).toBe(false);
  });

  it('is stable across logins for the same address', () => {
    expect(emailSub('albert@example.com')).toBe(emailSub('albert@example.com'));
  });

  it('normalises case and surrounding whitespace', () => {
    expect(emailSub('  Albert@Example.COM ')).toBe('email:albert@example.com');
    expect(emailSub('A@B.com')).toBe(emailSub('a@b.com'));
  });
});

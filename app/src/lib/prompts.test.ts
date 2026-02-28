import { describe, it, expect } from 'vitest';
import { buildPrompt, getOccasionPrompt, getTaskPrompt } from './prompts';

describe('getOccasionPrompt', () => {
  // Note: Occasion prompts are intentionally empty now.
  // Detailed expression instructions caused AI to distort faces.
  // The system prompt handles the core animation style.

  it('returns empty string for all occasions (simplified prompts)', () => {
    expect(getOccasionPrompt('memorial')).toBe('');
    expect(getOccasionPrompt('birthday')).toBe('');
    expect(getOccasionPrompt('wedding')).toBe('');
    expect(getOccasionPrompt('pet')).toBe('');
    expect(getOccasionPrompt('other')).toBe('');
  });
});

describe('getTaskPrompt', () => {
  // Note: Task prompts are intentionally empty now.
  // The system prompt handles the core animation instructions.

  it('returns empty string for all task types (simplified prompts)', () => {
    expect(getTaskPrompt('image-to-video')).toBe('');
    expect(getTaskPrompt('first-last-frame')).toBe('');
  });
});

describe('buildPrompt', () => {
  it('includes living portrait system prompt for person', () => {
    const prompt = buildPrompt({
      userPrompt: '',
      occasion: 'memorial',
      taskType: 'image-to-video',
    });
    expect(prompt).toContain('Living portrait');
    expect(prompt).toContain('Static camera');
    expect(prompt).toContain('gentle breathing');
    expect(prompt).toContain('soft blink');
  });

  it('uses pet system prompt for pet occasion', () => {
    const prompt = buildPrompt({
      userPrompt: '',
      occasion: 'pet',
      taskType: 'image-to-video',
    });
    expect(prompt).toContain('Living portrait of a pet');
    expect(prompt).toContain('ear twitch');
    expect(prompt).toContain('gentle breathing');
  });

  it('appends user prompt when provided', () => {
    const prompt = buildPrompt({
      userPrompt: 'Make it dreamy',
      occasion: 'memorial',
      taskType: 'image-to-video',
    });
    expect(prompt).toContain('Additional: Make it dreamy');
  });

  it('omits user prompt section when empty', () => {
    const prompt = buildPrompt({
      userPrompt: '',
      occasion: 'memorial',
      taskType: 'image-to-video',
    });
    expect(prompt).not.toContain('Additional:');
  });

  it('omits user prompt section when whitespace only', () => {
    const prompt = buildPrompt({
      userPrompt: '   ',
      occasion: 'memorial',
      taskType: 'image-to-video',
    });
    expect(prompt).not.toContain('Additional:');
  });
});

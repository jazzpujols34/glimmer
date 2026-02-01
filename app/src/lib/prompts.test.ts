import { describe, it, expect } from 'vitest';
import { buildPrompt, getOccasionPrompt, getTaskPrompt } from './prompts';

describe('getOccasionPrompt', () => {
  it('returns memorial prompt', () => {
    expect(getOccasionPrompt('memorial')).toContain('peaceful');
  });

  it('returns pet prompt with pet-specific terms', () => {
    const prompt = getOccasionPrompt('pet');
    expect(prompt).toContain('breathing');
    expect(prompt).toContain('pet');
  });

  it('returns birthday prompt', () => {
    expect(getOccasionPrompt('birthday')).toContain('joyful');
  });

  it('returns wedding prompt', () => {
    expect(getOccasionPrompt('wedding')).toContain('romantic');
  });

  it('returns other prompt', () => {
    expect(getOccasionPrompt('other')).toContain('natural');
  });
});

describe('getTaskPrompt', () => {
  it('returns image-to-video prompt', () => {
    expect(getTaskPrompt('image-to-video')).toContain('animated video');
  });

  it('returns first-last-frame prompt', () => {
    const prompt = getTaskPrompt('first-last-frame');
    expect(prompt).toContain('first frame');
    expect(prompt).toContain('last frame');
  });
});

describe('buildPrompt', () => {
  it('includes system prompt, task prompt, and occasion prompt', () => {
    const prompt = buildPrompt({
      userPrompt: '',
      occasion: 'memorial',
      taskType: 'image-to-video',
    });
    expect(prompt).toContain('gentle video animation');
    expect(prompt).toContain('animated video');
    expect(prompt).toContain('peaceful');
  });

  it('uses pet system prompt for pet occasion', () => {
    const prompt = buildPrompt({
      userPrompt: '',
      occasion: 'pet',
      taskType: 'image-to-video',
    });
    expect(prompt).toContain('pet photograph');
    expect(prompt).toContain('ear twitch');
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

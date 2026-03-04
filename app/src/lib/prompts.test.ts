import { describe, it, expect } from 'vitest';
import { buildPrompt } from './prompts';

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
    expect(prompt).toContain('pet');
    expect(prompt).toContain('breathing');
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

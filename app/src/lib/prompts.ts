import type { OccasionType, TaskType } from '@/types';

/**
 * Universal system prompt for subtle, natural photo animation
 *
 * Philosophy: We want to bring photos "alive" with gentle movements,
 * NOT create dramatic transformations or exaggerated motion.
 * The person in the photo should feel like they're naturally present,
 * as if captured in a brief, intimate moment.
 */
// Simplified prompt to avoid triggering safety filters
export const SYSTEM_PROMPT = `Create a gentle video animation from this photograph.

Animation style:
- Very subtle, natural movements only
- Soft breathing motion, gentle eye movement, slight hair movement
- Maintain the exact appearance of people in the photo
- Keep original composition and lighting
- Smooth, cinematic motion
- Background remains mostly static`;

/**
 * Get occasion-specific prompt enhancement
 * These add emotional context while maintaining the subtle motion philosophy
 */
export function getOccasionPrompt(occasion: OccasionType): string {
  // Simplified prompts to avoid triggering safety filters
  const prompts: Record<OccasionType, string> = {
    memorial: `Style: peaceful, gentle, warm. Soft smile, calm expression.`,
    birthday: `Style: joyful, warm. Gentle smile, happy expression.`,
    wedding: `Style: romantic, warm. Gentle expression, soft gaze.`,
    other: `Style: natural, warm. Gentle expression.`,
  };

  return prompts[occasion];
}

/**
 * Get task-specific instructions
 */
export function getTaskPrompt(taskType: TaskType): string {
  const prompts: Record<TaskType, string> = {
    'image-to-video': `Convert this photo to a short animated video.`,
    'first-last-frame': `Create a smooth video transition from the first frame to the last frame. Ensure natural, continuous motion between both images.`,
  };

  return prompts[taskType];
}

/**
 * Build the complete prompt for video generation
 */
export function buildPrompt(options: {
  userPrompt: string;
  occasion: OccasionType;
  taskType: TaskType;
  name?: string;
}): string {
  const { userPrompt, occasion, taskType } = options;

  // Build a concise prompt to minimize safety filter triggers
  let prompt = SYSTEM_PROMPT;
  prompt += ' ' + getTaskPrompt(taskType);
  prompt += ' ' + getOccasionPrompt(occasion);

  // Add user's custom prompt if provided (but keep it brief)
  if (userPrompt && userPrompt.trim()) {
    prompt += ` Additional: ${userPrompt}`;
  }

  return prompt;
}

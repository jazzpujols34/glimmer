import type { OccasionType, TaskType } from '@/types';

/**
 * Category-aware system prompts for photo animation.
 *
 * Philosophy: We want to bring photos "alive" with gentle movements,
 * NOT create dramatic transformations or exaggerated motion.
 * The subject should feel naturally present, as if captured in a brief,
 * intimate moment.
 *
 * The base prompt adapts to the subject type (person vs pet) so the
 * animation instructions make sense for what's actually in the photo.
 */

/** System prompt for human subjects */
const SYSTEM_PROMPT_PERSON = `A still portrait photo. The person breathes very gently. Minimal movement. Static camera. Do not change the face or expression. Do not crop or reframe.`;

/** System prompt for pet/animal subjects */
const SYSTEM_PROMPT_PET = `A still photo of a pet. The animal breathes very gently. Minimal movement. Static camera. Do not change the face. Do not crop or reframe.`;

/** Get the appropriate system prompt based on occasion */
function getSystemPrompt(occasion: OccasionType): string {
  return occasion === 'pet' ? SYSTEM_PROMPT_PET : SYSTEM_PROMPT_PERSON;
}

/**
 * Get occasion-specific prompt enhancement.
 * Keep it minimal - don't instruct facial expression changes.
 */
export function getOccasionPrompt(occasion: OccasionType): string {
  // Removed expression instructions - they cause AI to distort faces
  const prompts: Record<OccasionType, string> = {
    memorial: ``,
    birthday: ``,
    wedding: ``,
    pet: ``,
    other: ``,
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
 * Build the complete prompt for video generation.
 * The system prompt adapts based on the occasion category.
 */
export function buildPrompt(options: {
  userPrompt: string;
  occasion: OccasionType;
  taskType: TaskType;
  name?: string;
}): string {
  const { userPrompt, occasion, taskType } = options;

  // Use category-aware system prompt
  let prompt = getSystemPrompt(occasion);
  prompt += ' ' + getTaskPrompt(taskType);
  prompt += ' ' + getOccasionPrompt(occasion);

  // Add user's custom prompt if provided (but keep it brief)
  if (userPrompt && userPrompt.trim()) {
    prompt += ` Additional: ${userPrompt}`;
  }

  return prompt;
}

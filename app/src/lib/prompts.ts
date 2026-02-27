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
const SYSTEM_PROMPT_PERSON = `Animate this photograph with subtle lifelike motion.

CRITICAL RULES:
1. PRESERVE EXACT FRAMING - Do NOT crop, reframe, or change composition
2. Keep the ENTIRE original image visible - same borders, same frame
3. NO camera movement - no zoom, pan, tilt, or dolly
4. The output frame must match the input frame exactly

ANIMATION (subtle only):
- Gentle breathing (slight chest/shoulder rise and fall)
- Soft eye blinks, micro eye movements
- Subtle hair or clothing movement
- Keep face and eyes clearly visible at all times
- Background stays completely still`;

/** System prompt for pet/animal subjects */
const SYSTEM_PROMPT_PET = `Animate this pet photograph with subtle lifelike motion.

CRITICAL RULES:
1. PRESERVE EXACT FRAMING - Do NOT crop, reframe, or change composition
2. Keep the ENTIRE original image visible - same borders, same frame
3. NO camera movement - no zoom, pan, tilt, or dolly
4. The output frame must match the input frame exactly

ANIMATION (subtle only):
- Gentle breathing (slight body rise and fall)
- Soft blinks, ear twitches
- Subtle whisker or tail movement
- Keep the pet's face clearly visible at all times
- Background stays completely still`;

/** Get the appropriate system prompt based on occasion */
function getSystemPrompt(occasion: OccasionType): string {
  return occasion === 'pet' ? SYSTEM_PROMPT_PET : SYSTEM_PROMPT_PERSON;
}

/**
 * Get occasion-specific prompt enhancement.
 * These add emotional context while maintaining the subtle motion philosophy.
 */
export function getOccasionPrompt(occasion: OccasionType): string {
  const prompts: Record<OccasionType, string> = {
    memorial: `Style: peaceful, gentle, warm. Soft smile, calm expression.`,
    birthday: `Style: joyful, warm. Gentle smile, happy expression.`,
    wedding: `Style: romantic, warm. Gentle expression, soft gaze.`,
    pet: `Style: warm, tender, loving. Gentle breathing, soft eyes, relaxed pose. Capture the pet's unique personality and charm.`,
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

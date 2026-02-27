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
const SYSTEM_PROMPT_PERSON = `Create a gentle video animation from this photograph.

CRITICAL - Camera:
- FIXED camera position, NO camera movement whatsoever
- NO zoom in, NO zoom out, NO pan, NO tilt, NO dolly
- Frame stays exactly as the original photo

Animation style:
- Very subtle, natural SUBJECT movements only
- Soft breathing motion (chest rising/falling)
- Gentle eye blinks, subtle eye movement
- Slight hair movement from imaginary breeze
- Maintain the exact appearance of people in the photo
- Keep original composition and lighting
- Background remains completely static`;

/** System prompt for pet/animal subjects */
const SYSTEM_PROMPT_PET = `Create a gentle video animation from this pet photograph.

CRITICAL - Camera:
- FIXED camera position, NO camera movement whatsoever
- NO zoom in, NO zoom out, NO pan, NO tilt, NO dolly
- Frame stays exactly as the original photo

Animation style:
- Very subtle, natural SUBJECT movements only
- Soft breathing motion (body rising/falling)
- Gentle ear twitches, subtle whisker movement
- Slight tail movement, soft blinks
- Maintain the exact appearance of the pet in the photo
- Keep original composition and lighting
- Background remains completely static`;

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

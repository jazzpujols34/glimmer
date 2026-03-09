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
const SYSTEM_PROMPT_PERSON = `Living portrait. Static camera. Keep looking at camera. Subtle movements only: gentle breathing, soft blink, tiny natural head micro-movements, hint of a smile. Maintain original pose and gaze. No dramatic actions. No crying. No camera movement.`;

/** System prompt for pet/animal subjects */
const SYSTEM_PROMPT_PET = `Bring this pet to life with natural movement. Continue any motion already implied in the photo — if walking, continue the stride; if sitting, keep relaxed with gentle breathing. Fur and coat sway softly with movement and breeze. Subtle details: breathing, blinking, tongue movement, tail wag, ears twitching. Keep only the original subject, no new animals or objects. Warm, joyful energy. No camera movement.`;

/** Get the appropriate system prompt based on occasion */
function getSystemPrompt(occasion: OccasionType): string {
  return occasion === 'pet' ? SYSTEM_PROMPT_PET : SYSTEM_PROMPT_PERSON;
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
  const { userPrompt, occasion } = options;

  let prompt = getSystemPrompt(occasion);

  // Add user's custom prompt if provided (but keep it brief)
  if (userPrompt && userPrompt.trim()) {
    prompt += ` Additional: ${userPrompt}`;
  }

  return prompt;
}

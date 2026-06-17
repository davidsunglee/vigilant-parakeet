import type { ImageRequest } from './providers/types';

/**
 * Per-request generation config: which text/image models and image quality the
 * durable task uses. Model selection is a server-side concern (never the
 * client's), so the create-story and retry-story edge functions enqueue without
 * a generationConfig and let these defaults apply.
 *
 * This is the single place to change the default models. The generate-story
 * task and the provider adapters all read their fallbacks from here.
 */
export interface GenerationConfig {
  textModel: string;
  imageModel: string;
  // Reuses the provider's image quality union so the discrete levels are not
  // re-spelled here.
  imageQuality: NonNullable<ImageRequest['quality']>;
}

export const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  textModel: 'claude-sonnet-4-6',
  imageModel: 'gpt-image-2',
  imageQuality: 'medium',
};

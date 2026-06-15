import type { IImageProvider } from '../providers/types';

const BASE64_PREFIX = /^data:image\/png;base64,/;

/**
 * Relocated from apex/src/services/ImageService.ts — keep the styled-prompt
 * prefix and 3-attempt retry/backoff in sync. The browser
 * `fetch('/api/image/generate')` proxy call is replaced with a direct adapter
 * call; `model`/`quality`/`userId` are supplied at construction. The returned
 * value is the raw base64 payload (the `data:image/png;base64,` prefix is
 * stripped) so the caller can upload raw bytes to Storage.
 */
export class ImageClient {
  constructor(
    private readonly adapter: IImageProvider,
    private readonly model?: string,
    private readonly quality?: 'low' | 'medium' | 'high',
    private readonly userId?: string,
  ) {}

  async generateImage(
    prompt: string,
    options?: { aspectRatio?: string; resolution?: string; styleAnchor?: string },
    retries = 3,
  ): Promise<string> {
    const styledPrompt = options?.styleAnchor
      ? `${options.styleAnchor} Show the full subject in frame with space around it. Do not crop the animal's head, tail, or limbs. Subject: ${prompt}`
      : `Generate an illustration in a children's educational book style. Show the full subject in frame with space around it. Do not crop the animal's head, tail, or limbs. Subject: ${prompt}`;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await this.adapter.generate({
          prompt: styledPrompt,
          model: this.model,
          aspectRatio: options?.aspectRatio,
          quality: this.quality,
          userId: this.userId,
        });

        // Return the raw base64 payload so the caller uploads raw bytes. An
        // empty payload is a bad response, not a success — reject it so it goes
        // through the retry/failure path rather than uploading a zero-byte PNG.
        const payload = (response.imageDataUri || '').replace(BASE64_PREFIX, '');
        if (!payload) {
          throw new Error('[ImageClient] Adapter returned an empty image payload');
        }
        return payload;
      } catch (error) {
        if (attempt < retries - 1) {
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
          continue;
        }
        // Exhausted all retries: propagate so the caller (and Trigger.dev
        // retry/failure handling) treats this as a terminal generation failure
        // instead of silently uploading an empty image and finalizing `ready`.
        console.error('[ImageClient] Generation failed:', error);
        throw error;
      }
    }
    // Unreachable: the loop either returns a payload or throws on the last
    // attempt. Retained as a defensive guard for retries <= 0.
    throw new Error('[ImageClient] Generation produced no image');
  }
}

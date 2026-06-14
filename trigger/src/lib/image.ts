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

        // Return the raw base64 payload so the caller uploads raw bytes.
        return (response.imageDataUri || '').replace(BASE64_PREFIX, '');
      } catch (error) {
        if (attempt < retries - 1) {
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
          continue;
        }
        console.error('[ImageClient] Generation failed:', error);
        return '';
      }
    }
    return '';
  }
}

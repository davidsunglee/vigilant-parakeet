import type { AiConfig } from '../contexts/AiConfigContext';

export class ImageService {
    static async generateImage(
        config: AiConfig,
        prompt: string,
        options?: { aspectRatio?: string; resolution?: string; styleAnchor?: string },
        retries = 3
    ): Promise<string> {
        const styledPrompt = options?.styleAnchor
            ? `${options.styleAnchor} Show the full subject in frame with space around it. Do not crop the animal's head, tail, or limbs. Subject: ${prompt}`
            : `Generate an illustration in a children's educational book style. Show the full subject in frame with space around it. Do not crop the animal's head, tail, or limbs. Subject: ${prompt}`;

        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const res = await fetch('/api/image/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        provider: config.imageProvider,
                        model: config.imageModel,
                        prompt: styledPrompt,
                        ...(options?.aspectRatio && { aspectRatio: options.aspectRatio }),
                        ...(options?.resolution && { resolution: options.resolution }),
                    }),
                });

                if (res.ok) {
                    const body = await res.json();
                    return body.imageDataUri || '';
                }

                if (res.status === 429 && attempt < retries - 1) {
                    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
                    continue;
                }

                const err = await res.json().catch(() => ({ error: res.statusText }));
                console.error('[ImageService] Generation failed:', err.error);
                return '';
            } catch (error) {
                if (attempt < retries - 1) {
                    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
                    continue;
                }
                console.error('[ImageService] Generation failed:', error);
                return '';
            }
        }
        return '';
    }
}

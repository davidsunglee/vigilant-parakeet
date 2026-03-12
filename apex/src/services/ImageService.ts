import type { AiConfig } from '../contexts/AiConfigContext';

export class ImageService {
    static async generateImage(
        config: AiConfig,
        prompt: string,
        options?: { aspectRatio?: string; resolution?: string }
    ): Promise<string> {
        const styledPrompt = `Generate an illustration in a children's educational book style. Show the full subject in frame with space around it. Do not crop the animal's head, tail, or limbs. Subject: ${prompt}`;

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

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: res.statusText }));
                console.error('[ImageService] Generation failed:', err.error);
                return '';
            }

            const body = await res.json();
            return body.imageDataUri || '';
        } catch (error) {
            console.error('[ImageService] Generation failed:', error);
            return '';
        }
    }
}

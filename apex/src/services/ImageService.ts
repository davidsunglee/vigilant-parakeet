import type { AiConfig } from '../contexts/AiConfigContext';

export class ImageService {
    static async generateImage(config: AiConfig, prompt: string): Promise<string> {
        const styledPrompt = `Generate an illustration in a children's educational book style: ${prompt}`;

        try {
            const res = await fetch('/api/image/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: config.imageProvider,
                    prompt: styledPrompt,
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

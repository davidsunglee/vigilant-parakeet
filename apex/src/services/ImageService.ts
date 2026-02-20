import { GoogleGenAI } from '@google/genai';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

function ensureAi() {
    if (!ai) throw new Error("Gemini API Key is missing. Please add VITE_GEMINI_API_KEY to your .env file.");
    return ai;
}

export class ImageService {
    static async generateImage(prompt: string): Promise<string> {
        const client = ensureAi();
        try {
            const response = await client.models.generateImages({
                model: 'imagen-3.0-generate-001',
                prompt: prompt,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/jpeg',
                    aspectRatio: '3:4'
                }
            });

            if (response.generatedImages && response.generatedImages.length > 0) {
                // @ts-expect-error
                return `data:image/jpeg;base64,${response.generatedImages[0].image.imageBytes}`;
            }
        } catch (error) {
            console.error("Image generation failed:", error);
        }
        return '';
    }
}

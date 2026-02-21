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
            const response = await client.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: `Generate an illustration in a children's educational book style: ${prompt}`,
                config: {
                    responseModalities: ['IMAGE'],
                }
            });

            // Extract image data from the response parts
            if (response.candidates && response.candidates.length > 0) {
                const parts = response.candidates[0].content?.parts;
                if (parts) {
                    for (const part of parts) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const p = part as any;
                        if (p.inlineData && p.inlineData.data) {
                            const mimeType = p.inlineData.mimeType || 'image/png';
                            return `data:${mimeType};base64,${p.inlineData.data}`;
                        }
                    }
                }
            }
            console.warn("[ImageService] No image in response for:", prompt.substring(0, 60));
        } catch (error) {
            console.error("[ImageService] Generation failed:", error);
        }
        return '';
    }
}


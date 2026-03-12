import { GoogleGenAI } from '@google/genai';
import type { IImageProvider, ImageRequest, ImageResponse } from './types';

const DEFAULT_MODEL = 'gemini-2.5-flash-image';

export class GeminiImageAdapter implements IImageProvider {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('Gemini API key is required');
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(request: ImageRequest): Promise<ImageResponse> {
    const response = await this.client.models.generateContent({
      model: request.model ?? DEFAULT_MODEL,
      contents: request.prompt,
      config: {
        responseModalities: ['IMAGE'],
        ...(request.aspectRatio && {
          imageConfig: {
            aspectRatio: request.aspectRatio,
            ...(request.resolution && { imageSize: request.resolution }),
          },
        }),
      },
    });

    if (response.candidates && response.candidates.length > 0) {
      const parts = response.candidates[0].content?.parts;
      if (parts) {
        for (const part of parts) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = part as any;
          if (p.inlineData?.data) {
            const mimeType = p.inlineData.mimeType || 'image/png';
            return { imageDataUri: `data:${mimeType};base64,${p.inlineData.data}` };
          }
        }
      }
    }

    throw new Error('No image data in Gemini response');
  }
}

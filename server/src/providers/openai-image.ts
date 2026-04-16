import OpenAI from 'openai';
import type { IImageProvider, ImageRequest, ImageResponse } from './types';

const DEFAULT_MODEL = 'gpt-image-1';

const GPT_IMAGE_SIZES: Record<string, string> = {
  '1:1': '1024x1024',
  '16:9': '1536x1024',
  '9:16': '1024x1536',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
  '4:3': '1536x1024',
  '3:4': '1024x1536',
};

const DALLE_SIZES: Record<string, string> = {
  '1:1': '1024x1024',
  '16:9': '1792x1024',
  '9:16': '1024x1792',
  '3:2': '1792x1024',
  '2:3': '1024x1792',
  '4:3': '1792x1024',
  '3:4': '1024x1792',
};

export function mapAspectRatioToSize(aspectRatio: string | undefined, model: string): string {
  if (model.startsWith('dall-e')) {
    return (aspectRatio && DALLE_SIZES[aspectRatio]) ?? '1024x1024';
  }
  return (aspectRatio && GPT_IMAGE_SIZES[aspectRatio]) ?? 'auto';
}

export class OpenAiImageAdapter implements IImageProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('OpenAI API key is required');
    this.client = new OpenAI({ apiKey });
  }

  async generate(request: ImageRequest): Promise<ImageResponse> {
    const model = request.model ?? DEFAULT_MODEL;
    const size = mapAspectRatioToSize(request.aspectRatio, model);
    const isDalle = model.startsWith('dall-e');

    const response = await this.client.images.generate({
      model,
      prompt: request.prompt,
      size: size as OpenAI.ImageGenerateParams['size'],
      n: 1,
      ...(isDalle
        ? { response_format: 'b64_json' as const }
        : { output_format: 'png' as const }),
    });

    const imageData = response.data[0];
    if (!imageData?.b64_json) {
      throw new Error('No image data in OpenAI response');
    }

    return { imageDataUri: `data:image/png;base64,${imageData.b64_json}` };
  }
}

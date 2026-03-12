import { describe, expect, it } from 'bun:test';
import type { LlmRequest, LlmResponse, ImageRequest, ImageResponse, ILlmProvider, IImageProvider } from '../types';

describe('Provider types', () => {
  it('LlmRequest accepts valid shape', () => {
    const req: LlmRequest = {
      prompt: 'test',
      responseSchema: { type: 'object', properties: {} },
    };
    expect(req.prompt).toBe('test');
    expect(req.model).toBeUndefined();
    expect(req.systemPrompt).toBeUndefined();
  });

  it('LlmRequest accepts optional fields', () => {
    const req: LlmRequest = {
      prompt: 'test',
      model: 'claude-opus-4-6',
      systemPrompt: 'You are helpful.',
      responseSchema: { type: 'object', properties: {} },
    };
    expect(req.model).toBe('claude-opus-4-6');
    expect(req.systemPrompt).toBe('You are helpful.');
  });

  it('ILlmProvider shape is implementable', () => {
    const mock: ILlmProvider = {
      generate: async (req: LlmRequest): Promise<LlmResponse> => {
        return { data: { result: req.prompt } };
      },
    };
    expect(mock.generate).toBeDefined();
  });

  it('IImageProvider shape is implementable', () => {
    const mock: IImageProvider = {
      generate: async (req: ImageRequest): Promise<ImageResponse> => {
        return { imageDataUri: `data:image/png;base64,${req.prompt}` };
      },
    };
    expect(mock.generate).toBeDefined();
  });

  it('ImageRequest accepts optional model, aspectRatio, and resolution', () => {
    const req: ImageRequest = {
      prompt: 'a cat',
      model: 'gemini-3.1-flash-image-preview',
      aspectRatio: '4:3',
      resolution: '1K',
    };
    expect(req.prompt).toBe('a cat');
    expect(req.model).toBe('gemini-3.1-flash-image-preview');
    expect(req.aspectRatio).toBe('4:3');
    expect(req.resolution).toBe('1K');
  });

  it('ImageRequest works with only prompt (all new fields optional)', () => {
    const req: ImageRequest = { prompt: 'a dog' };
    expect(req.prompt).toBe('a dog');
  });
});

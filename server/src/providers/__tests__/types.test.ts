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
});

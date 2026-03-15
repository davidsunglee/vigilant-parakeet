import { describe, expect, it, beforeEach } from 'bun:test';
import { ProviderRegistry } from '../registry';
import type { ILlmProvider, IImageProvider, LlmRequest, LlmResponse, ImageRequest, ImageResponse } from '../providers/types';

const mockLlm: ILlmProvider = {
  generate: async (req: LlmRequest): Promise<LlmResponse> => ({ data: { echo: req.prompt } }),
};

const mockImage: IImageProvider = {
  generate: async (req: ImageRequest): Promise<ImageResponse> => ({ imageDataUri: `data:image/png;base64,${req.prompt}` }),
};

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it('registers and retrieves an LLM provider', () => {
    registry.registerLlm('test', mockLlm);
    expect(registry.getLlm('test')).toBe(mockLlm);
  });

  it('returns undefined for unknown LLM provider', () => {
    expect(registry.getLlm('nope')).toBeUndefined();
  });

  it('registers and retrieves an image provider', () => {
    registry.registerImage('test', mockImage);
    expect(registry.getImage('test')).toBe(mockImage);
  });

  it('returns undefined for unknown image provider', () => {
    expect(registry.getImage('nope')).toBeUndefined();
  });

  it('lists registered LLM provider names', () => {
    registry.registerLlm('gemini', mockLlm);
    registry.registerLlm('anthropic', mockLlm);
    expect(registry.listLlmProviders()).toEqual(['gemini', 'anthropic']);
  });

  it('lists registered image provider names', () => {
    registry.registerImage('gemini', mockImage);
    expect(registry.listImageProviders()).toEqual(['gemini']);
  });

  it('overwrites a provider when registering the same name twice', () => {
    const otherLlm: ILlmProvider = {
      generate: async (req: LlmRequest): Promise<LlmResponse> => ({ data: { replaced: true } }),
    };
    registry.registerLlm('test', mockLlm);
    registry.registerLlm('test', otherLlm);
    expect(registry.getLlm('test')).toBe(otherLlm);
    expect(registry.listLlmProviders()).toEqual(['test']);
  });

  it('returns empty lists on a fresh registry', () => {
    expect(registry.listLlmProviders()).toEqual([]);
    expect(registry.listImageProviders()).toEqual([]);
  });
});

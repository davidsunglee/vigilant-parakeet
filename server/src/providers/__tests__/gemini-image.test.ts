import { describe, expect, it, mock } from 'bun:test';
import { GeminiImageAdapter } from '../gemini-image';

describe('GeminiImageAdapter', () => {
  it('is constructable with an API key', () => {
    const adapter = new GeminiImageAdapter('fake-key');
    expect(adapter).toBeDefined();
  });

  it('throws on empty API key', () => {
    expect(() => new GeminiImageAdapter('')).toThrow();
  });

  it('uses request.model when provided', async () => {
    const adapter = new GeminiImageAdapter('fake-key');
    const generateContent = mock(() =>
      Promise.resolve({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: 'abc', mimeType: 'image/png' } }],
            },
          },
        ],
      })
    );
    (adapter as any).client = { models: { generateContent } };

    await adapter.generate({ prompt: 'a cat', model: 'gemini-3.1-flash-image-preview' });

    expect(generateContent).toHaveBeenCalledTimes(1);
    const callArgs = generateContent.mock.calls[0][0];
    expect(callArgs.model).toBe('gemini-3.1-flash-image-preview');
  });

  it('falls back to default model when request.model is absent', async () => {
    const adapter = new GeminiImageAdapter('fake-key');
    const generateContent = mock(() =>
      Promise.resolve({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: 'abc', mimeType: 'image/png' } }],
            },
          },
        ],
      })
    );
    (adapter as any).client = { models: { generateContent } };

    await adapter.generate({ prompt: 'a cat' });

    const callArgs = generateContent.mock.calls[0][0];
    expect(callArgs.model).toBe('gemini-2.5-flash-image');
  });

  it('includes imageConfig when aspectRatio is provided', async () => {
    const adapter = new GeminiImageAdapter('fake-key');
    const generateContent = mock(() =>
      Promise.resolve({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: 'abc', mimeType: 'image/png' } }],
            },
          },
        ],
      })
    );
    (adapter as any).client = { models: { generateContent } };

    await adapter.generate({ prompt: 'a cat', aspectRatio: '4:3' });

    const callArgs = generateContent.mock.calls[0][0];
    expect(callArgs.config.imageConfig).toEqual({ aspectRatio: '4:3' });
  });

  it('includes imageSize in imageConfig when resolution is provided', async () => {
    const adapter = new GeminiImageAdapter('fake-key');
    const generateContent = mock(() =>
      Promise.resolve({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: 'abc', mimeType: 'image/png' } }],
            },
          },
        ],
      })
    );
    (adapter as any).client = { models: { generateContent } };

    await adapter.generate({ prompt: 'a cat', aspectRatio: '4:3', resolution: '1K' });

    const callArgs = generateContent.mock.calls[0][0];
    expect(callArgs.config.imageConfig).toEqual({ aspectRatio: '4:3', imageSize: '1K' });
  });

  it('omits imageConfig when aspectRatio is not provided', async () => {
    const adapter = new GeminiImageAdapter('fake-key');
    const generateContent = mock(() =>
      Promise.resolve({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: 'abc', mimeType: 'image/png' } }],
            },
          },
        ],
      })
    );
    (adapter as any).client = { models: { generateContent } };

    await adapter.generate({ prompt: 'a cat' });

    const callArgs = generateContent.mock.calls[0][0];
    expect(callArgs.config.imageConfig).toBeUndefined();
  });
});

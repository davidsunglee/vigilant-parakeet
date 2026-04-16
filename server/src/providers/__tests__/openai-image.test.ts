import { describe, expect, it, mock } from 'bun:test';
import { OpenAiImageAdapter, mapAspectRatioToSize } from '../openai-image';

describe('mapAspectRatioToSize', () => {
  describe('gpt-image-1', () => {
    it('maps 1:1 to 1024x1024', () => {
      expect(mapAspectRatioToSize('1:1', 'gpt-image-1')).toBe('1024x1024');
    });

    it('maps 4:3 to 1536x1024', () => {
      expect(mapAspectRatioToSize('4:3', 'gpt-image-1')).toBe('1536x1024');
    });

    it('maps 3:4 to 1024x1536', () => {
      expect(mapAspectRatioToSize('3:4', 'gpt-image-1')).toBe('1024x1536');
    });

    it('maps 16:9 to 1536x1024', () => {
      expect(mapAspectRatioToSize('16:9', 'gpt-image-1')).toBe('1536x1024');
    });

    it('maps 9:16 to 1024x1536', () => {
      expect(mapAspectRatioToSize('9:16', 'gpt-image-1')).toBe('1024x1536');
    });

    it('returns auto for undefined aspectRatio', () => {
      expect(mapAspectRatioToSize(undefined, 'gpt-image-1')).toBe('auto');
    });

    it('returns auto for unknown aspectRatio', () => {
      expect(mapAspectRatioToSize('5:7', 'gpt-image-1')).toBe('auto');
    });
  });

  describe('dall-e-3', () => {
    it('maps 1:1 to 1024x1024', () => {
      expect(mapAspectRatioToSize('1:1', 'dall-e-3')).toBe('1024x1024');
    });

    it('maps 16:9 to 1792x1024', () => {
      expect(mapAspectRatioToSize('16:9', 'dall-e-3')).toBe('1792x1024');
    });

    it('maps 9:16 to 1024x1792', () => {
      expect(mapAspectRatioToSize('9:16', 'dall-e-3')).toBe('1024x1792');
    });

    it('maps 4:3 to 1792x1024', () => {
      expect(mapAspectRatioToSize('4:3', 'dall-e-3')).toBe('1792x1024');
    });

    it('returns 1024x1024 for undefined aspectRatio', () => {
      expect(mapAspectRatioToSize(undefined, 'dall-e-3')).toBe('1024x1024');
    });

    it('returns 1024x1024 for unknown aspectRatio', () => {
      expect(mapAspectRatioToSize('5:7', 'dall-e-3')).toBe('1024x1024');
    });
  });
});

describe('OpenAiImageAdapter', () => {
  it('is constructable with an API key', () => {
    const adapter = new OpenAiImageAdapter('fake-key');
    expect(adapter).toBeDefined();
  });

  it('throws on empty API key', () => {
    expect(() => new OpenAiImageAdapter('')).toThrow();
  });

  it('uses request.model when provided', async () => {
    const adapter = new OpenAiImageAdapter('fake-key');
    const generate = mock(() =>
      Promise.resolve({
        data: [{ b64_json: 'abc123' }],
      })
    );
    (adapter as any).client = { images: { generate } };

    await adapter.generate({ prompt: 'a cat', model: 'dall-e-3' });

    const callArgs = generate.mock.calls[0][0];
    expect(callArgs.model).toBe('dall-e-3');
  });

  it('falls back to default model gpt-image-1 when request.model is absent', async () => {
    const adapter = new OpenAiImageAdapter('fake-key');
    const generate = mock(() =>
      Promise.resolve({
        data: [{ b64_json: 'abc123' }],
      })
    );
    (adapter as any).client = { images: { generate } };

    await adapter.generate({ prompt: 'a cat' });

    const callArgs = generate.mock.calls[0][0];
    expect(callArgs.model).toBe('gpt-image-1');
  });

  it('passes mapped size based on aspectRatio', async () => {
    const adapter = new OpenAiImageAdapter('fake-key');
    const generate = mock(() =>
      Promise.resolve({
        data: [{ b64_json: 'abc123' }],
      })
    );
    (adapter as any).client = { images: { generate } };

    await adapter.generate({ prompt: 'a cat', aspectRatio: '4:3' });

    const callArgs = generate.mock.calls[0][0];
    expect(callArgs.size).toBe('1536x1024');
  });

  it('uses auto size when no aspectRatio is provided', async () => {
    const adapter = new OpenAiImageAdapter('fake-key');
    const generate = mock(() =>
      Promise.resolve({
        data: [{ b64_json: 'abc123' }],
      })
    );
    (adapter as any).client = { images: { generate } };

    await adapter.generate({ prompt: 'a cat' });

    const callArgs = generate.mock.calls[0][0];
    expect(callArgs.size).toBe('auto');
  });

  it('returns correct data URI from b64_json response', async () => {
    const adapter = new OpenAiImageAdapter('fake-key');
    const generate = mock(() =>
      Promise.resolve({
        data: [{ b64_json: 'abc123' }],
      })
    );
    (adapter as any).client = { images: { generate } };

    const result = await adapter.generate({ prompt: 'a cat' });
    expect(result.imageDataUri).toBe('data:image/png;base64,abc123');
  });

  it('throws when response has no data', async () => {
    const adapter = new OpenAiImageAdapter('fake-key');
    const generate = mock(() =>
      Promise.resolve({ data: [] })
    );
    (adapter as any).client = { images: { generate } };

    await expect(adapter.generate({ prompt: 'a cat' })).rejects.toThrow(
      'No image data in OpenAI response'
    );
  });

  it('throws when response data has no b64_json', async () => {
    const adapter = new OpenAiImageAdapter('fake-key');
    const generate = mock(() =>
      Promise.resolve({
        data: [{ url: 'https://example.com/image.png' }],
      })
    );
    (adapter as any).client = { images: { generate } };

    await expect(adapter.generate({ prompt: 'a cat' })).rejects.toThrow(
      'No image data in OpenAI response'
    );
  });

  it('uses output_format png for gpt-image-1 (default)', async () => {
    const adapter = new OpenAiImageAdapter('fake-key');
    const generate = mock(() =>
      Promise.resolve({
        data: [{ b64_json: 'abc123' }],
      })
    );
    (adapter as any).client = { images: { generate } };

    await adapter.generate({ prompt: 'a cat' });

    const callArgs = generate.mock.calls[0][0];
    expect(callArgs.output_format).toBe('png');
    expect(callArgs.response_format).toBeUndefined();
  });

  it('uses response_format b64_json for dall-e-3', async () => {
    const adapter = new OpenAiImageAdapter('fake-key');
    const generate = mock(() =>
      Promise.resolve({
        data: [{ b64_json: 'abc123' }],
      })
    );
    (adapter as any).client = { images: { generate } };

    await adapter.generate({ prompt: 'a cat', model: 'dall-e-3' });

    const callArgs = generate.mock.calls[0][0];
    expect(callArgs.response_format).toBe('b64_json');
    expect(callArgs.output_format).toBeUndefined();
  });
});

import { describe, expect, it } from 'bun:test';
import { GeminiImageAdapter } from '../gemini-image';

describe('GeminiImageAdapter', () => {
  it('is constructable with an API key', () => {
    const adapter = new GeminiImageAdapter('fake-key');
    expect(adapter).toBeDefined();
  });

  it('throws on empty API key', () => {
    expect(() => new GeminiImageAdapter('')).toThrow();
  });
});

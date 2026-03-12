import { describe, expect, it } from 'bun:test';
import { AnthropicLlmAdapter } from '../anthropic-llm';

describe('AnthropicLlmAdapter', () => {
  it('is constructable with an API key', () => {
    const adapter = new AnthropicLlmAdapter('fake-key');
    expect(adapter).toBeDefined();
  });

  it('throws on empty API key', () => {
    expect(() => new AnthropicLlmAdapter('')).toThrow();
  });
});

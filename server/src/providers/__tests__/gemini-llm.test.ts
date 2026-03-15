import { describe, expect, it, mock } from 'bun:test';
import { GeminiLlmAdapter, convertJsonSchemaToGemini } from '../gemini-llm';
import type { LlmRequest } from '../types';

describe('convertJsonSchemaToGemini', () => {
  it('converts a flat object schema', () => {
    const input = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'string' },
      },
      required: ['name', 'age'],
    };
    const result = convertJsonSchemaToGemini(input);
    expect(result.type).toBe('OBJECT');
    expect(result.properties.name.type).toBe('STRING');
    expect(result.properties.age.type).toBe('STRING');
    expect(result.required).toEqual(['name', 'age']);
  });

  it('converts an array schema with object items', () => {
    const input = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          active: { type: 'boolean' },
        },
        required: ['label'],
      },
    };
    const result = convertJsonSchemaToGemini(input);
    expect(result.type).toBe('ARRAY');
    expect(result.items.type).toBe('OBJECT');
    expect(result.items.properties.label.type).toBe('STRING');
    expect(result.items.properties.active.type).toBe('BOOLEAN');
  });

  it('converts nested object schema', () => {
    const input = {
      type: 'object',
      properties: {
        page: {
          type: 'object',
          properties: {
            bodyText: { type: 'string' },
          },
          required: ['bodyText'],
        },
      },
      required: ['page'],
    };
    const result = convertJsonSchemaToGemini(input);
    expect(result.properties.page.type).toBe('OBJECT');
    expect(result.properties.page.properties.bodyText.type).toBe('STRING');
  });

  it('preserves description field', () => {
    const input = {
      type: 'string',
      description: 'A fun fact',
    };
    const result = convertJsonSchemaToGemini(input);
    expect(result.type).toBe('STRING');
    expect(result.description).toBe('A fun fact');
  });

  it('preserves enum field', () => {
    const input = {
      type: 'string',
      enum: ['red', 'green', 'blue'],
    };
    const result = convertJsonSchemaToGemini(input);
    expect(result.type).toBe('STRING');
    expect(result.enum).toEqual(['red', 'green', 'blue']);
  });

  it('falls back to raw type string for unknown types', () => {
    const input = {
      type: 'customUnknownType',
    };
    const result = convertJsonSchemaToGemini(input);
    expect(result.type).toBe('customUnknownType');
  });
});

describe('GeminiLlmAdapter', () => {
  it('is constructable with an API key', () => {
    const adapter = new GeminiLlmAdapter('fake-key');
    expect(adapter).toBeDefined();
  });

  it('throws on empty API key', () => {
    expect(() => new GeminiLlmAdapter('')).toThrow();
  });

  describe('generate()', () => {
    function buildAdapter(generateContentResult: unknown) {
      const adapter = new GeminiLlmAdapter('fake-key');
      const generateContent = mock(() => Promise.resolve(generateContentResult));
      (adapter as any).client = { models: { generateContent } };
      return { adapter, generateContent };
    }

    const baseRequest: LlmRequest = {
      prompt: 'Tell me a story',
      responseSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    };

    it('returns parsed JSON on happy path', async () => {
      const { adapter } = buildAdapter({ text: '{"name":"Alice"}' });
      const result = await adapter.generate(baseRequest);
      expect(result).toEqual({ data: { name: 'Alice' } });
    });

    it('uses DEFAULT_MODEL when request.model is not provided', async () => {
      const { adapter, generateContent } = buildAdapter({ text: '{"ok":true}' });
      await adapter.generate(baseRequest);
      const callArgs = generateContent.mock.calls[0][0];
      expect(callArgs.model).toBe('gemini-3-flash-preview');
    });

    it('uses request.model when provided', async () => {
      const { adapter, generateContent } = buildAdapter({ text: '{"ok":true}' });
      await adapter.generate({ ...baseRequest, model: 'gemini-2.0-flash' });
      const callArgs = generateContent.mock.calls[0][0];
      expect(callArgs.model).toBe('gemini-2.0-flash');
    });

    it('passes systemPrompt as systemInstruction when provided', async () => {
      const { adapter, generateContent } = buildAdapter({ text: '{"ok":true}' });
      await adapter.generate({ ...baseRequest, systemPrompt: 'Be creative' });
      const callArgs = generateContent.mock.calls[0][0];
      expect(callArgs.config.systemInstruction).toBe('Be creative');
    });

    it('sets systemInstruction to undefined when systemPrompt is not provided', async () => {
      const { adapter, generateContent } = buildAdapter({ text: '{"ok":true}' });
      await adapter.generate(baseRequest);
      const callArgs = generateContent.mock.calls[0][0];
      expect(callArgs.config.systemInstruction).toBeUndefined();
    });

    it('converts responseSchema using convertJsonSchemaToGemini', async () => {
      const { adapter, generateContent } = buildAdapter({ text: '{"items":[]}' });
      const schema = { type: 'array', items: { type: 'string' } };
      await adapter.generate({ ...baseRequest, responseSchema: schema });
      const callArgs = generateContent.mock.calls[0][0];
      expect(callArgs.config.responseSchema.type).toBe('ARRAY');
      expect(callArgs.config.responseSchema.items.type).toBe('STRING');
    });

    it('throws safety filter error when text is empty', async () => {
      const { adapter } = buildAdapter({ text: '' });
      await expect(adapter.generate(baseRequest)).rejects.toThrow(
        'Gemini returned no text (content may have been blocked by safety filters)'
      );
    });

    it('throws when response text is not valid JSON', async () => {
      const { adapter } = buildAdapter({ text: 'not-json{{{' });
      await expect(adapter.generate(baseRequest)).rejects.toThrow();
    });
  });
});

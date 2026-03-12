import { describe, expect, it } from 'bun:test';
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
});

describe('GeminiLlmAdapter', () => {
  it('is constructable with an API key', () => {
    const adapter = new GeminiLlmAdapter('fake-key');
    expect(adapter).toBeDefined();
  });

  it('throws on empty API key', () => {
    expect(() => new GeminiLlmAdapter('')).toThrow();
  });
});

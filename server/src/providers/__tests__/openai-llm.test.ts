import { describe, expect, it, mock } from 'bun:test';
import { OpenAiLlmAdapter, prepareSchemaForOpenAI } from '../openai-llm';
import type { LlmRequest, JsonSchema } from '../types';

describe('prepareSchemaForOpenAI', () => {
  it('adds additionalProperties: false to object schemas', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { name: { type: 'string' } },
    };
    const result = prepareSchemaForOpenAI(schema);
    expect(result.additionalProperties).toBe(false);
  });

  it('sets required to all property keys', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'integer' } },
    };
    const result = prepareSchemaForOpenAI(schema);
    expect(result.required).toEqual(['name', 'age']);
  });

  it('overrides partial required with all property keys', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'integer' } },
      required: ['name'],
    };
    const result = prepareSchemaForOpenAI(schema);
    expect(result.required).toEqual(['name', 'age']);
  });

  it('recurses into nested objects', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: { city: { type: 'string' } },
        },
      },
    };
    const result = prepareSchemaForOpenAI(schema);
    expect(result.properties!.address.additionalProperties).toBe(false);
    expect(result.properties!.address.required).toEqual(['city']);
  });

  it('recurses into array items that are objects', () => {
    const schema: JsonSchema = {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' } },
      },
    };
    const result = prepareSchemaForOpenAI(schema);
    expect(result.items!.additionalProperties).toBe(false);
    expect(result.items!.required).toEqual(['id']);
  });

  it('preserves description and enum fields', () => {
    const schema: JsonSchema = {
      type: 'string',
      description: 'A color',
      enum: ['red', 'blue'],
    };
    const result = prepareSchemaForOpenAI(schema);
    expect(result.description).toBe('A color');
    expect(result.enum).toEqual(['red', 'blue']);
  });

  it('does not mutate the original schema', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { name: { type: 'string' } },
    };
    const original = JSON.parse(JSON.stringify(schema));
    prepareSchemaForOpenAI(schema);
    expect(schema).toEqual(original);
  });

  it('handles non-object root schemas', () => {
    const schema: JsonSchema = { type: 'string' };
    const result = prepareSchemaForOpenAI(schema);
    expect(result).toEqual({ type: 'string' });
    expect(result.additionalProperties).toBeUndefined();
  });
});

describe('OpenAiLlmAdapter', () => {
  it('is constructable with an API key', () => {
    const adapter = new OpenAiLlmAdapter('fake-key');
    expect(adapter).toBeDefined();
  });

  it('throws on empty API key', () => {
    expect(() => new OpenAiLlmAdapter('')).toThrow();
  });

  describe('generate()', () => {
    function buildAdapter(content: string | null, refusal?: string | null) {
      const adapter = new OpenAiLlmAdapter('fake-key');
      const create = mock(() =>
        Promise.resolve({
          choices: [
            {
              message: { content, refusal: refusal ?? null },
              finish_reason: 'stop',
            },
          ],
        })
      );
      (adapter as any).client = { chat: { completions: { create } } };
      return { adapter, create };
    }

    const objectSchema: LlmRequest = {
      prompt: 'Tell me a story',
      responseSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    };

    it('returns parsed JSON on happy path', async () => {
      const { adapter } = buildAdapter(JSON.stringify({ name: 'Alice' }));
      const result = await adapter.generate(objectSchema);
      expect(result).toEqual({ data: { name: 'Alice' } });
    });

    it('uses default model gpt-5.4 when request.model is not provided', async () => {
      const { adapter, create } = buildAdapter(JSON.stringify({ name: 'A' }));
      await adapter.generate(objectSchema);
      const callArgs = create.mock.calls[0][0];
      expect(callArgs.model).toBe('gpt-5.4');
    });

    it('uses request.model when provided', async () => {
      const { adapter, create } = buildAdapter(JSON.stringify({ name: 'A' }));
      await adapter.generate({ ...objectSchema, model: 'gpt-4.1-mini' });
      const callArgs = create.mock.calls[0][0];
      expect(callArgs.model).toBe('gpt-4.1-mini');
    });

    it('passes systemPrompt as a system message', async () => {
      const { adapter, create } = buildAdapter(JSON.stringify({ name: 'A' }));
      await adapter.generate({ ...objectSchema, systemPrompt: 'Be concise' });
      const callArgs = create.mock.calls[0][0];
      expect(callArgs.messages[0]).toEqual({ role: 'system', content: 'Be concise' });
      expect(callArgs.messages[1]).toEqual({ role: 'user', content: 'Tell me a story' });
    });

    it('omits system message when systemPrompt is not provided', async () => {
      const { adapter, create } = buildAdapter(JSON.stringify({ name: 'A' }));
      await adapter.generate(objectSchema);
      const callArgs = create.mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(1);
      expect(callArgs.messages[0].role).toBe('user');
    });

    it('uses json_schema response_format with strict mode', async () => {
      const { adapter, create } = buildAdapter(JSON.stringify({ name: 'A' }));
      await adapter.generate(objectSchema);
      const callArgs = create.mock.calls[0][0];
      expect(callArgs.response_format.type).toBe('json_schema');
      expect(callArgs.response_format.json_schema.strict).toBe(true);
      expect(callArgs.response_format.json_schema.name).toBe('structured_output');
    });

    it('applies prepareSchemaForOpenAI to the response schema', async () => {
      const { adapter, create } = buildAdapter(JSON.stringify({ name: 'A' }));
      await adapter.generate(objectSchema);
      const callArgs = create.mock.calls[0][0];
      const schema = callArgs.response_format.json_schema.schema;
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required).toEqual(['name']);
    });

    it('wraps non-object schemas in an object envelope', async () => {
      const arraySchema: LlmRequest = {
        prompt: 'List items',
        responseSchema: { type: 'array', items: { type: 'string' } },
      };
      const { adapter, create } = buildAdapter(JSON.stringify({ result: ['a', 'b'] }));
      await adapter.generate(arraySchema);
      const callArgs = create.mock.calls[0][0];
      const schema = callArgs.response_format.json_schema.schema;
      expect(schema.type).toBe('object');
      expect(schema.properties.result).toBeDefined();
      expect(schema.properties.result.type).toBe('array');
    });

    it('unwraps wrapped schema response', async () => {
      const arraySchema: LlmRequest = {
        prompt: 'List items',
        responseSchema: { type: 'array', items: { type: 'string' } },
      };
      const { adapter } = buildAdapter(JSON.stringify({ result: ['x', 'y'] }));
      const result = await adapter.generate(arraySchema);
      expect(result).toEqual({ data: ['x', 'y'] });
    });

    it('does not wrap object schemas', async () => {
      const { adapter, create } = buildAdapter(JSON.stringify({ name: 'A' }));
      await adapter.generate(objectSchema);
      const callArgs = create.mock.calls[0][0];
      const schema = callArgs.response_format.json_schema.schema;
      expect(schema.properties.result).toBeUndefined();
    });

    it('throws when response has no choices', async () => {
      const adapter = new OpenAiLlmAdapter('fake-key');
      const create = mock(() => Promise.resolve({ choices: [] }));
      (adapter as any).client = { chat: { completions: { create } } };

      await expect(adapter.generate(objectSchema)).rejects.toThrow(
        'OpenAI response contained no choices'
      );
    });

    it('throws when response content is null', async () => {
      const { adapter } = buildAdapter(null);
      await expect(adapter.generate(objectSchema)).rejects.toThrow(
        'OpenAI response content is empty'
      );
    });

    it('throws when response contains a refusal', async () => {
      const { adapter } = buildAdapter(null, 'I cannot help with that');
      await expect(adapter.generate(objectSchema)).rejects.toThrow(
        'OpenAI refused the request: I cannot help with that'
      );
    });
  });
});

import { describe, expect, it, mock } from 'bun:test';
import { AnthropicLlmAdapter } from '../anthropic-llm';
import type { LlmRequest } from '../types';

describe('AnthropicLlmAdapter', () => {
  it('is constructable with an API key', () => {
    const adapter = new AnthropicLlmAdapter('fake-key');
    expect(adapter).toBeDefined();
  });

  it('throws on empty API key', () => {
    expect(() => new AnthropicLlmAdapter('')).toThrow();
  });

  describe('generate()', () => {
    function buildAdapter(responseContent: unknown[]) {
      const adapter = new AnthropicLlmAdapter('fake-key');
      const create = mock(() => Promise.resolve({ content: responseContent }));
      (adapter as any).client = { messages: { create } };
      return { adapter, create };
    }

    const objectSchema: LlmRequest = {
      prompt: 'Tell me a story',
      responseSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    };

    const arraySchema: LlmRequest = {
      prompt: 'List items',
      responseSchema: { type: 'array', items: { type: 'string' } },
    };

    it('returns tool_use input for object schema (happy path)', async () => {
      const { adapter } = buildAdapter([
        { type: 'tool_use', id: 't1', name: 'structured_output', input: { name: 'Alice' } },
      ]);
      const result = await adapter.generate(objectSchema);
      expect(result).toEqual({ data: { name: 'Alice' } });
    });

    it('wraps non-object schemas in an object envelope', async () => {
      const { adapter, create } = buildAdapter([
        { type: 'tool_use', id: 't1', name: 'structured_output', input: { result: ['a', 'b'] } },
      ]);
      await adapter.generate(arraySchema);
      const callArgs = create.mock.calls[0][0];
      const inputSchema = callArgs.tools[0].input_schema;
      expect(inputSchema.type).toBe('object');
      expect(inputSchema.properties.result).toEqual({ type: 'array', items: { type: 'string' } });
      expect(inputSchema.required).toEqual(['result']);
    });

    it('does not wrap object schemas', async () => {
      const { adapter, create } = buildAdapter([
        { type: 'tool_use', id: 't1', name: 'structured_output', input: { name: 'Alice' } },
      ]);
      await adapter.generate(objectSchema);
      const callArgs = create.mock.calls[0][0];
      const inputSchema = callArgs.tools[0].input_schema;
      expect(inputSchema.type).toBe('object');
      expect(inputSchema.properties.name).toEqual({ type: 'string' });
      expect(inputSchema.properties.result).toBeUndefined();
    });

    it('unwraps wrapped schema response (returns input.result)', async () => {
      const { adapter } = buildAdapter([
        { type: 'tool_use', id: 't1', name: 'structured_output', input: { result: ['x', 'y'] } },
      ]);
      const result = await adapter.generate(arraySchema);
      expect(result).toEqual({ data: ['x', 'y'] });
    });

    it('uses DEFAULT_MODEL when request.model is not provided', async () => {
      const { adapter, create } = buildAdapter([
        { type: 'tool_use', id: 't1', name: 'structured_output', input: { name: 'A' } },
      ]);
      await adapter.generate(objectSchema);
      const callArgs = create.mock.calls[0][0];
      expect(callArgs.model).toBe('claude-opus-4-6');
    });

    it('uses request.model when provided', async () => {
      const { adapter, create } = buildAdapter([
        { type: 'tool_use', id: 't1', name: 'structured_output', input: { name: 'A' } },
      ]);
      await adapter.generate({ ...objectSchema, model: 'claude-sonnet-4-20250514' });
      const callArgs = create.mock.calls[0][0];
      expect(callArgs.model).toBe('claude-sonnet-4-20250514');
    });

    it('passes systemPrompt as system parameter', async () => {
      const { adapter, create } = buildAdapter([
        { type: 'tool_use', id: 't1', name: 'structured_output', input: { name: 'A' } },
      ]);
      await adapter.generate({ ...objectSchema, systemPrompt: 'Be concise' });
      const callArgs = create.mock.calls[0][0];
      expect(callArgs.system).toBe('Be concise');
    });

    it('forces tool_choice to structured_output tool', async () => {
      const { adapter, create } = buildAdapter([
        { type: 'tool_use', id: 't1', name: 'structured_output', input: { name: 'A' } },
      ]);
      await adapter.generate(objectSchema);
      const callArgs = create.mock.calls[0][0];
      expect(callArgs.tool_choice).toEqual({ type: 'tool', name: 'structured_output' });
    });

    it('throws error when no tool_use block is present', async () => {
      const { adapter } = buildAdapter([
        { type: 'text', text: 'I cannot do that' },
      ]);
      await expect(adapter.generate(objectSchema)).rejects.toThrow(
        'Anthropic response did not contain a tool_use block'
      );
    });

    it('appends tool call instruction to the prompt', async () => {
      const { adapter, create } = buildAdapter([
        { type: 'tool_use', id: 't1', name: 'structured_output', input: { name: 'A' } },
      ]);
      await adapter.generate(objectSchema);
      const callArgs = create.mock.calls[0][0];
      const userMessage = callArgs.messages[0].content;
      expect(userMessage).toContain('You MUST respond by calling the "structured_output" tool');
    });
  });
});

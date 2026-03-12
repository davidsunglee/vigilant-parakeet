import Anthropic from '@anthropic-ai/sdk';
import type { ILlmProvider, LlmRequest, LlmResponse } from './types';

const DEFAULT_MODEL = 'claude-opus-4-6';
const TOOL_NAME = 'structured_output';

export class AnthropicLlmAdapter implements ILlmProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('Anthropic API key is required');
    this.client = new Anthropic({ apiKey });
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const model = request.model ?? DEFAULT_MODEL;

    // Anthropic requires input_schema to be type: 'object' at root.
    // Wrap non-object schemas (e.g. arrays) in an object envelope.
    const needsWrapping = request.responseSchema.type !== 'object';
    const inputSchema = needsWrapping
      ? { type: 'object', properties: { result: request.responseSchema }, required: ['result'] }
      : request.responseSchema;

    const response = await this.client.messages.create({
      model,
      max_tokens: 4096,
      system: request.systemPrompt ?? '',
      messages: [
        {
          role: 'user',
          content: `${request.prompt}\n\nYou MUST respond by calling the "${TOOL_NAME}" tool with the requested data. Do not include any other text.`,
        },
      ],
      tools: [
        {
          name: TOOL_NAME,
          description: 'Return structured data matching the required schema.',
          input_schema: inputSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: TOOL_NAME },
    });

    const toolBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (!toolBlock) {
      throw new Error('Anthropic response did not contain a tool_use block');
    }

    const input = toolBlock.input as Record<string, unknown>;
    // Unwrap the envelope if we wrapped the schema
    return { data: needsWrapping ? (input.result as Record<string, unknown>) : input };
  }
}

import OpenAI from 'openai';
import type { ILlmProvider, LlmRequest, LlmResponse, JsonSchema } from './types';

const DEFAULT_MODEL = 'gpt-5.4';
const SCHEMA_NAME = 'structured_output';

/**
 * Recursively prepare a JSON Schema for OpenAI strict mode.
 * Adds `additionalProperties: false` and sets `required` to all property keys
 * on every object node (OpenAI structured output requirement).
 */
export function prepareSchemaForOpenAI(schema: JsonSchema): JsonSchema {
  const result: JsonSchema = { type: schema.type };

  if (schema.description) {
    result.description = schema.description;
  }

  if (schema.enum) {
    result.enum = schema.enum;
  }

  if (schema.properties) {
    result.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      result.properties[key] = prepareSchemaForOpenAI(value);
    }
    result.required = Object.keys(schema.properties);
    result.additionalProperties = false;
  }

  if (schema.items) {
    result.items = prepareSchemaForOpenAI(schema.items);
  }

  return result;
}

export class OpenAiLlmAdapter implements ILlmProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('OpenAI API key is required');
    this.client = new OpenAI({ apiKey });
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const model = request.model ?? DEFAULT_MODEL;

    // OpenAI requires root schema to be type: 'object'.
    // Wrap non-object schemas (e.g. arrays) in an object envelope.
    const needsWrapping = request.responseSchema.type !== 'object';
    const rawSchema = needsWrapping
      ? { type: 'object', properties: { result: request.responseSchema }, required: ['result'] }
      : request.responseSchema;
    const preparedSchema = prepareSchemaForOpenAI(rawSchema);

    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    messages.push({ role: 'user', content: request.prompt });

    const response = await this.client.chat.completions.create({
      model,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: SCHEMA_NAME,
          strict: true,
          schema: preparedSchema,
        },
      },
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new Error('OpenAI response contained no choices');
    }

    if (choice.message.refusal) {
      throw new Error(`OpenAI refused the request: ${choice.message.refusal}`);
    }

    const content = choice.message.content;
    if (!content) {
      throw new Error('OpenAI response content is empty');
    }

    const data = JSON.parse(content);
    // Unwrap the envelope if we wrapped the schema
    return { data: needsWrapping ? (data.result as Record<string, unknown>) : data };
  }
}

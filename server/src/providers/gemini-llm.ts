import { GoogleGenAI, Type } from '@google/genai';
import type { ILlmProvider, LlmRequest, LlmResponse, JsonSchema } from './types';

const TYPE_MAP: Record<string, string> = {
  object: Type.OBJECT,
  string: Type.STRING,
  array: Type.ARRAY,
  boolean: Type.BOOLEAN,
  number: Type.NUMBER,
  integer: Type.INTEGER,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convertJsonSchemaToGemini(schema: JsonSchema): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = {
    type: TYPE_MAP[schema.type] ?? schema.type,
  };

  if (schema.description) {
    result.description = schema.description;
  }

  if (schema.properties) {
    result.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      result.properties[key] = convertJsonSchemaToGemini(value);
    }
  }

  if (schema.items) {
    result.items = convertJsonSchemaToGemini(schema.items);
  }

  if (schema.required) {
    result.required = schema.required;
  }

  if (schema.enum) {
    result.enum = schema.enum;
  }

  return result;
}

const DEFAULT_MODEL = 'gemini-3-flash-preview';

export class GeminiLlmAdapter implements ILlmProvider {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('Gemini API key is required');
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const model = request.model ?? DEFAULT_MODEL;
    const geminiSchema = convertJsonSchemaToGemini(request.responseSchema);

    const response = await this.client.models.generateContent({
      model,
      contents: request.prompt,
      config: {
        systemInstruction: request.systemPrompt || undefined,
        responseMimeType: 'application/json',
        responseSchema: geminiSchema,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('Gemini returned no text (content may have been blocked by safety filters)');
    }
    const data = JSON.parse(text);
    return { data };
  }
}

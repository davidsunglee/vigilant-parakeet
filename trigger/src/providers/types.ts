export interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  description?: string;
  enum?: string[];
  additionalProperties?: boolean;
  // Allow extra keys so the schema is structurally assignable to the
  // `Record<string, unknown>` shapes the OpenAI/Anthropic SDKs expect.
  [key: string]: unknown;
}

export interface LlmRequest {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  responseSchema: JsonSchema;
  userId?: string;
}

export interface LlmResponse {
  // Object schemas return a keyed object; array schemas return an array. Use
  // `unknown` so both are representable without an unsafe cast at the boundary.
  data: unknown;
}

export interface ImageRequest {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  userId?: string;
  quality?: 'low' | 'medium' | 'high';
}

export interface ImageResponse {
  imageDataUri: string;
}

export interface ILlmProvider {
  generate(request: LlmRequest): Promise<LlmResponse>;
}

export interface IImageProvider {
  generate(request: ImageRequest): Promise<ImageResponse>;
}

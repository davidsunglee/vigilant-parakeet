export interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  description?: string;
  enum?: string[];
}

export interface LlmRequest {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  responseSchema: JsonSchema;
}

export interface LlmResponse {
  data: Record<string, unknown>;
}

export interface ImageRequest {
  prompt: string;
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

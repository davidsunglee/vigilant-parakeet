import type { ILlmProvider, IImageProvider } from './providers/types';

export class ProviderRegistry {
  private llmProviders = new Map<string, ILlmProvider>();
  private imageProviders = new Map<string, IImageProvider>();

  registerLlm(name: string, provider: ILlmProvider): void {
    this.llmProviders.set(name, provider);
  }

  registerImage(name: string, provider: IImageProvider): void {
    this.imageProviders.set(name, provider);
  }

  getLlm(name: string): ILlmProvider | undefined {
    return this.llmProviders.get(name);
  }

  getImage(name: string): IImageProvider | undefined {
    return this.imageProviders.get(name);
  }

  listLlmProviders(): string[] {
    return [...this.llmProviders.keys()];
  }

  listImageProviders(): string[] {
    return [...this.imageProviders.keys()];
  }
}

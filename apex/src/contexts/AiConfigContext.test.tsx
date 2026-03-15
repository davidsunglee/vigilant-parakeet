import { render, screen, waitFor, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { AiConfigProvider, useAiConfig } from './AiConfigContext';

// --- Helpers ---

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AiConfigProvider>{children}</AiConfigProvider>
);

beforeEach(() => {
  vi.restoreAllMocks();
});

// --- Tests ---

describe('AiConfigContext', () => {
  describe('default config values', () => {
    it('has llmProvider defaulting to "anthropic"', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ llm: ['anthropic'], image: ['gemini'] })),
      );

      const { result } = renderHook(() => useAiConfig(), { wrapper });
      expect(result.current.config.llmProvider).toBe('anthropic');
    });

    it('has imageProvider defaulting to "gemini"', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ llm: ['anthropic'], image: ['gemini'] })),
      );

      const { result } = renderHook(() => useAiConfig(), { wrapper });
      expect(result.current.config.imageProvider).toBe('gemini');
    });
  });

  describe('fetching providers', () => {
    it('fetches /api/providers on mount', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ llm: ['anthropic'], image: ['gemini'] })),
      );

      renderHook(() => useAiConfig(), { wrapper });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith('/api/providers');
      });
    });

    it('sets available providers from fetch response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ llm: ['anthropic', 'openai'], image: ['gemini', 'dall-e'] })),
      );

      const { result } = renderHook(() => useAiConfig(), { wrapper });

      await waitFor(() => {
        expect(result.current.availableProviders.llm).toEqual(['anthropic', 'openai']);
        expect(result.current.availableProviders.image).toEqual(['gemini', 'dall-e']);
      });
    });

    it('keeps default provider when it is available in response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ llm: ['openai', 'anthropic'], image: ['dall-e', 'gemini'] })),
      );

      const { result } = renderHook(() => useAiConfig(), { wrapper });

      await waitFor(() => {
        expect(result.current.availableProviders.llm.length).toBeGreaterThan(0);
      });

      // Default "anthropic" is in the list so it stays
      expect(result.current.config.llmProvider).toBe('anthropic');
      // Default "gemini" is in the list so it stays
      expect(result.current.config.imageProvider).toBe('gemini');
    });

    it('falls back to first available LLM provider when default is unavailable', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ llm: ['openai', 'cohere'], image: ['gemini'] })),
      );

      const { result } = renderHook(() => useAiConfig(), { wrapper });

      await waitFor(() => {
        expect(result.current.config.llmProvider).toBe('openai');
      });
    });

    it('falls back to first available image provider when default is unavailable', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ llm: ['anthropic'], image: ['dall-e', 'stable-diffusion'] })),
      );

      const { result } = renderHook(() => useAiConfig(), { wrapper });

      await waitFor(() => {
        expect(result.current.config.imageProvider).toBe('dall-e');
      });
    });

    it('logs error and leaves providers empty on fetch failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useAiConfig(), { wrapper });

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to fetch providers:', expect.any(Error));
      });

      expect(result.current.availableProviders.llm).toEqual([]);
      expect(result.current.availableProviders.image).toEqual([]);
    });
  });

  describe('setConfig', () => {
    it('updates config when setConfig is called', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ llm: ['anthropic'], image: ['gemini'] })),
      );

      const { result } = renderHook(() => useAiConfig(), { wrapper });

      await waitFor(() => {
        expect(result.current.availableProviders.llm.length).toBeGreaterThan(0);
      });

      act(() => {
        result.current.setConfig({
          llmProvider: 'openai',
          imageProvider: 'dall-e',
          llmModel: 'gpt-4',
        });
      });

      expect(result.current.config.llmProvider).toBe('openai');
      expect(result.current.config.imageProvider).toBe('dall-e');
      expect(result.current.config.llmModel).toBe('gpt-4');
    });
  });

  describe('useAiConfig hook', () => {
    it('returns an object with config, setConfig, and availableProviders', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ llm: [], image: [] })),
      );

      const { result } = renderHook(() => useAiConfig(), { wrapper });

      expect(result.current).toHaveProperty('config');
      expect(result.current).toHaveProperty('setConfig');
      expect(result.current).toHaveProperty('availableProviders');
      expect(typeof result.current.setConfig).toBe('function');
    });
  });
});

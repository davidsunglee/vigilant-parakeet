import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export interface AiConfig {
  llmProvider: string;
  llmModel?: string;
  imageProvider: string;
  imageModel?: string;
}

interface AiConfigContextValue {
  config: AiConfig;
  setConfig: (config: AiConfig) => void;
  availableProviders: { llm: string[]; image: string[] };
}

const defaultConfig: AiConfig = {
  llmProvider: 'anthropic',
  imageProvider: 'gemini',
};

const AiConfigContext = createContext<AiConfigContextValue>({
  config: defaultConfig,
  setConfig: () => {},
  availableProviders: { llm: [], image: [] },
});

export function AiConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AiConfig>(defaultConfig);
  const [availableProviders, setAvailableProviders] = useState<{ llm: string[]; image: string[] }>({
    llm: [],
    image: [],
  });

  useEffect(() => {
    fetch('/api/providers')
      .then((res) => res.json())
      .then((data) => {
        setAvailableProviders(data);
        // Update config to use first available provider if current default isn't available
        setConfig((prev) => ({
          ...prev,
          llmProvider: data.llm?.includes(prev.llmProvider) ? prev.llmProvider : (data.llm?.[0] ?? prev.llmProvider),
          imageProvider: data.image?.includes(prev.imageProvider) ? prev.imageProvider : (data.image?.[0] ?? prev.imageProvider),
        }));
      })
      .catch((err) => console.error('Failed to fetch providers:', err));
  }, []);

  return (
    <AiConfigContext.Provider value={{ config, setConfig, availableProviders }}>
      {children}
    </AiConfigContext.Provider>
  );
}

export function useAiConfig() {
  return useContext(AiConfigContext);
}

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export interface AiConfig {
  llmProvider: string;
  llmModel?: string;
  imageProvider: string;
}

interface AiConfigContextValue {
  config: AiConfig;
  setConfig: (config: AiConfig) => void;
  availableProviders: { llm: string[]; image: string[] };
}

const defaultConfig: AiConfig = {
  llmProvider: 'gemini',
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
      .then((data) => setAvailableProviders(data))
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

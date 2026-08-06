"use client";

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { AIModel } from '@/lib/types';

export type AIProvider = 'azure-openai' | 'google-ai' | 'openai' | 'anthropic';
export type ModelTag = 'flagship' | 'balanced' | 'cheap' | 'fast' | 'reasoning' | 'legacy';

/**
 * Client-side mirror of the server registry's ModelInfo, minus the secrets —
 * credentials never cross into the browser bundle.
 */
export interface ModelInfo {
  /** Provider-qualified unique id — the value used for selection. */
  key: string;
  /** The id sent to the provider's API; not unique across providers. */
  id: string;
  provider: AIProvider;
  label?: string;
  tags?: ModelTag[];
  inputPerMTok?: number;
  outputPerMTok?: number;
  contextWindow?: number;
  notes?: string;
}

interface AIModelContextType {
  selectedModel: AIModel;
  setSelectedModel: (model: AIModel) => void;
  availableModels: ModelInfo[];
}

const AIModelContext = createContext<AIModelContextType | undefined>(undefined);

const AI_MODEL_STORAGE_KEY = "finwiseAIModel";

function getDefaultModel(models: ModelInfo[]): AIModel {
  if (models.length > 0) return models[0].key;
  return 'gpt-5.4';
}

export function AIModelProvider({ children, availableModels }: { children: ReactNode; availableModels: ModelInfo[] }) {
  const defaultModel = getDefaultModel(availableModels);
  const [selectedModel, setSelectedModel] = useState<AIModel>(defaultModel);
  const { toast } = useToast();

  useEffect(() => {
    try {
      const storedModel = localStorage.getItem(AI_MODEL_STORAGE_KEY);
      if (!storedModel) return;
      // Accept a key, or migrate a bare id persisted before keys existed.
      const match = availableModels.find(m => m.key === storedModel)
        ?? availableModels.find(m => m.id === storedModel);
      if (match) setSelectedModel(match.key);
    } catch (error) {
      console.warn("Could not read AI model from localStorage:", error);
    }
  }, [availableModels]);

  const handleSetSelectedModel = useCallback((model: AIModel) => {
    const match = availableModels.find(m => m.key === model)
      ?? availableModels.find(m => m.id === model);
    if (match) {
      setSelectedModel(match.key);
      try {
        localStorage.setItem(AI_MODEL_STORAGE_KEY, match.key);
        toast({ title: "AI model changed", description: `Now using ${match.label ?? match.id}.` });
      } catch (error) {
        console.warn("Could not save AI model to localStorage:", error);
      }
    } else {
      toast({ title: "Invalid Model", description: "The selected AI model is not supported.", variant: "destructive" });
    }
  }, [availableModels, toast]);

  return (
    <AIModelContext.Provider value={{ selectedModel, setSelectedModel: handleSetSelectedModel, availableModels }}>
      {children}
    </AIModelContext.Provider>
  );
}

export function useAIModel() {
  const context = useContext(AIModelContext);
  if (context === undefined) {
    throw new Error('useAIModel must be used within an AIModelProvider');
  }
  return context;
}

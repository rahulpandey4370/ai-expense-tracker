
"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type AIModel = 'gemini-2.5-flash' | 'gemini-3-flash' | 'gemini-2.5-flash-lite' | 'gemma-3-27b';

interface AIModelContextType {
  selectedModel: AIModel;
  setSelectedModel: (model: AIModel) => void;
  availableModels: AIModel[];
}

const AIModelContext = createContext<AIModelContextType | undefined>(undefined);

const MODEL_STORAGE_KEY = "finwiseSelectedAIModel";
const AVAILABLE_MODELS: AIModel[] = ['gemini-2.5-flash', 'gemini-3-flash', 'gemini-2.5-flash-lite', 'gemma-3-27b'];
const DEFAULT_MODEL: AIModel = 'gemini-2.5-flash';

export function AIModelProvider({ children }: { children: ReactNode }) {
  const [selectedModel, setSelectedModel] = useState<AIModel>(DEFAULT_MODEL);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    try {
      const storedModel = localStorage.getItem(MODEL_STORAGE_KEY) as AIModel;
      if (storedModel && AVAILABLE_MODELS.includes(storedModel)) {
        setSelectedModel(storedModel);
      }
    } catch (error) {
      console.warn("Could not read AI model from localStorage:", error);
    } finally {
        setIsInitialized(true);
    }
  }, []);

  const handleSetSelectedModel = (model: AIModel) => {
    if (AVAILABLE_MODELS.includes(model)) {
        setSelectedModel(model);
        try {
            localStorage.setItem(MODEL_STORAGE_KEY, model);
        } catch (error) {
            console.warn("Could not save AI model to localStorage:", error);
        }
    }
  };

  const value = { selectedModel, setSelectedModel: handleSetSelectedModel, availableModels: AVAILABLE_MODELS };

  return (
    <AIModelContext.Provider value={value}>
      {isInitialized ? children : null}
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

"use client";

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { AIModel } from '@/lib/types';

export interface ModelInfo {
  id: string;
  provider: 'azure-openai' | 'google-ai';
  label?: string;
}

interface AIModelContextType {
  selectedModel: AIModel;
  setSelectedModel: (model: AIModel) => void;
  availableModels: ModelInfo[];
}

const AIModelContext = createContext<AIModelContextType | undefined>(undefined);

const AI_MODEL_STORAGE_KEY = "finwiseAIModel";

function getDefaultModel(models: ModelInfo[]): AIModel {
  if (models.length > 0) return models[0].id;
  return 'gpt-5.4';
}

export function AIModelProvider({ children, availableModels }: { children: ReactNode; availableModels: ModelInfo[] }) {
  const defaultModel = getDefaultModel(availableModels);
  const [selectedModel, setSelectedModel] = useState<AIModel>(defaultModel);
  const { toast } = useToast();

  useEffect(() => {
    try {
      const storedModel = localStorage.getItem(AI_MODEL_STORAGE_KEY);
      if (storedModel && availableModels.some(m => m.id === storedModel)) {
        setSelectedModel(storedModel);
      }
    } catch (error) {
      console.warn("Could not read AI model from localStorage:", error);
    }
  }, [availableModels]);

  const handleSetSelectedModel = useCallback((model: AIModel) => {
    if (availableModels.some(m => m.id === model)) {
      setSelectedModel(model);
      try {
        localStorage.setItem(AI_MODEL_STORAGE_KEY, model);
        toast({ title: "AI Model Changed", description: `Switched to ${model}.` });
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

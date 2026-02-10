"use client";

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { AIModel, modelNames } from '@/lib/types';

interface AIModelContextType {
  selectedModel: AIModel;
  setSelectedModel: (model: AIModel) => void;
  modelNames: readonly AIModel[];
}

const AIModelContext = createContext<AIModelContextType | undefined>(undefined);

const AI_MODEL_STORAGE_KEY = "finwiseAIModel";
const DEFAULT_MODEL: AIModel = 'gemini-3-flash-preview';

export function AIModelProvider({ children }: { children: ReactNode }) {
  const [selectedModel, setSelectedModel] = useState<AIModel>(DEFAULT_MODEL);
  const { toast } = useToast();

  useEffect(() => {
    try {
      const storedModel = localStorage.getItem(AI_MODEL_STORAGE_KEY);
      if (storedModel && modelNames.includes(storedModel as AIModel)) {
        setSelectedModel(storedModel as AIModel);
      }
    } catch (error) {
      console.warn("Could not read AI model from localStorage:", error);
    }
  }, []);

  const handleSetSelectedModel = useCallback((model: AIModel) => {
    if (modelNames.includes(model)) {
      setSelectedModel(model);
      try {
        localStorage.setItem(AI_MODEL_STORAGE_KEY, model);
        toast({ title: "AI Model Changed", description: `Switched to ${model}.` });
      } catch (error) {
        console.warn("Could not save AI model to localStorage:", error);
      }
    } else {
        toast({ title: "Invalid Model", description: "The selected AI model is not supported.", variant: "destructive"});
    }
  }, [toast]);

  return (
    <AIModelContext.Provider value={{ selectedModel, setSelectedModel: handleSetSelectedModel, modelNames }}>
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

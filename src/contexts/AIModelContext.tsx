
"use client";

<<<<<<< HEAD
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type AIModel = 'gemini-2.5-flash' | 'gemini-3-flash' | 'gemini-2.5-flash-lite' | 'gemma-3-27b';
=======
import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { AIModel, modelNames } from '@/lib/types';
>>>>>>> 816848e (Do not make any changes just yet. In this application I want to add the)

interface AIModelContextType {
  selectedModel: AIModel;
  setSelectedModel: (model: AIModel) => void;
<<<<<<< HEAD
  availableModels: AIModel[];
=======
  modelNames: readonly AIModel[];
>>>>>>> 816848e (Do not make any changes just yet. In this application I want to add the)
}

const AIModelContext = createContext<AIModelContextType | undefined>(undefined);

<<<<<<< HEAD
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
=======
const AI_MODEL_STORAGE_KEY = "finwiseAIModel";
const DEFAULT_MODEL: AIModel = 'gemini-1.5-flash-latest';

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
>>>>>>> 816848e (Do not make any changes just yet. In this application I want to add the)
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

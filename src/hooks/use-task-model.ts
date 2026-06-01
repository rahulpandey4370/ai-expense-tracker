"use client";

import { useState, useCallback, useMemo } from "react";
import { useAIModel } from "@/contexts/AIModelContext";

export function useTaskModel(task: string) {
  const { selectedModel: globalModel, availableModels } = useAIModel();
  const storageKey = `finwiseTaskModel:${task}`;

  // useState with initializer so it reads localStorage once on mount.
  // Crucially, setTaskModelState triggers a re-render — useMemo did not.
  const [taskModel, setTaskModelState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });

  const effectiveModel = useMemo(() => {
    if (taskModel && availableModels.some((m) => m.id === taskModel)) {
      return taskModel;
    }
    return globalModel;
  }, [taskModel, globalModel, availableModels]);

  const isOverridden = useMemo(
    () => !!taskModel && availableModels.some((m) => m.id === taskModel),
    [taskModel, availableModels]
  );

  const setTaskModel = useCallback(
    (model: string | null) => {
      try {
        if (model && availableModels.some((m) => m.id === model)) {
          localStorage.setItem(storageKey, model);
          setTaskModelState(model);
        } else {
          localStorage.removeItem(storageKey);
          setTaskModelState(null);
        }
      } catch {
        // ignore storage errors
      }
    },
    [storageKey, availableModels]
  );

  const resetTaskModel = useCallback(() => {
    setTaskModel(null);
  }, [setTaskModel]);

  return { model: effectiveModel, setTaskModel, resetTaskModel, isOverridden };
}

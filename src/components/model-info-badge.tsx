'use client';

import { Badge } from "@/components/ui/badge";
import { BrainCircuit } from "lucide-react";
import type { AIModel } from "@/lib/types";
import { useAIModel } from "@/contexts/AIModelContext";

interface ModelInfoBadgeProps {
    model: AIModel | string;
    className?: string;
}

export function ModelInfoBadge({ model, className }: ModelInfoBadgeProps) {
  const { availableModels } = useAIModel();

  // Models are identified internally by a provider-qualified key
  // ("openai::gpt-5.6-luna") so the same id can be served by two providers.
  // That key is plumbing — show the human label instead, and fall back to the
  // bare id if the model isn't in the catalog (e.g. an older stored message).
  const match = availableModels.find(m => m.key === model) ?? availableModels.find(m => m.id === model);
  const label = match?.label ?? String(model).split('::').pop() ?? String(model);

  return (
    <Badge variant="outline" className={`border-accent/30 bg-accent/5 text-accent/80 text-xs font-mono py-1 px-2 ${className}`}>
      <BrainCircuit className="h-3 w-3 mr-1.5" />
      {label}
    </Badge>
  );
}

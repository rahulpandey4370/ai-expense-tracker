
'use client';

import { Badge } from "@/components/ui/badge";
import { BrainCircuit } from "lucide-react";
import type { AIModel } from "@/lib/types";

interface ModelInfoBadgeProps {
    model: AIModel | string;
    className?: string;
}

export function ModelInfoBadge({ model, className }: ModelInfoBadgeProps) {
  return (
    <Badge variant="outline" className={`border-accent/30 bg-accent/5 text-accent/80 text-xs font-mono py-1 px-2 ${className}`}>
      <BrainCircuit className="h-3 w-3 mr-1.5" />
      {model}
    </Badge>
  );
}

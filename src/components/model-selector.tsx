
"use client";

import { useAIModel } from "@/contexts/AIModelContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { BrainCircuit } from "lucide-react";
import type { AIModel } from "@/lib/types";

export function ModelSelector() {
  const { selectedModel, setSelectedModel, modelNames } = useAIModel();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <BrainCircuit className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">Select AI Model</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Choose AI Model</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={selectedModel} onValueChange={(value) => setSelectedModel(value as AIModel)}>
            {modelNames.map(model => (
                <DropdownMenuRadioItem key={model} value={model}>
                    {model}
                </DropdownMenuRadioItem>
            ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

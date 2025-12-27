
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
<<<<<<< HEAD
import { Bot } from "lucide-react";
=======
import { BrainCircuit } from "lucide-react";
>>>>>>> 816848e (Do not make any changes just yet. In this application I want to add the)
import type { AIModel } from "@/lib/types";

export function ModelSelector() {
  const { selectedModel, setSelectedModel, modelNames } = useAIModel();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
<<<<<<< HEAD
          <Bot className="h-[1.2rem] w-[1.2rem]" />
=======
          <BrainCircuit className="h-[1.2rem] w-[1.2rem]" />
>>>>>>> 816848e (Do not make any changes just yet. In this application I want to add the)
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

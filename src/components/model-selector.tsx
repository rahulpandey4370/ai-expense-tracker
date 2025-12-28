
"use client";

import { useAIModel } from "@/contexts/AIModelContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Bot, Sparkles, Check } from "lucide-react";
import type { AIModel } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ModelSelector() {
  const { selectedModel, setSelectedModel, modelNames } = useAIModel();

  const geminiModels = modelNames.filter(name => name.startsWith('gemini'));
  const openAIModels = modelNames.filter(name => name.startsWith('gpt'));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Bot className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">Select AI Model</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-semibold text-primary">Choose AI Model</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {geminiModels.length > 0 && (
          <DropdownMenuGroup>
             <DropdownMenuLabel className="text-xs font-normal text-muted-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-yellow-500"/> Google Gemini
            </DropdownMenuLabel>
            {geminiModels.map(model => (
                <DropdownMenuItem key={model} onSelect={() => setSelectedModel(model as AIModel)}>
                    <Check className={cn("mr-2 h-4 w-4", selectedModel === model ? "opacity-100" : "opacity-0")} />
                    <span>{model}</span>
                </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}

        {openAIModels.length > 0 && (
            <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground flex items-center gap-2">
                    <Bot className="h-4 w-4 text-green-500"/> OpenAI
                </DropdownMenuLabel>
                 {openAIModels.map(model => (
                    <DropdownMenuItem key={model} onSelect={() => setSelectedModel(model as AIModel)}>
                       <Check className={cn("mr-2 h-4 w-4", selectedModel === model ? "opacity-100" : "opacity-0")} />
                       <span>{model}</span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuGroup>
            </>
        )}

      </DropdownMenuContent>
    </DropdownMenu>
  );
}

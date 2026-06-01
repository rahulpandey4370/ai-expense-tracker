"use client";

import { useAIModel } from "@/contexts/AIModelContext";
import { useTaskModel } from "@/hooks/use-task-model";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface TaskModelSelectorProps {
  task: string;
  label?: string;
}

export function TaskModelSelector({ task, label }: TaskModelSelectorProps) {
  const { availableModels } = useAIModel();
  const { model, setTaskModel, isOverridden } = useTaskModel(task);

  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {label}
        </span>
      )}
      <Select value={model} onValueChange={(v) => setTaskModel(v)}>
        <SelectTrigger className="h-7 text-xs w-fit min-w-[140px]">
          <SelectValue placeholder="Select model" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value={"__global__"}>
            Use global default
          </SelectItem>
          {availableModels.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              <div className="flex items-center gap-2">
                <span>{m.id}</span>
                <span className="text-[10px] text-muted-foreground uppercase">
                  {m.provider === "google-ai" ? "Gemini" : "Azure"}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isOverridden && (
        <Badge variant="secondary" className="text-[10px] h-5">
          Custom
        </Badge>
      )}
    </div>
  );
}

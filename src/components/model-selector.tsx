"use client";

import { useAIModel, type AIProvider, type ModelInfo, type ModelTag } from "@/contexts/AIModelContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Bot, Sparkles, Check, Cloud, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

const PROVIDER_META: Record<AIProvider, { label: string; icon: typeof Bot; iconClass: string }> = {
  anthropic:      { label: 'Anthropic (Claude)', icon: Sparkles, iconClass: 'text-orange-500' },
  openai:         { label: 'OpenAI',             icon: Cpu,      iconClass: 'text-emerald-600' },
  'google-ai':    { label: 'Google Gemini',      icon: Sparkles, iconClass: 'text-yellow-500' },
  'azure-openai': { label: 'Azure AI Foundry',   icon: Cloud,    iconClass: 'text-blue-500' },
};

// Direct providers first — they're the ones a user picks deliberately.
const PROVIDER_ORDER: AIProvider[] = ['anthropic', 'openai', 'google-ai', 'azure-openai'];

const TAG_STYLES: Record<ModelTag, string> = {
  flagship:  'bg-purple-500/15 text-purple-700 dark:text-purple-300',
  balanced:  'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  cheap:     'bg-green-500/15 text-green-700 dark:text-green-300',
  fast:      'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  reasoning: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  legacy:    'bg-muted text-muted-foreground',
};

const TAG_SHORT: Record<ModelTag, string> = {
  flagship: 'top', balanced: 'balanced', cheap: 'cheap',
  fast: 'fast', reasoning: 'reasoning', legacy: 'older',
};

/** "$3 in / $15 out per M tokens" — the number that actually drives model choice. */
function priceHint(m: ModelInfo): string | null {
  if (m.inputPerMTok === undefined || m.outputPerMTok === undefined) return null;
  // Sub-dollar rates need cents ($0.20, not $0.2); whole rates don't ($5, not $5.00).
  const usd = (n: number) => (n < 1 || !Number.isInteger(n) ? `$${n.toFixed(2)}` : `$${n}`);
  return `${usd(m.inputPerMTok)} in / ${usd(m.outputPerMTok)} out per M tokens`;
}

export function ModelSelector() {
  const { selectedModel, setSelectedModel, availableModels } = useAIModel();

  const grouped = PROVIDER_ORDER
    .map(provider => ({ provider, models: availableModels.filter(m => m.provider === provider) }))
    .filter(g => g.models.length > 0);

  const active = availableModels.find(m => m.key === selectedModel);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={`AI model: ${active?.label ?? selectedModel}. Change model.`}
        >
          <Bot className="h-[1.2rem] w-[1.2rem]" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="max-h-[70vh] w-72 overflow-y-auto">
        <DropdownMenuLabel className="font-semibold text-primary">Choose AI model</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {grouped.map(({ provider, models }, gi) => {
          const meta = PROVIDER_META[provider];
          const Icon = meta.icon;
          return (
            <DropdownMenuGroup key={provider}>
              {gi > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                <Icon className={cn('h-4 w-4', meta.iconClass)} />
                {meta.label}
              </DropdownMenuLabel>

              {models.map(model => {
                const price = priceHint(model);
                return (
                  <DropdownMenuItem
                    key={model.key}
                    onSelect={() => setSelectedModel(model.key)}
                    className="flex-col items-start gap-0.5 py-2"
                  >
                    <div className="flex w-full items-center gap-2">
                      <Check className={cn('h-4 w-4 shrink-0', selectedModel === model.key ? 'opacity-100' : 'opacity-0')} />
                      <span className="flex-1 truncate text-sm">{model.label ?? model.id}</span>
                      {model.tags?.slice(0, 1).map(tag => (
                        <span key={tag} className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', TAG_STYLES[tag])}>
                          {TAG_SHORT[tag]}
                        </span>
                      ))}
                    </div>
                    {price && (
                      <span className="pl-6 text-[10px] tabular-nums text-muted-foreground">{price}</span>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          );
        })}

        {grouped.length === 0 && (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            No models configured. Add an API key to <code>.env.local</code>.
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Server-only: records every AI model call (tokens, estimated cost, latency) in ai_usage.
import { AsyncLocalStorage } from 'node:async_hooks';
import { getSupabase } from '@/lib/supabase';
import { detectProvider } from '@/lib/model-registry';
import { ANTHROPIC_CATALOG, OPENAI_CATALOG } from '@/lib/model-catalog';

export interface TokenUsage {
  input: number;        // all input tokens, cached included
  cached?: number;      // input read from the provider's cache (cheaper)
  cacheWrite?: number;  // Anthropic: input written to the cache (dearer)
  output: number;       // reasoning included
  reasoning?: number;
}

// The user-facing feature a call belongs to (chat, sms, review, …), set at entry points.
const featureStore = new AsyncLocalStorage<string>();
export const withAiFeature = <T>(feature: string, fn: () => Promise<T>): Promise<T> => featureStore.run(feature, fn);

/**
 * Estimated USD cost from the model catalog's per-million prices. Cache reads bill at
 * 10% and Anthropic cache writes at 125% of the input price. Null when unpriced.
 *
 * ponytail: one cached-input discount for every provider; add a per-model
 * cachedInputPerMTok to the catalog if a provider's discount differs.
 */
export function estimateCostUsd(modelKey: string, u: TokenUsage): number | null {
  // Prices come from the static catalog (never the runtime config, which carries API keys).
  const id = modelKey.includes('::') ? modelKey.split('::')[1] : modelKey;
  const m = [...OPENAI_CATALOG, ...ANTHROPIC_CATALOG].find(c => c.id === id);
  if (m?.inputPerMTok == null || m.outputPerMTok == null) return null;
  const cached = u.cached ?? 0, write = u.cacheWrite ?? 0;
  const fresh = Math.max(0, u.input - cached - write);
  return (fresh * m.inputPerMTok + cached * m.inputPerMTok * 0.1 + write * m.inputPerMTok * 1.25 + u.output * m.outputPerMTok) / 1e6;
}

/** Saves one call. Never throws: tracking must not break the feature. */
export async function recordUsage(e: {
  modelKey: string; operation: 'structured' | 'chat' | 'tool_chat'; usage?: TokenUsage;
  latencyMs: number; ok: boolean; error?: string; feature?: string;
}): Promise<void> {
  try {
    const u = e.usage ?? { input: 0, output: 0 };
    await getSupabase().from('ai_usage').insert({
      feature: featureStore.getStore() ?? e.feature ?? 'other',
      model_key: e.modelKey,
      provider: detectProvider(e.modelKey),
      operation: e.operation,
      input_tokens: Math.round(u.input || 0),
      cached_tokens: Math.round(u.cached || 0),
      output_tokens: Math.round(u.output || 0),
      reasoning_tokens: Math.round(u.reasoning || 0),
      cost_usd: e.ok ? estimateCostUsd(e.modelKey, u) : null,
      latency_ms: Math.round(e.latencyMs),
      ok: e.ok,
      error: e.error?.slice(0, 300) ?? null,
    });
  } catch (err) {
    console.warn('[usage] could not record:', err);
  }
}

// Each provider reports usage differently; these turn them into TokenUsage.
export const usageFrom = {
  openaiChat: (u: any): TokenUsage | undefined => u && {
    input: u.prompt_tokens ?? 0, cached: u.prompt_tokens_details?.cached_tokens ?? 0,
    output: u.completion_tokens ?? 0, reasoning: u.completion_tokens_details?.reasoning_tokens ?? 0,
  },
  openaiResponses: (u: any): TokenUsage | undefined => u && {
    input: u.input_tokens ?? 0, cached: u.input_tokens_details?.cached_tokens ?? 0,
    output: u.output_tokens ?? 0, reasoning: u.output_tokens_details?.reasoning_tokens ?? 0,
  },
  anthropic: (u: any): TokenUsage | undefined => u && {
    input: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    cached: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0,
    output: u.output_tokens ?? 0,
  },
  gemini: (u: any): TokenUsage | undefined => u && {
    input: u.promptTokenCount ?? u.inputTokens ?? 0, cached: u.cachedContentTokenCount ?? u.cachedContentTokens ?? 0,
    output: (u.candidatesTokenCount ?? u.outputTokens ?? 0) + (u.thoughtsTokenCount ?? u.thoughtsTokens ?? 0),
    reasoning: u.thoughtsTokenCount ?? u.thoughtsTokens ?? 0,
  },
};

/** Times a provider call and records it, success or failure. */
export async function tracked<R>(
  meta: { modelKey: string; operation: 'structured' | 'chat' | 'tool_chat'; feature?: string },
  call: () => Promise<R>,
  usageOf: (r: R) => TokenUsage | undefined,
): Promise<R> {
  const t = Date.now();
  try {
    const r = await call();
    await recordUsage({ ...meta, usage: usageOf(r), latencyMs: Date.now() - t, ok: true });
    return r;
  } catch (e: any) {
    await recordUsage({ ...meta, latencyMs: Date.now() - t, ok: false, error: e?.message });
    throw e;
  }
}

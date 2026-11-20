import { BaseLlm, Gemini, type BaseLlmConnection, type LlmRequest, type LlmResponse } from '@google/adk';
import type { Content, Part, Schema } from '@google/genai';
import { callToolChatLLM, type ToolChatMessage, type ToolSpec } from '@/lib/ai-client';
import { detectProvider, getModelConfig } from '@/lib/model-registry';

/**
 * Lets ADK agents run on the models this app already supports, through the
 * existing multi-provider client (src/lib/ai-client.ts) and the same model keys
 * as the model picker. Gemini goes through ADK's own Gemini class instead.
 */
export function adkModelFor(modelKey: string): BaseLlm {
  if (detectProvider(modelKey) === 'google-ai') {
    return new Gemini({
      model: getModelConfig(modelKey)?.id ?? modelKey.replace(/^google-ai::/, ''),
      apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY,
    });
  }
  return new FinwiseLlm({ model: modelKey });
}

class FinwiseLlm extends BaseLlm {
  static readonly supportedModels: Array<string | RegExp> = [];

  async *generateContentAsync(llmRequest: LlmRequest): AsyncGenerator<LlmResponse, void> {
    const messages: ToolChatMessage[] = [];
    const system = textOf(llmRequest.config?.systemInstruction);
    if (system) messages.push({ role: 'system', content: system });
    for (const content of llmRequest.contents) messages.push(...toMessages(content));

    const tools: ToolSpec[] = (llmRequest.config?.tools ?? []).flatMap(t =>
      ('functionDeclarations' in t ? t.functionDeclarations ?? [] : []).map(d => ({
        name: d.name!,
        description: d.description ?? '',
        parameters: d.parametersJsonSchema
          ? (d.parametersJsonSchema as Record<string, unknown>)
          : toJsonSchema(d.parameters ?? { type: 'OBJECT' as Schema['type'], properties: {} }),
      }))
    );

    try {
      const { text, toolCalls } = await callToolChatLLM(this.model, messages, tools, {
        temperature: llmRequest.config?.temperature,
        maxOutputTokens: llmRequest.config?.maxOutputTokens,
      });
      const parts: Part[] = [];
      if (text) parts.push({ text });
      for (const c of toolCalls) parts.push({ functionCall: { id: c.id, name: c.name, args: c.args } });
      yield { content: { role: 'model', parts }, turnComplete: true };
    } catch (e: any) {
      console.error(`[adk] ${this.model} call failed:`, e);
      yield { errorCode: String(e?.status ?? 'MODEL_ERROR'), errorMessage: e?.message ?? 'Model call failed', turnComplete: true };
    }
  }

  async connect(): Promise<BaseLlmConnection> {
    throw new Error('Live connections are not supported for this model.');
  }
}

function textOf(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textOf).join('\n');
  const v = value as { text?: string; parts?: unknown[] };
  if (typeof v.text === 'string') return v.text;
  if (Array.isArray(v.parts)) return v.parts.map(textOf).join('\n');
  return '';
}

/** One genai Content becomes one or more provider-neutral messages. */
function toMessages(content: Content): ToolChatMessage[] {
  const parts = content.parts ?? [];
  if (content.role === 'model') {
    const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('');
    const toolCalls = parts
      .filter(p => p.functionCall)
      .map(p => ({ id: p.functionCall!.id ?? p.functionCall!.name!, name: p.functionCall!.name!, args: p.functionCall!.args ?? {} }));
    return text || toolCalls.length ? [{ role: 'assistant', content: text || undefined, toolCalls }] : [];
  }
  const out: ToolChatMessage[] = [];
  for (const p of parts) {
    if (p.functionResponse) {
      out.push({
        role: 'tool',
        toolCallId: p.functionResponse.id ?? p.functionResponse.name!,
        name: p.functionResponse.name!,
        content: JSON.stringify(p.functionResponse.response ?? {}),
      });
    } else if (p.text) {
      out.push({ role: 'user', content: p.text });
    }
  }
  return out;
}

/** genai Schema ("OBJECT", "STRING" …) → JSON Schema, which OpenAI and Anthropic expect. */
export function toJsonSchema(s: Schema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (s.type) out.type = String(s.type).toLowerCase();
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (s.format && s.format !== 'int32' && s.format !== 'int64') out.format = s.format;
  if (s.items) out.items = toJsonSchema(s.items);
  if (s.properties) out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toJsonSchema(v)]));
  if (s.required?.length) out.required = s.required;
  if (s.anyOf) out.anyOf = s.anyOf.map(toJsonSchema);
  // zod's int() adds ±MAX_SAFE_INTEGER bounds; they're noise to a model.
  if (s.minimum != null && Math.abs(s.minimum) < Number.MAX_SAFE_INTEGER) out.minimum = s.minimum;
  if (s.maximum != null && Math.abs(s.maximum) < Number.MAX_SAFE_INTEGER) out.maximum = s.maximum;
  return out;
}

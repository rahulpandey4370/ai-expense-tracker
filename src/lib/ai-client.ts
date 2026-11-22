'use server';

/**
 * Unified AI client.
 *
 * All AI flows in the app route through this file.
 * It handles provider selection (Azure OpenAI vs Google Gemini) automatically
 * based on the resolved model configuration.
 *
 * Adding a new model only requires env vars — no changes here.
 */

import { AzureOpenAI, OpenAI } from 'openai';
import { tracked, usageFrom } from '@/lib/usage';
import Anthropic from '@anthropic-ai/sdk';
import { z, ZodSchema } from 'zod';
import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { getModelConfig, detectProvider, ModelInfo } from '@/lib/model-registry';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';

// Inline type to avoid importing from openai/resources/chat (path can vary by SDK version)
interface ChatMessageParam {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

// ---------------------------------------------------------------------------
// Azure client cache — one client per unique endpoint+key+apiVersion
// Supports both Azure OpenAI Service and Azure AI Model Inference endpoints
// ---------------------------------------------------------------------------
const azureClientCache = new Map<string, AzureOpenAI | OpenAI>();

function isInferenceEndpoint(endpoint: string): boolean {
  // Azure AI Model Inference Service endpoints contain /models in the path
  // e.g. https://project.region.services.ai.azure.com/models
  return endpoint.includes('/models');
}

function getAzureClient(config: ModelInfo): AzureOpenAI | OpenAI {
  if (!config.endpoint || !config.apiKey) {
    throw new Error(
      `Azure OpenAI credentials are not configured for model "${config.id}". ` +
      `Set either shared AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY or ` +
      `per-model AI_MODEL_${config.id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_ENDPOINT / _API_KEY.`
    );
  }

  const cacheKey = `${config.endpoint}|${config.apiKey}|${config.apiVersion}`;
  if (!azureClientCache.has(cacheKey)) {
    if (isInferenceEndpoint(config.endpoint)) {
      // Azure AI Model Inference Service (DeepSeek, Llama, etc.)
      // baseURL must end at /models — strip /chat/completions if the user accidentally
      // included the full path in the endpoint env var, then strip trailing slash.
      const inferenceBase = config.endpoint
        .replace(/\/chat\/completions$/, '')
        .replace(/\/$/, '');
      azureClientCache.set(
        cacheKey,
        new OpenAI({
          baseURL: inferenceBase,
          apiKey: config.apiKey,
          defaultQuery: { 'api-version': '2024-05-01-preview' },
          defaultHeaders: { 'api-key': config.apiKey },
        })
      );
    } else {
      // Azure OpenAI Service (GPT-5, GPT-4, etc.)
      // Uses AzureOpenAI client — strips path to origin, SDK appends /openai/deployments/...
      const endpoint = new URL(config.endpoint).origin;
      azureClientCache.set(
        cacheKey,
        new AzureOpenAI({
          endpoint,
          apiKey: config.apiKey,
          apiVersion: config.apiVersion || '2025-01-01-preview',
        })
      );
    }
  }
  return azureClientCache.get(cacheKey)!;
}

// ---------------------------------------------------------------------------
// Direct-provider clients (first-party OpenAI and Anthropic APIs)
// ---------------------------------------------------------------------------
let openAIClient: OpenAI | undefined;
let anthropicClient: Anthropic | undefined;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set. Add it to .env.local to use OpenAI models directly.');
  }
  if (!openAIClient) {
    openAIClient = new OpenAI({
      apiKey,
      // Optional: point at a compatible gateway or a specific org/project.
      baseURL: process.env.OPENAI_BASE_URL || undefined,
      organization: process.env.OPENAI_ORG_ID || undefined,
      project: process.env.OPENAI_PROJECT_ID || undefined,
    });
  }
  return openAIClient;
}

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env.local to use Claude models directly.');
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey,
      baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
    });
  }
  return anthropicClient;
}

/**
 * Non-streaming ceiling. Sized so adaptive thinking (on by default for the
 * current Claude models) has room to reason and still emit a full answer,
 * while staying under the SDK's HTTP timeout — above ~16k you must stream.
 */
const DIRECT_MAX_TOKENS = 16000;

// ---------------------------------------------------------------------------
// Prompt template renderer (Handlebars-like, kept from legacy azure-openai.ts)
// ---------------------------------------------------------------------------
function simpleTemplateRender(template: string, data: Record<string, any>): string {
  let output = template;

  // Remove media tags (image URLs are handled separately for Azure)
  output = output.replace(/{{media\s+url=([^}]+)}}/g, '');

  // Replace {{{json ...}}}
  output = output.replace(/{{{json\s+([^}]+)}}}/g, (_match, key) => {
    const value = data[key.trim()];
    return JSON.stringify(value, null, 2);
  });

  // Replace {{#each ...}} ... {{/each}}
  output = output.replace(/{{#each\s+([^}]+)}}([\s\S]*?){{\/each}}/g, (_match, arrayKey, content) => {
    const array = data[arrayKey.trim()];
    if (!Array.isArray(array)) return '';
    return array
      .map((item: any) => {
        return content.replace(/{{this\.([\w]+)}}/g, (_m: string, prop: string) => item[prop] || '');
      })
      .join('');
  });

  // Replace {{{...}}} and {{...}}
  output = output.replace(/{{{\s*([\w.]+)\s*}}}/g, (_match, key) => {
    const keys = key.trim().split('.');
    let current: any = data;
    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        return '';
      }
    }
    return String(current);
  });

  output = output.replace(/{{([\w.]+)}}/g, (_match, key) => {
    const keys = key.trim().split('.');
    let current: any = data;
    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        return '';
      }
    }
    return String(current);
  });

  // Replace {{#if ...}} ... {{/if}}
  output = output.replace(/{{#if\s+([^}]+)}}([\s\S]*?){{\/if}}/g, (_match, key, content) => {
    return data[key.trim()] ? content : '';
  });

  return output.trim();
}

function cleanJsonContent(content: string): string {
  return content.replace(/```json\n?|\n?```/g, '').trim();
}

/** Peels optional/nullable/default/effects wrappers to get at the real type name. */
function unwrapTypeName(schema: any): string | undefined {
  let current = schema;
  for (let i = 0; i < 8 && current?._def; i++) {
    const name = current._def.typeName;
    if (name === 'ZodOptional' || name === 'ZodNullable' || name === 'ZodDefault') {
      current = current._def.innerType;
    } else if (name === 'ZodEffects') {
      current = current._def.schema;
    } else {
      return name;
    }
  }
  return current?._def?.typeName;
}

/**
 * Models routinely drop the JSON envelope we asked for and return the payload
 * directly — a bare `[...]` instead of `{ parsedTransactions: [...] }`, or the
 * receipt's fields at the top level instead of under `parsedTransaction`. The
 * data is right there, so re-wrap it rather than failing the parse.
 *
 * Only applies when the response shares *no* key with the expected object, so
 * a correctly-shaped response is never touched.
 */
function normaliseEnvelope(parsed: unknown, outputSchema: ZodSchema): unknown {
  const def: any = (outputSchema as any)?._def;
  if (def?.typeName !== 'ZodObject') return parsed;

  const shape = typeof def.shape === 'function' ? def.shape() : def.shape;
  const keys: string[] = Object.keys(shape ?? {});
  if (keys.length === 0) return parsed;

  const isPlainObject = !!parsed && typeof parsed === 'object' && !Array.isArray(parsed);
  if (isPlainObject && keys.some(k => k in (parsed as Record<string, unknown>))) {
    return parsed; // already the right shape
  }

  const arrayKey = keys.find(k => unwrapTypeName(shape[k]) === 'ZodArray');

  // 1. Bare array where an array-valued key was expected.
  if (Array.isArray(parsed) && arrayKey) return { [arrayKey]: parsed };

  if (isPlainObject) {
    const obj = parsed as Record<string, unknown>;
    // 2. Right array under the wrong name ({ transactions: [...] }).
    if (arrayKey) {
      const arrayProp = Object.keys(obj).find(k => Array.isArray(obj[k]));
      if (arrayProp) return { [arrayKey]: obj[arrayProp] };
    }
    // 3. A single record returned without its wrapper.
    const objectKey = keys.find(k => unwrapTypeName(shape[k]) === 'ZodObject') ?? (keys.length === 1 ? keys[0] : undefined);
    if (objectKey) return { [objectKey]: obj };
  }

  return parsed;
}

/**
 * Shared JSON → schema step for the providers that hand back raw text (i.e.
 * everything except Gemini, which enforces the schema itself).
 */
function parseModelJson<T extends ZodSchema>(raw: string, outputSchema: T, label: string): z.infer<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanJsonContent(raw));
  } catch {
    throw new Error(`${label} returned text that is not valid JSON: ${raw.slice(0, 200)}`);
  }
  return outputSchema.parse(normaliseEnvelope(parsed, outputSchema));
}

// ---------------------------------------------------------------------------
// Retry helper shared by every non-Genkit provider (Azure, OpenAI, Anthropic).
// Only retries transient overload; real errors surface immediately.
// ---------------------------------------------------------------------------
async function retryableProviderCall<T>(fn: () => Promise<T>, retries = 2, baseDelayMs = 1000): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorMessage = String(error?.message || '').toLowerCase();
      const status = error?.status || error?.cause?.status;

      // 529 is Anthropic's "overloaded"; 503 is the Azure/OpenAI equivalent.
      if (
        errorMessage.includes('503') || errorMessage.includes('529') ||
        errorMessage.includes('overloaded') || errorMessage.includes('service unavailable') ||
        status === 503 || status === 529
      ) {
        if (i < retries) {
          const delayMs = baseDelayMs * (i + 1);
          console.warn(`AI provider overloaded. Retrying attempt ${i + 2} of ${retries + 1} in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } else {
        throw error;
      }
    }
  }
  throw lastError || new Error('AI provider call failed after retries.');
}

// ---------------------------------------------------------------------------
// Config / types
// ---------------------------------------------------------------------------
export interface LLMConfig {
  temperature?: number;
  maxOutputTokens?: number;
  safetySettings?: Array<{ category: string; threshold: string }>;
  /** callToolChatLLM only: receives the answer text as it is written (OpenAI and Anthropic). */
  onText?: (delta: string) => void;
  /** Which feature made the call, for the Usage page (e.g. "parse", "insights"). */
  feature?: string;
}

// ---------------------------------------------------------------------------
// Chat-completions parameter compatibility
//
// The OpenAI-shaped APIs disagree about their own parameters:
//   - Reasoning-era models (o-series, gpt-5.x) reject `max_tokens` and demand
//     `max_completion_tokens`; older deployments and the Azure AI Inference
//     models (Llama, DeepSeek, Kimi, Grok) only understand `max_tokens`.
//   - Reasoning models reject any `temperature` other than the default.
//   - Some inference deployments reject `response_format` entirely.
//
// Rather than maintain a per-model allow-list that silently rots every time a
// model ships, we send a sensible default, read the provider's own 400, and
// adapt. What we learn is memoised per model so only the first call ever pays
// the extra round-trip.
// ---------------------------------------------------------------------------
type TokenParam = 'max_tokens' | 'max_completion_tokens';

interface ChatParamQuirks {
  /** Which token-cap parameter this model accepts, once we know. */
  tokenParam?: TokenParam;
  /** Spellings already rejected, so we never retry the same one. */
  tokenParamsTried: Set<string>;
  /** Parameters the provider rejected outright and that we must omit. */
  drop: Set<string>;
}

const quirksByModel = new Map<string, ChatParamQuirks>();

function getQuirks(modelKey: string): ChatParamQuirks {
  let quirks = quirksByModel.get(modelKey);
  if (!quirks) {
    quirks = { tokenParamsTried: new Set(), drop: new Set() };
    quirksByModel.set(modelKey, quirks);
  }
  return quirks;
}

/**
 * A flow's `maxOutputTokens` exists to stop runaway generation, but on
 * reasoning models the same budget also funds hidden reasoning tokens — a
 * 1.5k cap gets consumed thinking and returns empty content, or truncates the
 * JSON mid-object. So the flow value acts as a floor-adjusted hint here and
 * DIRECT_MAX_TOKENS is the real ceiling: generous enough never to truncate,
 * still under the SDK's non-streaming HTTP timeout.
 */
function resolveTokenCap(config?: LLMConfig): number {
  return Math.max(config?.maxOutputTokens ?? 0, DIRECT_MAX_TOKENS);
}

function buildChatParams(
  quirks: ChatParamQuirks,
  base: Record<string, any>,
  config: LLMConfig | undefined,
  defaultTokenParam: TokenParam
): Record<string, any> {
  const params: Record<string, any> = { ...base };

  const tokenParam = quirks.tokenParam ?? defaultTokenParam;
  if (!quirks.drop.has(tokenParam)) {
    params[tokenParam] = resolveTokenCap(config);
  }
  if (config?.temperature != null) {
    params.temperature = config.temperature;
  }

  for (const key of quirks.drop) delete params[key];
  return params;
}

/**
 * Reads a provider 400 and works out which parameter to change. Returns true
 * when it learned something new and the call is worth retrying. Always
 * terminates: each token spelling is tried at most once, and every other
 * parameter can only be dropped once.
 */
function adaptQuirksFromError(
  quirks: ChatParamQuirks,
  error: any,
  sentParams: Record<string, any>
): boolean {
  const status = error?.status ?? error?.cause?.status;
  const message = String(error?.message ?? '');
  if (status !== 400) return false;

  const switchTokenParam = (rejected: string): boolean => {
    quirks.tokenParamsTried.add(rejected);
    const other: TokenParam = rejected === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens';
    if (!quirks.tokenParamsTried.has(other)) {
      quirks.tokenParam = other;
      return true;
    }
    // Both spellings refused — go without a cap rather than fail the request.
    quirks.drop.add('max_tokens');
    quirks.drop.add('max_completion_tokens');
    return true;
  };

  // The provider usually tells us exactly what to use instead.
  const explicitSwap = /Use '(max_completion_tokens|max_tokens)' instead/i.exec(message);
  if (explicitSwap) {
    const target = explicitSwap[1] as TokenParam;
    const rejected: TokenParam = target === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens';
    quirks.tokenParamsTried.add(rejected);
    if (quirks.tokenParam === target) return false; // already using it; nothing learned
    quirks.tokenParam = target;
    return true;
  }

  const named =
    /Unsupported parameter: '([^']+)'/i.exec(message) ??
    /Unsupported value: '([^']+)'/i.exec(message) ??
    /Unrecognized request argument supplied: ([A-Za-z0-9_]+)/i.exec(message) ??
    /'([A-Za-z0-9_]+)' is not supported/i.exec(message);

  if (named) {
    // Strip a nested path like "response_format.type" down to the root key.
    const param = named[1].split('.')[0];
    if (!(param in sentParams) || quirks.drop.has(param)) return false;
    if (param === 'max_tokens' || param === 'max_completion_tokens') {
      return switchTokenParam(param);
    }
    quirks.drop.add(param);
    return true;
  }

  return false;
}

/**
 * Issues a chat-completions call, re-shaping the request as many times as the
 * provider needs (bounded by how many parameters there are to adapt).
 */
async function chatCompletionsAdaptive(
  client: OpenAI | AzureOpenAI,
  modelKey: string,
  base: Record<string, any>,
  config: LLMConfig | undefined,
  defaultTokenParam: TokenParam
): Promise<any> {
  const quirks = getQuirks(modelKey);

  for (let attempt = 0; ; attempt++) {
    const params = buildChatParams(quirks, base, config, defaultTokenParam);
    try {
      return await tracked(
        { modelKey, operation: base.response_format ? 'structured' : base.tools ? 'tool_chat' : 'chat', feature: config?.feature },
        () => retryableProviderCall(() => client.chat.completions.create(params as any)),
        (r: any) => usageFrom.openaiChat(r?.usage),
      );
    } catch (error: any) {
      // 5 is a safe bound: token spelling (x2), temperature, response_format,
      // plus slack. Beyond that the 400 is about something we can't fix here.
      if (attempt >= 5 || !adaptQuirksFromError(quirks, error, params)) throw error;
      console.warn(
        `[ai-client] ${modelKey} rejected a request parameter; retrying with an adapted shape. ` +
        `Provider said: ${error?.message}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Structured Output (all flows that need JSON back)
// ---------------------------------------------------------------------------
export async function callStructuredLLM<T extends ZodSchema>(
  modelId: string,
  promptTemplate: string,
  input: Record<string, any>,
  outputSchema: T,
  config?: LLMConfig
): Promise<z.infer<T>> {
  const provider = detectProvider(modelId);

  switch (provider) {
    case 'azure-openai':
      return callAzureStructured(modelId, promptTemplate, input, outputSchema, config);
    case 'openai':
      return callOpenAIStructured(modelId, promptTemplate, input, outputSchema, config);
    case 'anthropic':
      return callAnthropicStructured(modelId, promptTemplate, input, outputSchema, config);
    default:
      return callGeminiStructured(modelId, promptTemplate, input, outputSchema, config);
  }
}

/**
 * JSON-mode instruction appended for providers where we ask for a raw JSON
 * object rather than a compiled schema. Mirrors what the Azure path relies on.
 */
const JSON_ONLY_SUFFIX =
  '\n\nRespond with a single valid JSON object and nothing else. ' +
  'Do not wrap it in markdown code fences and do not add commentary.';

async function callOpenAIStructured<T extends ZodSchema>(
  modelId: string,
  promptTemplate: string,
  input: Record<string, any>,
  outputSchema: T,
  config?: LLMConfig
): Promise<z.infer<T>> {
  const client = getOpenAIClient();
  // modelId may be a provider-qualified key ("openai::gpt-5.6-sol"); the API
  // needs the bare id.
  const apiModel = getModelConfig(modelId)?.id ?? modelId;
  // The suffix is not just belt-and-braces: `response_format: json_object`
  // is rejected with a 400 unless the word "json" appears somewhere in the
  // messages, and not every flow's prompt template says it.
  const textPrompt = simpleTemplateRender(promptTemplate, input) + JSON_ONLY_SUFFIX;

  const content: any[] = [{ type: 'text', text: textPrompt }];
  if (typeof input.receiptImageUri === 'string' && input.receiptImageUri.startsWith('data:application/pdf')) {
    // Bank statements: Chat Completions takes PDFs as a file part.
    content.push({ type: 'file', file: { filename: 'document.pdf', file_data: input.receiptImageUri } });
  } else if (input.receiptImageUri) {
    content.push({ type: 'image_url', image_url: { url: input.receiptImageUri } });
  }

  const response = await chatCompletionsAdaptive(
    client,
    modelId,
    {
      model: apiModel,
      messages: [{ role: 'user', content }],
      response_format: { type: 'json_object' },
      stream: false,
    },
    config,
    // First-party OpenAI is reasoning-era; the newer spelling is the safer bet.
    'max_completion_tokens'
  );

  const raw = (response as any).choices?.[0]?.message?.content;
  if (!raw) throw new Error(`OpenAI (${modelId}) returned an empty response.`);
  return parseModelJson(raw, outputSchema, `OpenAI (${modelId})`);
}

async function callAnthropicStructured<T extends ZodSchema>(
  modelId: string,
  promptTemplate: string,
  input: Record<string, any>,
  outputSchema: T,
  config?: LLMConfig
): Promise<z.infer<T>> {
  const client = getAnthropicClient();
  const apiModel = getModelConfig(modelId)?.id ?? modelId;
  const textPrompt = simpleTemplateRender(promptTemplate, input);

  const content: Anthropic.ContentBlockParam[] = [
    { type: 'text', text: textPrompt + JSON_ONLY_SUFFIX },
  ];

  // Receipt scanning sends a data URI; Anthropic wants the media type and the
  // bare base64 payload as separate fields.
  const image = parseDataUri(input.receiptImageUri);
  if (image?.mediaType === 'application/pdf') {
    content.unshift({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: image.data } });
  } else if (image) {
    content.unshift({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType as any, data: image.data },
    });
  }

  // No temperature/top_p: the current Claude models reject them outright.
  // The cap must stay generous — adaptive thinking spends the same budget, so
  // a flow's small hint would truncate the answer (see resolveTokenCap).
  const response = await tracked({ modelKey: modelId, operation: 'structured', feature: (config as LLMConfig | undefined)?.feature }, () => retryableProviderCall(() =>
    client.messages.create({
      model: apiModel,
      max_tokens: resolveTokenCap(config),
      system: 'You are a precise financial data extraction engine. You always reply with a single JSON object.',
      messages: [{ role: 'user', content }],
    })
  ), r => usageFrom.anthropic(r.usage));

  // Safety classifiers can decline with HTTP 200 — check before reading content.
  if (response.stop_reason === 'refusal') {
    throw new Error(`Claude (${modelId}) declined this request. Try a different model.`);
  }

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();

  if (!raw) throw new Error(`Claude (${modelId}) returned an empty response.`);
  return parseModelJson(raw, outputSchema, `Claude (${modelId})`);
}

/** Splits `data:image/png;base64,AAAA` into its media type and payload. */
function parseDataUri(uri: unknown): { mediaType: string; data: string } | null {
  if (typeof uri !== 'string') return null;
  // [\s\S] rather than the `s` flag — the build targets pre-ES2018.
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(uri);
  if (!match) return null;
  return { mediaType: match[1], data: match[2] };
}

async function callAzureStructured<T extends ZodSchema>(
  modelId: string,
  promptTemplate: string,
  input: Record<string, any>,
  outputSchema: T,
  config?: LLMConfig
): Promise<z.infer<T>> {
  const modelConfig = getModelConfig(modelId);
  if (!modelConfig) {
    throw new Error(`Model "${modelId}" is not registered. Check AI_MODELS env var.`);
  }

  const client = getAzureClient(modelConfig);
  const isInference = isInferenceEndpoint(modelConfig.endpoint || '');
  // Same reason as the OpenAI path: `response_format: json_object` is rejected
  // unless the word "json" appears in the messages, and if the provider turns
  // out to reject response_format altogether this instruction is what keeps
  // the reply parseable.
  const textPrompt = simpleTemplateRender(promptTemplate, input) + JSON_ONLY_SUFFIX;

  const messages: ChatMessageParam[] = [
    {
      role: 'user',
      content: [{ type: 'text', text: textPrompt }],
    },
  ];

  // Attach image if present (same logic as legacy azure-openai.ts)
  if (input.receiptImageUri && typeof messages[0].content === 'object') {
    (messages[0].content as any[]).push({
      type: 'image_url',
      image_url: { url: input.receiptImageUri },
    });
  }

  const response = await chatCompletionsAdaptive(
    client,
    modelId,
    {
      model: isInference ? modelConfig.id : modelConfig.deployment!,
      messages: messages as any[],
      response_format: { type: 'json_object' },
      stream: false,
    },
    config,
    // Azure AI Inference deployments (Llama, DeepSeek, Kimi, Grok) speak the
    // older dialect; Azure OpenAI Service deployments are reasoning-era.
    isInference ? 'max_tokens' : 'max_completion_tokens'
  );

  const content = (response as any).choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`Azure OpenAI (${modelId}) returned an empty response.`);
  }

  return parseModelJson(content, outputSchema, `Azure OpenAI (${modelId})`);
}

async function callGeminiStructured<T extends ZodSchema>(
  modelId: string,
  promptTemplate: string,
  input: Record<string, any>,
  outputSchema: T,
  config?: LLMConfig
): Promise<z.infer<T>> {
  // Use a unique prompt name to avoid collisions in the Genkit registry
  const promptName = `dynamic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const prompt = ai.definePrompt({
    name: promptName,
    // Permissive input schema — the flow already prepared the input object
    input: { schema: z.record(z.any()) },
    output: { schema: outputSchema },
    config: {
      temperature: config?.temperature ?? 0.2,
      maxOutputTokens: config?.maxOutputTokens ?? 1500,
      safetySettings: config?.safetySettings ?? [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    } as any,
    prompt: promptTemplate,
  });

  const geminiId = getModelConfig(modelId)?.id ?? modelId;
  const result = await tracked({ modelKey: modelId, operation: 'structured', feature: config?.feature },
    () => retryableAIGeneration(() => prompt(input, { model: googleAI.model(geminiId) })), (r: any) => usageFrom.gemini(r?.usage));

  if (!result.output) {
    throw new Error(`Gemini (${modelId}) returned no structured output.`);
  }

  return result.output;
}

// ---------------------------------------------------------------------------
// Chat style (financial chatbot, portfolio chatbot)
// ---------------------------------------------------------------------------
export async function callChatLLM(
  modelId: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  config?: LLMConfig
): Promise<string> {
  const provider = detectProvider(modelId);

  switch (provider) {
    case 'azure-openai':
      return callAzureChat(modelId, messages, config);
    case 'openai':
      return callOpenAIChat(modelId, messages, config);
    case 'anthropic':
      return callAnthropicChat(modelId, messages, config);
    default:
      return callGeminiChat(modelId, messages, config);
  }
}

// ---------------------------------------------------------------------------
// Tool calling (used by the ADK agents in src/ai/adk). Same providers and
// clients as callChatLLM, with function tools added. Gemini isn't here: the
// agents use ADK's own Gemini class for it.
// ---------------------------------------------------------------------------
export type ToolCall = { id: string; name: string; args: Record<string, unknown> };
export type ToolChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content?: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };
export type ToolSpec = { name: string; description: string; parameters: Record<string, unknown> };

export async function callToolChatLLM(
  modelId: string,
  messages: ToolChatMessage[],
  tools: ToolSpec[],
  config?: LLMConfig
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const provider = detectProvider(modelId);
  if (provider === 'anthropic') return anthropicToolChat(modelId, messages, tools, config);
  if (provider === 'google-ai') throw new Error('Gemini tool calls go through ADK’s Gemini model, not callToolChatLLM.');
  // Current OpenAI reasoning models only take function tools on the Responses API.
  if (provider === 'openai') return openAIResponsesToolChat(modelId, messages, tools, config);

  const isAzure = provider === 'azure-openai';
  const modelConfig = getModelConfig(modelId);
  if (isAzure && !modelConfig) throw new Error(`Model "${modelId}" is not registered. Check AI_MODELS env var.`);
  const client = isAzure ? getAzureClient(modelConfig!) : getOpenAIClient();
  const isInference = isAzure && isInferenceEndpoint(modelConfig!.endpoint || '');
  const apiModel = isAzure ? (isInference ? modelConfig!.id : modelConfig!.deployment!) : (modelConfig?.id ?? modelId);

  const oaMessages = messages.map(m => {
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
    if (m.role === 'assistant') {
      return {
        role: 'assistant',
        content: m.content ?? null,
        ...(m.toolCalls?.length
          ? { tool_calls: m.toolCalls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) }
          : {}),
      };
    }
    return { role: m.role, content: m.content };
  });

  const response = await chatCompletionsAdaptive(
    client,
    modelId,
    {
      model: apiModel,
      messages: oaMessages,
      ...(tools.length ? { tools: tools.map(t => ({ type: 'function', function: t })) } : {}),
    },
    config,
    isInference ? 'max_tokens' : 'max_completion_tokens'
  );
  const msg = (response as any).choices?.[0]?.message ?? {};
  const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((c: any) => ({
    id: c.id,
    name: c.function?.name,
    args: safeJson(c.function?.arguments),
  }));
  return { text: msg.content ?? '', toolCalls };
}

async function openAIResponsesToolChat(
  modelId: string,
  messages: ToolChatMessage[],
  tools: ToolSpec[],
  config?: LLMConfig
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const client = getOpenAIClient();
  const instructions = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const input: any[] = [];
  for (const m of messages) {
    if (m.role === 'user') input.push({ role: 'user', content: m.content });
    else if (m.role === 'tool') input.push({ type: 'function_call_output', call_id: m.toolCallId, output: m.content });
    else if (m.role === 'assistant') {
      if (m.content) input.push({ role: 'assistant', content: m.content });
      for (const c of m.toolCalls ?? []) input.push({ type: 'function_call', call_id: c.id, name: c.name, arguments: JSON.stringify(c.args) });
    }
  }
  // No temperature: the reasoning models reject it, and the tool loop doesn't need it.
  const body: any = {
    model: getModelConfig(modelId)?.id ?? modelId,
    ...(instructions ? { instructions } : {}),
    input,
    ...(tools.length ? { tools: tools.map(t => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters, strict: false })) } : {}),
    max_output_tokens: resolveTokenCap(config),
    store: false,
  };
  const onText = config?.onText;
  const response: any = await tracked({ modelKey: modelId, operation: 'tool_chat', feature: config?.feature }, () => retryableProviderCall(() => {
    if (!onText) return client.responses.create(body);
    const stream = client.responses.stream(body);
    stream.on('response.output_text.delta', (e: any) => onText(e.delta));
    return stream.finalResponse();
  }), (r: any) => usageFrom.openaiResponses(r?.usage));
  const output: any[] = response.output ?? [];
  const toolCalls: ToolCall[] = output
    .filter(o => o.type === 'function_call')
    .map(o => ({ id: o.call_id, name: o.name, args: safeJson(o.arguments) }));
  const text = response.output_text
    ?? output.filter(o => o.type === 'message').flatMap(o => o.content ?? []).filter((c: any) => c.type === 'output_text').map((c: any) => c.text).join('');
  return { text, toolCalls };
}

function safeJson(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

async function anthropicToolChat(
  modelId: string,
  messages: ToolChatMessage[],
  tools: ToolSpec[],
  config?: LLMConfig
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const client = getAnthropicClient();
  const apiModel = getModelConfig(modelId)?.id ?? modelId;
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');

  // Anthropic wants tool results as user turns, and no two turns from the same side in a row.
  const turns: Array<{ role: 'user' | 'assistant'; content: any[] }> = [];
  const push = (role: 'user' | 'assistant', block: any) => {
    const last = turns[turns.length - 1];
    if (last?.role === role) last.content.push(block);
    else turns.push({ role, content: [block] });
  };
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'user') push('user', { type: 'text', text: m.content });
    else if (m.role === 'tool') push('user', { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content });
    else {
      if (m.content) push('assistant', { type: 'text', text: m.content });
      for (const c of m.toolCalls ?? []) push('assistant', { type: 'tool_use', id: c.id, name: c.name, input: c.args });
    }
  }
  if (turns.length === 0 || turns[0].role !== 'user') turns.unshift({ role: 'user', content: [{ type: 'text', text: 'Please continue.' }] });

  const params = {
    model: apiModel,
    max_tokens: resolveTokenCap(config),
    ...(system ? { system } : {}),
    messages: turns as any,
    ...(tools.length ? { tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters as any })) } : {}),
  };
  const onText = config?.onText;
  const response = await tracked({ modelKey: modelId, operation: 'tool_chat', feature: config?.feature }, () => retryableProviderCall(() => {
    if (!onText) return client.messages.create(params);
    const stream = client.messages.stream(params);
    stream.on('text', onText);
    return stream.finalMessage();
  }), r => usageFrom.anthropic(r.usage));

  const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
  const toolCalls = response.content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    .map(b => ({ id: b.id, name: b.name, args: (b.input ?? {}) as Record<string, unknown> }));
  return { text, toolCalls };
}

async function callOpenAIChat(
  modelId: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  config?: LLMConfig
): Promise<string> {
  const client = getOpenAIClient();
  const apiModel = getModelConfig(modelId)?.id ?? modelId;
  const response = await chatCompletionsAdaptive(
    client,
    modelId,
    { model: apiModel, messages: messages as any },
    config,
    'max_completion_tokens'
  );
  return (response as any).choices?.[0]?.message?.content || '';
}

async function callAnthropicChat(
  modelId: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  config?: { maxOutputTokens?: number }
): Promise<string> {
  const client = getAnthropicClient();
  const apiModel = getModelConfig(modelId)?.id ?? modelId;

  // Anthropic takes the system prompt as a top-level parameter, not as a
  // message with role "system" — passing it inline would be rejected.
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const turns = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  // The API requires at least one message and the first must be from the user.
  if (turns.length === 0 || turns[0].role !== 'user') {
    turns.unshift({ role: 'user', content: 'Please continue.' });
  }

  const response = await tracked({ modelKey: modelId, operation: 'chat', feature: (config as LLMConfig | undefined)?.feature }, () => retryableProviderCall(() =>
    client.messages.create({
      model: apiModel,
      max_tokens: resolveTokenCap(config),
      ...(system ? { system } : {}),
      messages: turns,
    })
  ), r => usageFrom.anthropic(r.usage));

  if (response.stop_reason === 'refusal') {
    return "I can't help with that particular request. Try rephrasing, or switch to a different model.";
  }

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');
}

async function callAzureChat(
  modelId: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  config?: LLMConfig
): Promise<string> {
  const modelConfig = getModelConfig(modelId);
  if (!modelConfig) {
    throw new Error(`Model "${modelId}" is not registered. Check AI_MODELS env var.`);
  }

  const client = getAzureClient(modelConfig);
  const isInference = isInferenceEndpoint(modelConfig.endpoint || '');

  const response = await chatCompletionsAdaptive(
    client,
    modelId,
    {
      model: isInference ? modelConfig.id : modelConfig.deployment!,
      messages: messages as any[],
    },
    config,
    isInference ? 'max_tokens' : 'max_completion_tokens'
  );

  return (response as any).choices?.[0]?.message?.content || '';
}

async function callGeminiChat(
  modelId: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  config?: { temperature?: number; maxOutputTokens?: number; safetySettings?: Array<{ category: string; threshold: string }> }
): Promise<string> {
  const llmResponse = await tracked({ modelKey: modelId, operation: 'chat', feature: (config as LLMConfig | undefined)?.feature }, () => retryableAIGeneration(() =>
    ai.generate({
      prompt: messages.map(m => `${m.role}: ${m.content}`).join('\n') + '\nassistant:',
      model: googleAI.model(getModelConfig(modelId)?.id ?? modelId),
      config: {
        temperature: config?.temperature ?? 0.2,
        maxOutputTokens: config?.maxOutputTokens ?? 1400,
        safetySettings: config?.safetySettings,
      } as any,
    })
  ), (r: any) => usageFrom.gemini(r?.usage));

  return llmResponse.text || '';
}

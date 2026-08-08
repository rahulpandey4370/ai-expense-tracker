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
  if (input.receiptImageUri) {
    content.push({ type: 'image_url', image_url: { url: input.receiptImageUri } });
  }

  const response = await retryableProviderCall(() =>
    client.chat.completions.create({
      model: apiModel,
      messages: [{ role: 'user', content }] as any,
      response_format: { type: 'json_object' },
      temperature: config?.temperature,
      max_tokens: config?.maxOutputTokens,
      stream: false,
    } as any)
  );

  const raw = (response as any).choices?.[0]?.message?.content;
  if (!raw) throw new Error(`OpenAI (${modelId}) returned an empty response.`);
  return outputSchema.parse(JSON.parse(cleanJsonContent(raw)));
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
  if (image) {
    content.unshift({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType as any, data: image.data },
    });
  }

  // No temperature/top_p: the current Claude models reject them outright.
  const response = await retryableProviderCall(() =>
    client.messages.create({
      model: apiModel,
      max_tokens: config?.maxOutputTokens ?? DIRECT_MAX_TOKENS,
      system: 'You are a precise financial data extraction engine. You always reply with a single JSON object.',
      messages: [{ role: 'user', content }],
    })
  );

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
  return outputSchema.parse(JSON.parse(cleanJsonContent(raw)));
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
  const textPrompt = simpleTemplateRender(promptTemplate, input);

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

  const response = await retryableProviderCall(() =>
    client.chat.completions.create({
      model: isInference ? modelConfig.id : modelConfig.deployment!,
      messages: messages as any[],
      response_format: { type: 'json_object' },
      temperature: config?.temperature,
      max_tokens: config?.maxOutputTokens,
      stream: false,
    } as any)
  );

  const content = (response as any).choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`Azure OpenAI (${modelId}) returned an empty response.`);
  }

  const cleaned = cleanJsonContent(content);
  const parsed = JSON.parse(cleaned);
  return outputSchema.parse(parsed);
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
  const result = await retryableAIGeneration(() => prompt(input, { model: googleAI.model(geminiId) }));

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
  config?: { temperature?: number; maxOutputTokens?: number; safetySettings?: Array<{ category: string; threshold: string }> }
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

async function callOpenAIChat(
  modelId: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  _config?: { temperature?: number; maxOutputTokens?: number }
): Promise<string> {
  const client = getOpenAIClient();
  const apiModel = getModelConfig(modelId)?.id ?? modelId;
  const response = await retryableProviderCall(() =>
    client.chat.completions.create({ model: apiModel, messages: messages as any } as any)
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

  const response = await retryableProviderCall(() =>
    client.messages.create({
      model: apiModel,
      max_tokens: config?.maxOutputTokens ?? DIRECT_MAX_TOKENS,
      ...(system ? { system } : {}),
      messages: turns,
    })
  );

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
  _config?: { temperature?: number; maxOutputTokens?: number; safetySettings?: Array<{ category: string; threshold: string }> }
): Promise<string> {
  const modelConfig = getModelConfig(modelId);
  if (!modelConfig) {
    throw new Error(`Model "${modelId}" is not registered. Check AI_MODELS env var.`);
  }

  const client = getAzureClient(modelConfig);
  const isInference = isInferenceEndpoint(modelConfig.endpoint || '');

  const response = await retryableProviderCall(() =>
    client.chat.completions.create({
      model: isInference ? modelConfig.id : modelConfig.deployment!,
      messages: messages as any[],
    } as any)
  );

  return (response as any).choices?.[0]?.message?.content || '';
}

async function callGeminiChat(
  modelId: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  config?: { temperature?: number; maxOutputTokens?: number; safetySettings?: Array<{ category: string; threshold: string }> }
): Promise<string> {
  const llmResponse = await retryableAIGeneration(() =>
    ai.generate({
      prompt: messages.map(m => `${m.role}: ${m.content}`).join('\n') + '\nassistant:',
      model: googleAI.model(getModelConfig(modelId)?.id ?? modelId),
      config: {
        temperature: config?.temperature ?? 0.2,
        maxOutputTokens: config?.maxOutputTokens ?? 1400,
        safetySettings: config?.safetySettings,
      } as any,
    })
  );

  return llmResponse.text || '';
}

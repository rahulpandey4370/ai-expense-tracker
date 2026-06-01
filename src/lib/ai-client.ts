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
// Retry helpers for Azure
// ---------------------------------------------------------------------------
async function retryableAzureCall<T>(fn: () => Promise<T>, retries = 2, baseDelayMs = 1000): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorMessage = String(error?.message || '').toLowerCase();
      const status = error?.status || error?.cause?.status;

      if (errorMessage.includes('503') || errorMessage.includes('overloaded') || status === 503 || errorMessage.includes('service unavailable')) {
        if (i < retries) {
          const delayMs = baseDelayMs * (i + 1);
          console.warn(`Azure AI overloaded. Retrying attempt ${i + 2} of ${retries + 1} in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } else {
        throw error;
      }
    }
  }
  throw lastError || new Error('Azure AI call failed after retries.');
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

  if (provider === 'azure-openai') {
    return callAzureStructured(modelId, promptTemplate, input, outputSchema, config);
  }

  return callGeminiStructured(modelId, promptTemplate, input, outputSchema, config);
}

async function callAzureStructured<T extends ZodSchema>(
  modelId: string,
  promptTemplate: string,
  input: Record<string, any>,
  outputSchema: T,
  _config?: LLMConfig
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

  const response = await retryableAzureCall(() =>
    client.chat.completions.create({
      model: isInference ? modelConfig.id : modelConfig.deployment!,
      messages: messages as any[],
      response_format: { type: 'json_object' },
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

  const result = await retryableAIGeneration(() => prompt(input, { model: googleAI.model(modelId) }));

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

  if (provider === 'azure-openai') {
    return callAzureChat(modelId, messages, config);
  }

  return callGeminiChat(modelId, messages, config);
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

  const response = await retryableAzureCall(() =>
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
      model: googleAI.model(modelId),
      config: {
        temperature: config?.temperature ?? 0.2,
        maxOutputTokens: config?.maxOutputTokens ?? 1400,
        safetySettings: config?.safetySettings,
      } as any,
    })
  );

  return llmResponse.text || '';
}

/**
 * Dynamic AI model registry driven entirely by environment variables.
 *
 * Adding a new Azure AI Foundry model requires ZERO code changes.
 * Just add the model ID to the AI_MODELS env var and, if needed,
 * add per-model credentials (endpoint/key/deployment).
 *
 * Backward compatibility:
 * - If AI_MODELS is not set, falls back to AZURE_OPENAI_DEPLOYMENT_NAME
 *   plus the default Gemini models (preserving current behavior).
 * - Shared Azure credentials (AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY)
 *   are reused for any model that doesn't have per-model overrides.
 */

export interface ModelInfo {
  id: string;
  provider: 'azure-openai' | 'google-ai';
  /** Display label (optional) */
  label?: string;
  /** Resolved deployment name (Azure only) */
  deployment?: string;
  /** Resolved endpoint (Azure only) */
  endpoint?: string;
  /** Resolved API key (Azure only) */
  apiKey?: string;
  /** Resolved API version (Azure only) */
  apiVersion?: string;
}

const DEFAULT_GEMINI_MODELS: ModelInfo[] = [
  { id: 'gemini-3-flash-preview', provider: 'google-ai' },
  { id: 'gemini-2.5-flash', provider: 'google-ai' },
  { id: 'gemini-2.5-flash-lite', provider: 'google-ai' },
];

/**
 * Normalize a model ID into an env-var-safe suffix.
 * e.g. "gpt-5.4"   → "GPT_5_4"
 *      "deepseek-r1" → "DEEPSEEK_R1"
 *      "kimi-k2.6"   → "KIMI_K2_6"
 */
function normalizeEnvSuffix(id: string): string {
  return id
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildAzureModelInfo(id: string): ModelInfo {
  const suffix = normalizeEnvSuffix(id);

  // 1. Try per-model overrides
  const perModelEndpoint = process.env[`AI_MODEL_${suffix}_ENDPOINT`];
  const perModelKey = process.env[`AI_MODEL_${suffix}_API_KEY`];
  const perModelDeployment = process.env[`AI_MODEL_${suffix}_DEPLOYMENT`];

  // 2. Fall back to shared Azure credentials
  const endpoint = perModelEndpoint || process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = perModelKey || process.env.AZURE_OPENAI_API_KEY;

  // 3. Resolve deployment name
  let deployment = perModelDeployment;
  if (!deployment) {
    const legacyDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
    // Backward compat: if model id matches the legacy deployment name, use it
    if (id === legacyDeployment) {
      deployment = legacyDeployment;
    } else {
      deployment = id;
    }
  }

  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview';

  return {
    id,
    provider: 'azure-openai',
    deployment,
    endpoint,
    apiKey,
    apiVersion,
  };
}

/**
 * Get all models currently configured for the application.
 * Gemini models are always present. Azure models come from AI_MODELS env var.
 */
export function getAvailableModels(): ModelInfo[] {
  const models: ModelInfo[] = [...DEFAULT_GEMINI_MODELS];

  const customModelsRaw = process.env.AI_MODELS;
  if (customModelsRaw) {
    const ids = customModelsRaw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    for (const id of ids) {
      // Skip if already a known Gemini model
      if (DEFAULT_GEMINI_MODELS.some(m => m.id === id)) continue;
      models.push(buildAzureModelInfo(id));
    }
  } else {
    // Backward compatibility: no AI_MODELS set → use legacy single Azure deployment
    const legacyDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
    if (legacyDeployment && !DEFAULT_GEMINI_MODELS.some(m => m.id === legacyDeployment)) {
      models.push(buildAzureModelInfo(legacyDeployment));
    }
  }

  return models;
}

/**
 * Get configuration for a specific model ID.
 */
export function getModelConfig(id: string): ModelInfo | undefined {
  return getAvailableModels().find(m => m.id === id);
}

/**
 * Check if a model ID is valid (registered).
 */
export function isValidModel(id: string): boolean {
  return getAvailableModels().some(m => m.id === id);
}

/**
 * Detect the provider for a given model ID.
 */
export function detectProvider(id: string): 'azure-openai' | 'google-ai' {
  const config = getModelConfig(id);
  if (config) return config.provider;
  // Fallback heuristic: anything starting with "gemini-" is Google
  if (id.startsWith('gemini-')) return 'google-ai';
  // Everything else we assume is Azure (better for forward compatibility)
  return 'azure-openai';
}

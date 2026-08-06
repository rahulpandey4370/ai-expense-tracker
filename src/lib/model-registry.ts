import { resolveCatalog, isProviderConfigured, type ModelTag } from '@/lib/model-catalog';

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

export type AIProvider = 'azure-openai' | 'google-ai' | 'openai' | 'anthropic';

export interface ModelInfo {
  /**
   * Globally unique, provider-qualified identifier — `"<provider>::<id>"`.
   *
   * The same model id can legitimately exist on two providers at once: an
   * Azure deployment named `gpt-5.4` and the first-party OpenAI `gpt-5.4` are
   * different endpoints with different billing. Selection and routing key off
   * this, so having both is no longer ambiguous.
   */
  key: string;
  /** The id sent to the provider's API. Not unique across providers. */
  id: string;
  provider: AIProvider;
  /** Display label (optional) */
  label?: string;
  /** Pills shown in the picker: "Most capable", "Cheapest", … */
  tags?: ModelTag[];
  /** USD per million tokens, when known — powers the picker's cost hint. */
  inputPerMTok?: number;
  outputPerMTok?: number;
  contextWindow?: number;
  notes?: string;
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
  { key: 'google-ai::gemini-3-flash-preview', id: 'gemini-3-flash-preview', provider: 'google-ai' },
  { key: 'google-ai::gemini-2.5-flash', id: 'gemini-2.5-flash', provider: 'google-ai' },
  { key: 'google-ai::gemini-2.5-flash-lite', id: 'gemini-2.5-flash-lite', provider: 'google-ai' },
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
    key: `azure-openai::${id}`,
    id,
    provider: 'azure-openai',
    label: id,
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

  // Direct OpenAI / Anthropic. Listed only when the provider's key is set, so
  // the picker never offers a model that is guaranteed to fail on click.
  for (const provider of ['anthropic', 'openai'] as const) {
    if (!isProviderConfigured(provider)) continue;
    for (const m of resolveCatalog(provider)) {
      models.push({
        key: `${provider}::${m.id}`,
        id: m.id,
        provider,
        label: m.label,
        tags: m.tags,
        inputPerMTok: m.inputPerMTok,
        outputPerMTok: m.outputPerMTok,
        contextWindow: m.contextWindow,
        notes: m.notes,
        apiKey: provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY,
      });
    }
  }

  const customModelsRaw = process.env.AI_MODELS;
  if (customModelsRaw) {
    const ids = customModelsRaw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    for (const id of ids) {
      // Gemini ids are served by Google, never by Azure — those genuinely are
      // the same model and must not be double-registered.
      if (DEFAULT_GEMINI_MODELS.some(m => m.id === id)) continue;
      // Everything else in AI_MODELS is an Azure deployment and is registered
      // even when a first-party model shares its id. An Azure `gpt-5.4`
      // deployment is a separate endpoint with separate billing (often free
      // credits) — deduping it away silently removed a working, cheaper
      // option from the picker.
      if (models.some(m => m.key === `azure-openai::${id}`)) continue;
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
 * Resolve a model from either a provider-qualified key (`"openai::gpt-5.4"`)
 * or a bare id (`"gpt-5.4"`).
 *
 * The bare-id path exists for values that predate keys: a persisted UI choice,
 * `AI_DEFAULT_MODEL`, or a per-task override like `AI_TASK_CHAT=gpt-5.4`. When
 * a bare id is ambiguous we prefer the Azure deployment, because AI_MODELS is
 * an explicit, user-authored list while the direct catalogs are defaults this
 * app ships — an id you went out of your way to configure should win.
 */
export function getModelConfig(idOrKey: string): ModelInfo | undefined {
  const models = getAvailableModels();
  const exact = models.find(m => m.key === idOrKey);
  if (exact) return exact;
  const matches = models.filter(m => m.id === idOrKey);
  if (matches.length <= 1) return matches[0];
  return matches.find(m => m.provider === 'azure-openai') ?? matches[0];
}

/** The subset of ModelInfo that is safe to send to the browser. */
export interface PublicModelInfo {
  key: string;
  id: string;
  provider: AIProvider;
  label?: string;
  tags?: ModelTag[];
  inputPerMTok?: number;
  outputPerMTok?: number;
  contextWindow?: number;
  notes?: string;
}

/**
 * Models with every credential stripped.
 *
 * `getAvailableModels()` carries resolved `apiKey` / `endpoint` values. Passing
 * that array into a client component serializes it into the HTML payload, which
 * would publish the keys to anyone who views source. Always hand the UI this.
 */
export function getPublicModels(): PublicModelInfo[] {
  return getAvailableModels().map(({ key, id, provider, label, tags, inputPerMTok, outputPerMTok, contextWindow, notes }) => ({
    key, id, provider, label, tags, inputPerMTok, outputPerMTok, contextWindow, notes,
  }));
}

/**
 * Check if a model ID is valid (registered).
 */
export function isValidModel(idOrKey: string): boolean {
  return getModelConfig(idOrKey) !== undefined;
}

/**
 * Detect the provider for a given model ID.
 */
export function detectProvider(idOrKey: string): AIProvider {
  const config = getModelConfig(idOrKey);
  if (config) return config.provider;

  // Explicit prefix wins even if the model isn't registered.
  const [maybeProvider] = idOrKey.split('::');
  if (maybeProvider !== idOrKey) {
    if (maybeProvider === 'openai' || maybeProvider === 'anthropic'
      || maybeProvider === 'google-ai' || maybeProvider === 'azure-openai') {
      return maybeProvider;
    }
  }

  // Fallbacks by id shape, for models not in the registry (e.g. a task-level
  // env override naming something that wasn't registered).
  if (idOrKey.startsWith('gemini-')) return 'google-ai';
  if (idOrKey.startsWith('claude-')) return 'anthropic';
  // Everything else we assume is Azure (better for forward compatibility).
  return 'azure-openai';
}

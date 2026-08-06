/**
 * Curated catalog of first-party OpenAI and Anthropic models.
 *
 * The app already supports Azure OpenAI and Google Gemini. This adds the two
 * providers you can hit directly with nothing but an API key.
 *
 * Only models whose provider key is present in the environment are offered in
 * the UI — no dead entries in the picker for a provider you haven't configured.
 *
 * OVERRIDING THE LIST: model line-ups move faster than this file will. Set
 * `OPENAI_MODELS` / `ANTHROPIC_MODELS` (comma-separated ids) to replace the
 * defaults below wholesale, or `AI_EXTRA_OPENAI_MODELS` /
 * `AI_EXTRA_ANTHROPIC_MODELS` to append to them.
 */

export type CatalogProvider = 'openai' | 'anthropic';

/** Shown as a pill in the model picker so the tradeoff is visible at a glance. */
export type ModelTag = 'flagship' | 'balanced' | 'cheap' | 'fast' | 'reasoning' | 'legacy';

export interface CatalogModel {
  id: string;
  provider: CatalogProvider;
  label: string;
  tags: ModelTag[];
  /** USD per million input / output tokens, for the picker's cost hint. */
  inputPerMTok?: number;
  outputPerMTok?: number;
  contextWindow?: number;
  notes?: string;
}

/**
 * Anthropic — ids, pricing and context windows per the Claude platform docs.
 * These are exact strings with no date suffix; do not append one.
 */
export const ANTHROPIC_CATALOG: CatalogModel[] = [
  {
    id: 'claude-opus-5',
    provider: 'anthropic',
    label: 'Claude Opus 5',
    tags: ['flagship', 'reasoning'],
    inputPerMTok: 5, outputPerMTok: 25, contextWindow: 1_000_000,
    notes: 'Best for deep analysis and long financial reports.',
  },
  {
    id: 'claude-sonnet-5',
    provider: 'anthropic',
    label: 'Claude Sonnet 5',
    tags: ['balanced'],
    inputPerMTok: 3, outputPerMTok: 15, contextWindow: 1_000_000,
    notes: 'Near-Opus quality at Sonnet cost. Good default.',
  },
  {
    id: 'claude-haiku-4-5',
    provider: 'anthropic',
    label: 'Claude Haiku 4.5',
    tags: ['cheap', 'fast'],
    inputPerMTok: 1, outputPerMTok: 5, contextWindow: 200_000,
    notes: 'Cheapest and fastest — ideal for transaction parsing.',
  },
  {
    id: 'claude-opus-4-8',
    provider: 'anthropic',
    label: 'Claude Opus 4.8',
    tags: ['reasoning'],
    inputPerMTok: 5, outputPerMTok: 25, contextWindow: 1_000_000,
    notes: 'Previous-generation Opus.',
  },
  {
    id: 'claude-fable-5',
    provider: 'anthropic',
    label: 'Claude Fable 5',
    tags: ['flagship', 'reasoning'],
    inputPerMTok: 10, outputPerMTok: 50, contextWindow: 1_000_000,
    notes: 'Most capable, highest cost. Requires 30-day data retention.',
  },
];

/**
 * OpenAI — direct API (not Azure).
 *
 * Model line-ups here change often; treat this as a starting point and use
 * `OPENAI_MODELS` to pin exactly what your account can serve. An id your key
 * can't access simply fails at call time with OpenAI's own 404.
 */
export const OPENAI_CATALOG: CatalogModel[] = [
  // --- GPT-5.6 (current generation, GA 2026-07-09) -------------------------
  // Three named tiers rather than the mini/nano suffix scheme. Prices are the
  // short-context rates; long-context input bills at roughly double.
  {
    id: 'gpt-5.6-sol',
    provider: 'openai',
    label: 'GPT-5.6 Sol',
    tags: ['flagship', 'reasoning'],
    inputPerMTok: 5, outputPerMTok: 30, contextWindow: 1_050_000,
    notes: 'Current flagship. Best for deep analysis and long reports.',
  },
  {
    id: 'gpt-5.6-terra',
    provider: 'openai',
    label: 'GPT-5.6 Terra',
    tags: ['balanced'],
    inputPerMTok: 2, outputPerMTok: 12, contextWindow: 1_050_000,
    notes: 'Balanced tier. Good default for most flows.',
  },
  {
    id: 'gpt-5.6-luna',
    provider: 'openai',
    label: 'GPT-5.6 Luna',
    tags: ['cheap', 'fast'],
    inputPerMTok: 0.2, outputPerMTok: 1.2, contextWindow: 1_050_000,
    notes: 'Cheapest and fastest — ideal for transaction and receipt parsing.',
  },

  // --- GPT-5.5 -------------------------------------------------------------
  // No longer on OpenAI's published pricing page, but still served.
  {
    id: 'gpt-5.5-pro',
    provider: 'openai',
    label: 'GPT-5.5 Pro',
    tags: ['reasoning'],
    inputPerMTok: 30, outputPerMTok: 180, contextWindow: 272_000,
    notes: 'Very high cost. Only for the hardest one-off analysis.',
  },
  {
    id: 'gpt-5.5',
    provider: 'openai',
    label: 'GPT-5.5',
    tags: ['legacy'],
    inputPerMTok: 5, outputPerMTok: 30, contextWindow: 272_000,
    notes: 'Previous generation; superseded by GPT-5.6 Sol at the same price.',
  },

  // --- GPT-5.4 -------------------------------------------------------------
  {
    id: 'gpt-5.4-pro',
    provider: 'openai',
    label: 'GPT-5.4 Pro',
    tags: ['reasoning'],
    inputPerMTok: 30, outputPerMTok: 180,
    notes: 'Highest-capability 5.4 tier. Slow and expensive.',
  },
  {
    id: 'gpt-5.4',
    provider: 'openai',
    label: 'GPT-5.4',
    tags: ['legacy'],
    inputPerMTok: 2.5, outputPerMTok: 15,
    notes: 'Previous-generation general-purpose model.',
  },
  {
    id: 'gpt-5.4-mini',
    provider: 'openai',
    label: 'GPT-5.4 mini',
    tags: ['fast'],
    inputPerMTok: 0.75, outputPerMTok: 4.5,
    notes: 'Cheaper, faster sibling of GPT-5.4.',
  },
  {
    id: 'gpt-5.4-nano',
    provider: 'openai',
    label: 'GPT-5.4 nano',
    tags: ['cheap', 'fast'],
    inputPerMTok: 0.2, outputPerMTok: 1.25,
    notes: 'Cheap parsing tier from the 5.4 generation.',
  },
  {
    id: 'o4-mini',
    provider: 'openai',
    label: 'o4-mini',
    tags: ['reasoning', 'cheap'],
    inputPerMTok: 1.1, outputPerMTok: 4.4,
    notes: 'Reasoning-optimised, cost-efficient.',
  },
];

export const TAG_LABELS: Record<ModelTag, string> = {
  flagship: 'Most capable',
  balanced: 'Balanced',
  cheap: 'Cheapest',
  fast: 'Fastest',
  reasoning: 'Reasoning',
  legacy: 'Older',
};

function parseIds(raw: string | undefined): string[] {
  return (raw ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Resolve the catalog for a provider, honouring the env overrides.
 * Ids not in the curated list still work — they're returned with the id as the
 * label so a brand-new model can be used the day it ships, no code change.
 */
export function resolveCatalog(provider: CatalogProvider): CatalogModel[] {
  const base = provider === 'anthropic' ? ANTHROPIC_CATALOG : OPENAI_CATALOG;
  const overrideEnv = provider === 'anthropic' ? process.env.ANTHROPIC_MODELS : process.env.OPENAI_MODELS;
  const extraEnv = provider === 'anthropic' ? process.env.AI_EXTRA_ANTHROPIC_MODELS : process.env.AI_EXTRA_OPENAI_MODELS;

  const known = new Map(base.map(m => [m.id, m]));
  const toModel = (id: string): CatalogModel =>
    known.get(id) ?? { id, provider, label: id, tags: [] };

  const override = parseIds(overrideEnv);
  const list = override.length > 0 ? override.map(toModel) : [...base];

  for (const id of parseIds(extraEnv)) {
    if (!list.some(m => m.id === id)) list.push(toModel(id));
  }
  return list;
}

/** True when the provider has a usable API key configured. */
export function isProviderConfigured(provider: CatalogProvider): boolean {
  const key = provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
  return Boolean(key && key.trim());
}

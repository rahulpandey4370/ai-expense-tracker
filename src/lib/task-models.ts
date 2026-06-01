/**
 * Task-to-default-model resolver.
 *
 * Each AI flow/use-case in the app can have its own default model
 * configured via an environment variable. This lets you use a cheap,
 * fast model for simple tasks (e.g. transaction parsing) and a more
 * capable model for complex tasks (e.g. financial reports) without
 * changing any code.
 *
 * Priority chain for model selection:
 *   1. User override (passed from UI / localStorage per task)
 *   2. Task-specific env var (e.g. AI_TASK_CHAT=gpt-5.4)
 *   3. Global default env var (AI_DEFAULT_MODEL)
 *   4. Legacy Azure deployment name (AZURE_OPENAI_DEPLOYMENT_NAME)
 *   5. Ultimate fallback env var (AI_FALLBACK_MODEL)
 *   6. Hardcoded safe fallback (gpt-5.4)
 */

export type AITask =
  | 'transaction_parsing'
  | 'receipt_parsing'
  | 'recurring_rule_parsing'
  | 'savings_allocation_parsing'
  | 'portfolio_entry_parsing'
  | 'chat'
  | 'portfolio_chat'
  | 'insights'
  | 'monthly_report'
  | 'yearly_report'
  | 'health_check'
  | 'budgeting'
  | 'goal_forecast'
  | 'fixed_expenses'
  | 'comparative_analysis'
  | 'opportunity_cost'
  | 'savings_kpis'
  | 'investment_summary'
  | 'investment_analyzer';

const TASK_ENV_MAP: Record<AITask, string> = {
  transaction_parsing: 'AI_TASK_TRANSACTION_PARSING',
  receipt_parsing: 'AI_TASK_RECEIPT_PARSING',
  recurring_rule_parsing: 'AI_TASK_RECURRING_RULE_PARSING',
  savings_allocation_parsing: 'AI_TASK_SAVINGS_ALLOCATION_PARSING',
  portfolio_entry_parsing: 'AI_TASK_PORTFOLIO_ENTRY_PARSING',
  chat: 'AI_TASK_CHAT',
  portfolio_chat: 'AI_TASK_PORTFOLIO_CHAT',
  insights: 'AI_TASK_INSIGHTS',
  monthly_report: 'AI_TASK_MONTHLY_REPORT',
  yearly_report: 'AI_TASK_YEARLY_REPORT',
  health_check: 'AI_TASK_HEALTH_CHECK',
  budgeting: 'AI_TASK_BUDGETING',
  goal_forecast: 'AI_TASK_GOAL_FORECAST',
  fixed_expenses: 'AI_TASK_FIXED_EXPENSES',
  comparative_analysis: 'AI_TASK_COMPARATIVE_ANALYSIS',
  opportunity_cost: 'AI_TASK_OPPORTUNITY_COST',
  savings_kpis: 'AI_TASK_SAVINGS_KPIS',
  investment_summary: 'AI_TASK_INVESTMENT_SUMMARY',
  investment_analyzer: 'AI_TASK_INVESTMENT_ANALYZER',
};

/**
 * Resolve the default model ID for a given AI task.
 *
 * @param task - The AI task key.
 * @returns A model ID string guaranteed to be non-empty.
 */
export function getDefaultModelForTask(task: AITask): string {
  // 1. Task-specific override
  const taskEnv = TASK_ENV_MAP[task];
  if (taskEnv && process.env[taskEnv]) {
    return process.env[taskEnv]!;
  }

  // 2. Global default
  if (process.env.AI_DEFAULT_MODEL) {
    return process.env.AI_DEFAULT_MODEL;
  }

  // 3. Legacy Azure deployment (backward compat)
  if (process.env.AZURE_OPENAI_DEPLOYMENT_NAME) {
    return process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  }

  // 4. Ultimate fallback env var
  if (process.env.AI_FALLBACK_MODEL) {
    return process.env.AI_FALLBACK_MODEL;
  }

  // 5. Hardcoded safe fallback
  return 'gpt-5.4';
}

/**
 * Get the fallback model that should be used when a task-specific
 * or globally selected model is invalid / unavailable.
 */
export function getUltimateFallbackModel(): string {
  return process.env.AI_FALLBACK_MODEL || process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-5.4';
}

# Multi-Model Azure AI Foundry Setup Guide

This document explains how to add, configure, and manage multiple AI models hosted on Azure AI Foundry (and/or Google Gemini) for this application — **without changing any code**.

> **Key principle:** After the initial code changes, adding or removing models only requires updating environment variables in Vercel (or `.env.local` for local testing).

---

## Table of Contents

1. [How It Works](#how-it-works)
2. [Environment Variables](#environment-variables)
3. [Adding a New Model](#adding-a-new-model)
4. [Removing a Model](#removing-a-model)
5. [Task-Specific Model Assignment](#task-specific-model-assignment)
6. [Local Development](#local-development)
7. [Vercel Production Deployment](#vercel-production-deployment)
8. [Naming Convention](#naming-convention)
9. [Troubleshooting](#troubleshooting)

---

## How It Works

The application uses a **dynamic model registry** driven entirely by environment variables:

- **`AI_MODELS`** — A comma-separated list of all model IDs you want available
- Default Gemini models (`gemini-3-flash-preview`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`) are **auto-included** — you do not need to list them
- Any model ID that starts with `gemini-` is automatically routed to Google AI (Genkit)
- Every other model ID is treated as an **Azure OpenAI deployment**

### Provider Detection

| Model ID Pattern | Provider | Client Used |
|------------------|----------|-------------|
| `gemini-*` | Google AI | Genkit (googleAI) |
| Anything else | Azure OpenAI | AzureOpenAI SDK or standard OpenAI SDK |

### Azure Endpoint Types

Azure AI Foundry hosts models through **two different endpoint styles**. The code auto-detects which one to use based on the URL you provide:

| Endpoint Style | URL Pattern | SDK Used | Which Models |
|---------------|-------------|----------|--------------|
| **Azure OpenAI Service** | `https://...services.ai.azure.com` (base origin, no `/models` path) | `AzureOpenAI` | GPT-4, GPT-5, etc. |
| **Azure AI Model Inference** | `https://...services.ai.azure.com/models` | Standard `OpenAI` with `baseURL` | DeepSeek, Llama, Mistral, etc. |

**What URL to paste:**
- For **GPT models** (Azure OpenAI Service): paste the **base origin** only, e.g. `https://rahul-mbuwblo6-eastus2.services.ai.azure.com`
  - Even if the Azure portal shows a longer URL like `.../openai/v1/responses`, just paste the origin part. The SDK appends the correct `/openai/deployments/{name}/chat/completions` path automatically.
- For **non-GPT models** (Inference API): paste the full inference base URL, e.g. `https://rahul-hub.eastus2.services.ai.azure.com/models`
  - The code detects `/models` in the path and uses the inference client, which preserves the full base URL.

### Model Selection Priority (per AI task)

When a user triggers an AI flow (e.g., "Generate Monthly Report"), the app resolves the model in this order:

1. **User override** — Per-task model preference stored in localStorage
2. **Task-specific env var** — e.g., `AI_TASK_MONTHLY_REPORT=kimi-k2.6`
3. **Global default** — `AI_DEFAULT_MODEL`
4. **Legacy fallback** — `AZURE_OPENAI_DEPLOYMENT_NAME`
5. **Ultimate fallback** — `AI_FALLBACK_MODEL`
6. **Hardcoded safe default** — `gpt-5.4`

---

## Environment Variables

### Required (existing)

These are your current credentials and must remain set:

```bash
# Google Gemini API Key
GEMINI_API_KEY=AIzaSyDBIW2t4EFbb_cnudRf7Y7hChiSVjIoJxY

# Shared Azure OpenAI credentials (your original resource)
# For Azure OpenAI Service endpoints, paste ONLY the base origin:
#   Correct:   https://rahul-mbuwblo6-eastus2.services.ai.azure.com
#   Incorrect: https://rahul-mbuwblo6-eastus2.services.ai.azure.com/openai/v1/responses
AZURE_OPENAI_ENDPOINT=https://rahul-mbuwblo6-eastus2.services.ai.azure.com
AZURE_OPENAI_API_KEY=your-azure-openai-api-key-here
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-5.4
NEXT_PUBLIC_AZURE_OPENAI_DEPLOYMENT_NAME=gpt-5.4
```

### New Registry Variables

```bash
# Comma-separated list of Azure-hosted model IDs.
# Gemini models are auto-included, so only list non-Gemini ones.
# Example: gpt-5.4,deepseek-r1,kimi-k2.6,grok-4.3,llama-4
AI_MODELS=gpt-5.4

# Global default when no task-specific default is set
AI_DEFAULT_MODEL=gpt-5.4

# Ultimate fallback when nothing else resolves
AI_FALLBACK_MODEL=gpt-5.4
```

### Task-Specific Defaults (optional but recommended)

Each AI flow in the app has a task key. You can assign a default model per task:

```bash
# Parsing tasks (cheap, fast)
AI_TASK_TRANSACTION_PARSING=gemini-3-flash-preview
AI_TASK_RECEIPT_PARSING=gemini-3-flash-preview
AI_TASK_RECURRING_RULE_PARSING=gemini-3-flash-preview
AI_TASK_SAVINGS_ALLOCATION_PARSING=gemini-3-flash-preview
AI_TASK_PORTFOLIO_ENTRY_PARSING=gemini-3-flash-preview

# Chat tasks (balanced)
AI_TASK_CHAT=gpt-5.4
AI_TASK_PORTFOLIO_CHAT=gpt-5.4

# Analysis tasks (capable)
AI_TASK_INSIGHTS=gpt-5.4
AI_TASK_MONTHLY_REPORT=gpt-5.4
AI_TASK_YEARLY_REPORT=gpt-5.4
AI_TASK_HEALTH_CHECK=gpt-5.4
AI_TASK_BUDGETING=gpt-5.4

# Other tasks
AI_TASK_GOAL_FORECAST=gemini-3-flash-preview
AI_TASK_FIXED_EXPENSES=gemini-3-flash-preview
AI_TASK_COMPARATIVE_ANALYSIS=gemini-3-flash-preview
AI_TASK_OPPORTUNITY_COST=gemini-3-flash-preview
AI_TASK_SAVINGS_KPIS=gemini-3-flash-preview
```

### Per-Model Azure Credentials (only if different resource)

Only add these if a model is hosted in a **different Azure resource** than your shared `AZURE_OPENAI_ENDPOINT`.

```bash
# Naming: AI_MODEL_<UPPERCASE_ID_WITH_UNDERSCORES>_<FIELD>

# Example: deepseek-r1 in a separate Azure resource
AI_MODEL_DEEPSEEK_R1_ENDPOINT=https://deepseek-project.eastus2.services.ai.azure.com
AI_MODEL_DEEPSEEK_R1_API_KEY=your-deepseek-api-key-here
AI_MODEL_DEEPSEEK_R1_DEPLOYMENT=deepseek-r1

# Example: kimi-k2.6 in a separate Azure resource
AI_MODEL_KIMI_K2_6_ENDPOINT=https://kimi-project.westus2.services.ai.azure.com
AI_MODEL_KIMI_K2_6_API_KEY=your-kimi-api-key-here
AI_MODEL_KIMI_K2_6_DEPLOYMENT=kimi-k2.6

# Example: grok-4.3 in a separate Azure resource
AI_MODEL_GROK_4_3_ENDPOINT=https://grok-project.southcentralus.services.ai.azure.com
AI_MODEL_GROK_4_3_API_KEY=your-grok-api-key-here
AI_MODEL_GROK_4_3_DEPLOYMENT=grok-4.3

# Example: llama-4 in a separate Azure resource
AI_MODEL_LLAMA_4_ENDPOINT=https://llama-project.centralus.services.ai.azure.com
AI_MODEL_LLAMA_4_API_KEY=your-llama-api-key-here
AI_MODEL_LLAMA_4_DEPLOYMENT=llama-4
```

---

## Adding a New Model

### Example: Add `deepseek-r1`

**Scenario:** You just deployed `deepseek-r1` on Azure AI Foundry in a **different resource** than your shared one.

### Step 1: Local Testing

Edit `.env.local` in the project root (create it if it does not exist):

```bash
AI_MODELS=gpt-5.4,deepseek-r1

AI_MODEL_DEEPSEEK_R1_ENDPOINT=https://deepseek-project.eastus2.services.ai.azure.com
AI_MODEL_DEEPSEEK_R1_API_KEY=your-real-key-here
AI_MODEL_DEEPSEEK_R1_DEPLOYMENT=deepseek-r1

# Optional: use it for a specific task
AI_TASK_INSIGHTS=deepseek-r1
```

### Step 2: Run locally

```bash
npm run dev
```

Open `http://localhost:9002` and click the model selector (bot icon, top-right). You should see:

- **Google Gemini:** `gemini-3-flash-preview`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`
- **Azure OpenAI:** `gpt-5.4`, `deepseek-r1`

### Step 3: Deploy to Vercel

Go to [vercel.com](https://vercel.com) → your project → **Settings** → **Environment Variables**

Add each new variable:

| Key | Value |
|-----|-------|
| `AI_MODELS` | `gpt-5.4,deepseek-r1` |
| `AI_MODEL_DEEPSEEK_R1_ENDPOINT` | `https://deepseek-project.eastus2.services.ai.azure.com` |
| `AI_MODEL_DEEPSEEK_R1_API_KEY` | `your-real-key-here` |
| `AI_MODEL_DEEPSEEK_R1_DEPLOYMENT` | `deepseek-r1` |
| `AI_TASK_INSIGHTS` | `deepseek-r1` |

Click **Save**. Vercel auto-deploys.

> **Important:** If the model lives in the **same Azure resource** as `gpt-5.4`, you only need to add it to `AI_MODELS`. It will inherit `AZURE_OPENAI_ENDPOINT` and `AZURE_OPENAI_API_KEY` automatically.

---

## Removing a Model

### Example: Remove `grok-4.3`

### Step 1: Edit `.env.local` (local)

Before:
```bash
AI_MODELS=gpt-5.4,deepseek-r1,kimi-k2.6,grok-4.3,llama-4
```

After:
```bash
AI_MODELS=gpt-5.4,deepseek-r1,kimi-k2.6,llama-4
```

### Step 2: Edit Vercel Environment Variables

Remove `grok-4.3` from the `AI_MODELS` value. You can optionally delete the `AI_MODEL_GROK_4_3_*` variables for tidiness, but leaving them does not cause errors — they are simply ignored.

### What happens to users who had `grok-4.3` selected?

The app gracefully falls back: `isValidModel('grok-4.3')` returns `false`, so the app uses the next available model in the registry. No crash.

---

## Task-Specific Model Assignment

You can use different models for different AI flows. This lets you save money by using cheaper models for simple tasks and powerful models for complex analysis.

### Current Task Keys

| Task Key | AI Flow | Suggested Default |
|----------|---------|-------------------|
| `transaction_parsing` | Parse text into transactions | Cheap/fast |
| `receipt_parsing` | Parse receipt images | Cheap/fast |
| `recurring_rule_parsing` | Parse recurring rules | Cheap/fast |
| `savings_allocation_parsing` | Parse savings commands | Cheap/fast |
| `portfolio_entry_parsing` | Parse portfolio entries | Cheap/fast |
| `chat` | Financial chatbot | Balanced |
| `portfolio_chat` | Portfolio chatbot | Balanced |
| `insights` | Spending insights | Capable |
| `monthly_report` | Monthly financial report | Capable |
| `yearly_report` | Yearly financial report | Capable |
| `health_check` | Financial health check | Balanced |
| `budgeting` | Budget planner | Balanced |
| `goal_forecast` | Goal forecaster | Balanced |
| `fixed_expenses` | Fixed expense analyzer | Balanced |
| `comparative_analysis` | Comparative expense analysis | Balanced |
| `opportunity_cost` | Opportunity cost analyzer | Cheap/fast |
| `savings_kpis` | Savings smart KPIs | Balanced |

---

## Local Development

### Creating `.env.local`

1. Create a file named exactly `.env.local` in the project root (same folder as `package.json`)
2. Copy the contents from `.env` as a starting point
3. Add the new registry variables

The file `/.env.local` is **gitignored** by default (`.env*` pattern is in `.gitignore`), so your API keys stay private.

### Running locally

```bash
# Start the dev server
npm run dev

# Open in browser
open http://localhost:9002
```

The model selector (bot icon, top-right) will show all registered models.

---

## Vercel Production Deployment

### Method 1: One-by-One (good for testing)

1. Go to [vercel.com](https://vercel.com)
2. Select your project
3. Click **Settings** tab
4. Click **Environment Variables** in the left sidebar
5. Add each variable:
   - **Key:** `AI_MODELS`
   - **Value:** `gpt-5.4` (or your comma-separated list)
   - **Environment:** `Production`
6. Click **Save**
7. Vercel triggers a new deployment automatically

### Method 2: Bulk Import (recommended)

1. Go to [vercel.com](https://vercel.com) → your project → **Settings** → **Environment Variables**
2. Click **Bulk Import** (or switch to text area view)
3. Paste the entire content of your `.env.local` file:
   ```
   AI_MODELS=gpt-5.4,deepseek-r1,kimi-k2.6
   AI_DEFAULT_MODEL=gpt-5.4
   AI_FALLBACK_MODEL=gpt-5.4
   AI_TASK_INSIGHTS=deepseek-r1
   AI_MODEL_DEEPSEEK_R1_ENDPOINT=https://deepseek-project.eastus2.services.ai.azure.com
   AI_MODEL_DEEPSEEK_R1_API_KEY=your-key-here
   AI_MODEL_DEEPSEEK_R1_DEPLOYMENT=deepseek-r1
   ```
4. Select **Production** (and optionally Preview/Development)
5. Click **Save**
6. Vercel parses all key-value pairs and triggers a deployment

### Verify the deployment

1. Open the deployed URL
2. Click the model selector (bot icon)
3. All models from `AI_MODELS` should appear under "Azure OpenAI"
4. All Gemini models should appear under "Google Gemini"

---

## Naming Convention

### Per-Model Environment Variable Naming

```
AI_MODEL_<UPPERCASE_ID_WITH_UNDERSCORES>_<FIELD>
```

**Transformation rules:**
1. Convert the model ID to **UPPERCASE**
2. Replace any non-alphanumeric character (dots, dashes, slashes, spaces) with **underscore `_`**
3. Strip leading/trailing underscores

### Examples

| Model ID | `_ENDPOINT` suffix | `_API_KEY` suffix | `_DEPLOYMENT` suffix |
|----------|-------------------|-------------------|---------------------|
| `gpt-5.4` | `AI_MODEL_GPT_5_4_ENDPOINT` | `AI_MODEL_GPT_5_4_API_KEY` | `AI_MODEL_GPT_5_4_DEPLOYMENT` |
| `deepseek-r1` | `AI_MODEL_DEEPSEEK_R1_ENDPOINT` | `AI_MODEL_DEEPSEEK_R1_API_KEY` | `AI_MODEL_DEEPSEEK_R1_DEPLOYMENT` |
| `kimi-k2.6` | `AI_MODEL_KIMI_K2_6_ENDPOINT` | `AI_MODEL_KIMI_K2_6_API_KEY` | `AI_MODEL_KIMI_K2_6_DEPLOYMENT` |
| `grok-4.3` | `AI_MODEL_GROK_4_3_ENDPOINT` | `AI_MODEL_GROK_4_3_API_KEY` | `AI_MODEL_GROK_4_3_DEPLOYMENT` |
| `llama-4` | `AI_MODEL_LLAMA_4_ENDPOINT` | `AI_MODEL_LLAMA_4_API_KEY` | `AI_MODEL_LLAMA_4_DEPLOYMENT` |
| `my-custom-model.v2` | `AI_MODEL_MY_CUSTOM_MODEL_V2_ENDPOINT` | `AI_MODEL_MY_CUSTOM_MODEL_V2_API_KEY` | `AI_MODEL_MY_CUSTOM_MODEL_V2_DEPLOYMENT` |

---

## Troubleshooting

### Model does not appear in the selector

- Check `AI_MODELS` spelling and comma separation (no spaces around commas)
- Verify the env var is set for the correct environment (Production vs Preview)
- Restart `npm run dev` after changing `.env.local`

### "Azure OpenAI credentials are not configured for model X"

- If the model lives in the **same resource** as `gpt-5.4` → no action needed
- If the model lives in a **different resource** → add `AI_MODEL_<X>_ENDPOINT` and `AI_MODEL_<X>_API_KEY`

### Flow still uses the old default model

- Check if `AI_TASK_<TASK_NAME>` is set (it overrides `AI_DEFAULT_MODEL`)
- Priority: Task env var > `AI_DEFAULT_MODEL` > Legacy deployment

### User selected model does not affect a specific flow

- Some flows (Monthly Report, Yearly Report) cache results in Azure Blob Storage
- Click **"Regenerate"** in the UI to force a new AI call

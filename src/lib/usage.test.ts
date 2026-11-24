// Run: npx tsx --test src/lib/usage.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateCostUsd, usageFrom } from './usage';

test('cost from catalog prices, cached input at 10%', () => {
  // GPT-5.6 Luna: $0.20 in, $1.20 out per million.
  const c = estimateCostUsd('openai::gpt-5.6-luna', { input: 1_000_000, cached: 500_000, output: 100_000 })!;
  assert.ok(Math.abs(c - (0.5 * 0.2 + 0.5 * 0.2 * 0.1 + 0.1 * 1.2)) < 1e-9);
  assert.equal(estimateCostUsd('openai::no-such-model', { input: 10, output: 10 }), null);
  // GPT-6.1 Terra: $1 in, $0.05 cached (5%), $5 out per million.
  const t = estimateCostUsd('openai::gpt-6.1-terra', { input: 1_000_000, cached: 500_000, output: 100_000 })!;
  assert.ok(Math.abs(t - (0.5 * 1 + 0.5 * 0.05 + 0.1 * 5)) < 1e-9);
});

test('cost the API reports wins', () => {
  assert.equal(usageFrom.openaiChat({ prompt_tokens: 10, completion_tokens: 5, cost: 0.0042 })!.costUsd, 0.0042);
  assert.equal(usageFrom.openaiChat({ prompt_tokens: 10, completion_tokens: 5 })!.costUsd, undefined);
});

test('provider usage shapes', () => {
  assert.deepEqual(usageFrom.openaiResponses({ input_tokens: 100, input_tokens_details: { cached_tokens: 40 }, output_tokens: 20, output_tokens_details: { reasoning_tokens: 5 } }),
    { input: 100, cached: 40, output: 20, reasoning: 5 });
  assert.deepEqual(usageFrom.anthropic({ input_tokens: 10, cache_read_input_tokens: 80, cache_creation_input_tokens: 5, output_tokens: 7 }),
    { input: 95, cached: 80, cacheWrite: 5, output: 7 });
  assert.equal(usageFrom.gemini({ promptTokenCount: 50, candidatesTokenCount: 10, thoughtsTokenCount: 4 })!.output, 14);
});

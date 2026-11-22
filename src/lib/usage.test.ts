// Run: npx tsx --test src/lib/usage.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateCostUsd, usageFrom } from './usage';

test('cost from catalog prices, cached input at 10%', () => {
  // GPT-5.6 Luna: $0.20 in, $1.20 out per million.
  const c = estimateCostUsd('openai::gpt-5.6-luna', { input: 1_000_000, cached: 500_000, output: 100_000 })!;
  assert.ok(Math.abs(c - (0.5 * 0.2 + 0.5 * 0.2 * 0.1 + 0.1 * 1.2)) < 1e-9);
  assert.equal(estimateCostUsd('openai::no-such-model', { input: 10, output: 10 }), null);
});

test('provider usage shapes', () => {
  assert.deepEqual(usageFrom.openaiResponses({ input_tokens: 100, input_tokens_details: { cached_tokens: 40 }, output_tokens: 20, output_tokens_details: { reasoning_tokens: 5 } }),
    { input: 100, cached: 40, output: 20, reasoning: 5 });
  assert.deepEqual(usageFrom.anthropic({ input_tokens: 10, cache_read_input_tokens: 80, cache_creation_input_tokens: 5, output_tokens: 7 }),
    { input: 95, cached: 80, cacheWrite: 5, output: 7 });
  assert.equal(usageFrom.gemini({ promptTokenCount: 50, candidatesTokenCount: 10, thoughtsTokenCount: 4 })!.output, 14);
});

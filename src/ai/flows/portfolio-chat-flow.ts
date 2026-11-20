'use server';

import { z } from 'genkit';
import { runPortfolioAgent } from '@/ai/adk/finance-agent';
import { getDefaultModelForTask } from '@/lib/task-models';
import type { AIModel, PortfolioDashboardData } from '@/lib/types';

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  model: z.string().optional(),
});
export type PortfolioChatMessage = z.infer<typeof ChatMessageSchema>;

export interface PortfolioChatOutput {
  response: string;
  followUpQuestions?: string[];
  model?: AIModel;
}

/**
 * Portfolio chat: a Google ADK agent that looks up holdings, asset history and
 * the expense ledger through read-only tools (src/ai/adk/finance-agent.ts).
 * `dashboard` is only used for the scoped asset's name.
 */
export async function askPortfolioBot(input: {
  query: string;
  dashboard: PortfolioDashboardData;
  chatHistory?: PortfolioChatMessage[];
  model?: AIModel;
  scopedAssetId?: string;
}): Promise<PortfolioChatOutput> {
  const modelToUse = input.model || getDefaultModelForTask('portfolio_chat');
  const scopedAssetName = input.scopedAssetId
    ? input.dashboard.assets.find(a => a.id === input.scopedAssetId)?.name
    : undefined;

  let responseText = '';
  try {
    responseText = await runPortfolioAgent({
      query: input.query,
      history: (input.chatHistory || []).map(m => ({ role: m.role, content: m.content })),
      modelKey: modelToUse,
      scopedAssetId: input.scopedAssetId,
      scopedAssetName,
    });
  } catch (err: any) {
    console.error('[portfolio-chat] agent failed:', err);
    throw new Error("The AI couldn't answer just now. Please try again in a moment.");
  }

  if (!responseText) {
    return { response: "I couldn't generate a response. Please try again.", model: modelToUse };
  }

  const { cleanText, followUps } = extractFollowUps(responseText);
  return { response: cleanText, followUpQuestions: followUps, model: modelToUse };
}

function extractFollowUps(raw: string): { cleanText: string; followUps?: string[] } {
  const match = raw.match(/\[FOLLOWUPS\]([\s\S]*?)\[\/FOLLOWUPS\]/i);
  if (!match) return { cleanText: raw.trim() };
  const followUps = match[1]
    .split('\n')
    .map(line => line.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(line => line.length > 0 && line.length <= 120)
    .slice(0, 4);
  const cleanText = raw.replace(match[0], '').trim();
  return { cleanText, followUps: followUps.length > 0 ? followUps : undefined };
}

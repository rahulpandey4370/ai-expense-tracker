'use server';

import { z } from 'genkit';
import { callChatLLM } from '@/lib/ai-client';
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

function summarizeDashboardForAI(dashboard: PortfolioDashboardData, scopedAssetId?: string) {
  const summary = dashboard.summary;
  const assets = scopedAssetId
    ? dashboard.assetSummaries.filter(item => item.asset.id === scopedAssetId)
    : dashboard.assetSummaries;

  return {
    portfolio: {
      totalInvested: summary.totalInvested,
      totalCurrentValue: summary.totalCurrentValue,
      totalInflows: summary.totalInflows,
      netPnl: summary.netPnl,
      netPnlPercent: summary.netPnlPercent,
      xirr: summary.xirr,
      assetCount: summary.assetCount,
      transactionCount: summary.transactionCount,
      latestUpdateDate: summary.latestUpdateDate,
      bestPerformer: summary.bestPerformer?.asset.name,
      worstPerformer: summary.worstPerformer?.asset.name,
    },
    assets: assets.map(item => ({
      id: item.asset.id,
      name: item.asset.name,
      assetType: item.asset.assetType,
      currency: item.asset.currency,
      totalInvested: item.totalInvested,
      currentValue: item.currentValue,
      netPnl: item.netPnl,
      netPnlPercent: item.netPnlPercent,
      xirr: item.xirr,
      holdingDays: item.holdingDays,
      transactionCount: item.transactionCount,
      latestValuation: item.latestValuation
        ? { date: item.latestValuation.date, totalValue: item.latestValuation.totalValue }
        : null,
      transactions: item.transactions.slice(0, 50).map(tx => ({
        date: tx.date,
        type: tx.type,
        amount: tx.amount,
        quantity: tx.quantity,
        pricePerUnit: tx.pricePerUnit,
        notes: tx.notes,
      })),
      valuations: item.valuations.slice(0, 20).map(v => ({
        date: v.date,
        totalValue: v.totalValue,
        quantity: v.quantity,
        pricePerUnit: v.pricePerUnit,
      })),
    })),
  };
}

export async function askPortfolioBot(input: {
  query: string;
  dashboard: PortfolioDashboardData;
  chatHistory?: PortfolioChatMessage[];
  model?: AIModel;
  scopedAssetId?: string;
}): Promise<PortfolioChatOutput> {
  const modelToUse = input.model || getDefaultModelForTask('portfolio_chat');
  const today = new Date().toISOString().slice(0, 10);
  const data = summarizeDashboardForAI(input.dashboard, input.scopedAssetId);
  const scopedAssetName = input.scopedAssetId
    ? input.dashboard.assets.find(a => a.id === input.scopedAssetId)?.name
    : undefined;

  const systemPrompt = `## ROLE
You are FinWise AI's Portfolio Assistant. You analyse the user's personal investment portfolio.

## CONTEXT
- Today: ${today}
- Currency: INR by default (USD where indicated on individual assets).
- ${scopedAssetName ? `You are scoped to a single asset: **${scopedAssetName}**.` : `You see the user's entire portfolio.`}
- All data below is what the user has manually entered. There is NO live market price feed.

## SCOPE
You can analyse: holdings, allocation, concentration, XIRR, P&L (realized + unrealized), buy/sell cadence, average buy price (when units are available), holding period, best/worst performers, and what additional data (units, price, current NAV) the user should add to improve analysis.

You must NOT invent live prices, predict the market, or recommend specific stocks/funds the user does not already hold. You may discuss tradeoffs of existing holdings.

If the user asks a question your data cannot answer (e.g. "is RELIANCE going to go up?"), say so plainly and suggest what data they could add.

## DATA
${JSON.stringify(data, null, 2)}

## OUTPUT
- Markdown. Use ₹ for INR. Round to 2 decimals; percentages to 1 decimal.
- Be concise. Lead with the answer. Add 2-4 bullet supporting points only when useful.
- End every answer with this exact block listing 2-4 short follow-up questions (≤12 words each):
[FOLLOWUPS]
- question 1
- question 2
[/FOLLOWUPS]
Omit the block only if nothing useful applies.`;

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ];
  (input.chatHistory || []).slice(-6).forEach(msg => {
    messages.push({ role: msg.role, content: msg.content });
  });
  messages.push({ role: 'user', content: input.query });

  let responseText = '';
  try {
    responseText = await callChatLLM(modelToUse, messages, {
      temperature: 0.2,
      maxOutputTokens: 1400,
    });
  } catch (err: any) {
    console.error('[portfolio-chat] AI generation failed:', err);
    throw new Error(`Portfolio chat failed: ${err?.message || 'unknown AI error'}`);
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

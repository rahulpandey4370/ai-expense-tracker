import { LlmAgent, ParallelAgent, Runner, SequentialAgent } from '@google/adk';
import { getSupabase } from '@/lib/supabase';
import { getDefaultModelForTask } from '@/lib/task-models';
import { ANSWER_STYLE, budgets, monthlyTotals, recurringRules, searchTransactions, spendingBreakdown, splitBalances } from './finance-agent';
import { adkModelFor } from './model';
import { sessionService } from './chat';
import { APP_NAME, USER_ID } from './session-store';

/*
 * The monthly review, as an ADK workflow: three analysts gather facts at the
 * same time (ParallelAgent), each saving notes to session state (outputKey),
 * then a writer turns the notes into the review (SequentialAgent). It is saved
 * as a chat titled e.g. "October 2026 review", so the user can ask follow-ups.
 *
 * ponytail: ParallelAgent/SequentialAgent are deprecated in ADK 2.5 in favour of
 * `Workflow`, which is still a partial port. Move to Workflow when these are removed.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');

export async function runMonthlyReview(input: { year: number; month: number; modelKey?: string }): Promise<{ sessionId: string; title: string; preview: string }> {
  const { year, month } = input;
  const modelKey = input.modelKey || getDefaultModelForTask('chat');
  const start = `${year}-${pad(month + 1)}-01`;
  const monthEnd = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;
  // A month still running (from /review in chat) is reviewed up to today, IST.
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const soFar = today < monthEnd;
  const end = soFar ? today : monthEnd;
  const prev = month === 0 ? `${MONTHS[11]} ${year - 1}` : `${MONTHS[month - 1]} ${year}`;
  const period = `${MONTHS[month]} ${year} (${start} to ${end}${soFar ? ', the month is not over yet' : ''})`;
  const title = `${MONTHS[month]} ${year} review${soFar ? ' so far' : ''}`;
  const model = adkModelFor(modelKey);
  const facts = 'Use the tools for every number. Reply with terse bullet notes (numbers in ₹ with Indian grouping), no prose, no follow-up questions.';

  const analyst = (name: string, tools: LlmAgent['tools'], task: string, outputKey: string) =>
    new LlmAgent({ name, model, tools, outputKey, instruction: `${task}\nPeriod: ${period}. ${facts}`, generateContentConfig: { temperature: 0 } });

  const gather = new ParallelAgent({
    name: 'review_gather',
    subAgents: [
      analyst('review_spending', [spendingBreakdown, monthlyTotals, searchTransactions],
        `Spending facts: total income, total expenses, savings and savings rate; needs vs wants vs investments; top 5 expense categories with amounts; the 3 largest single expenses; change in total expenses vs ${prev}.`,
        'spending_notes'),
      analyst('review_budgets', [budgets, spendingBreakdown],
        'Budget facts: for every budget, the limit, what was spent against it in the period, and whether it was over or under (by how much).',
        'budget_notes'),
      analyst('review_obligations', [recurringRules, splitBalances],
        'Commitments: active recurring entries and their monthly total; anything paused; who owes the user money and whom the user owes, with amounts.',
        'obligation_notes'),
    ],
  });

  const writer = new LlmAgent({
    name: 'review_writer',
    model,
    instruction: `You are FinWise AI writing the user's monthly money review for ${period}. Be warm, specific and brief (under 250 words).${soFar ? ' The month is still running: say it is a review so far and compare fairly (e.g. pace, not totals).' : ''}
Structure: one-line verdict; "**Highlights**" (3 bullets); "**Watch out**" (2-3 bullets, budgets over or spending spikes); "**Next month**" (2 concrete, doable suggestions).
Use only these notes; never invent numbers.

SPENDING NOTES:
{spending_notes}

BUDGET NOTES:
{budget_notes}

COMMITMENTS:
{obligation_notes}

${ANSWER_STYLE}`,
    generateContentConfig: { temperature: 0.3 },
  });

  const flow = new SequentialAgent({ name: 'review_flow', subAgents: [gather, writer] });
  const runner = new Runner({ appName: APP_NAME, agent: flow, sessionService });
  const session = await sessionService.createSession({ appName: APP_NAME, userId: USER_ID });
  await getSupabase().from('chat_sessions').update({ title, kind: 'review' }).eq('id', session.id);

  let preview = '';
  for await (const event of runner.runAsync({
    userId: USER_ID, sessionId: session.id,
    newMessage: { role: 'user', parts: [{ text: `Review my ${MONTHS[month]} ${year}.` }] },
    runConfig: { maxLlmCalls: 30 },
  })) {
    if (event.author === 'review_writer') {
      const text = (event.content?.parts ?? []).map(p => p.text ?? '').join('').trim();
      if (text) preview = text.split('\n').find(l => l.trim())?.replace(/[*_#]/g, '').trim() ?? '';
    }
    if (event.errorMessage) console.error(`[review] ${event.author}: ${event.errorMessage}`);
  }
  if (!preview) throw new Error('The review writer produced no text.');
  return { sessionId: session.id, title, preview };
}

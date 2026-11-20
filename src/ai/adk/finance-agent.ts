import { FunctionTool, InMemoryRunner, LlmAgent, createEvent, isFinalResponse, type BaseTool } from '@google/adk';
import { z } from 'zod';
import { queryTransactions, getCategories, getPaymentMethods } from '@/lib/actions/transactions';
import { getCategoryBreakdown, getMonthlyRollups, getTransactionYears } from '@/lib/actions/analytics';
import { getBudgets } from '@/lib/actions/budgets';
import { getRecurringRules } from '@/lib/actions/recurring';
import { getSplitBalances } from '@/lib/actions/splits';
import { getPortfolioDashboardData, getPortfolioAssetDetail } from '@/lib/actions/portfolio';
import { getCalendarDateString } from '@/lib/date-utils';
import { netAmount } from '@/lib/split-utils';
import { adkModelFor } from './model';

/*
 * FinWise's AI agents, on Google ADK. The tools here only read; each is a thin
 * wrapper over an existing server action, so the numbers match the rest of the
 * app. Tools that change data live in action-tools.ts behind a Confirm step.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD, inclusive');
const round2 = (n: number) => Math.round(n * 100) / 100;

// ADK types its zod params against its own bundled zod; ours is the same API at
// runtime (it validates with .safeParse), so bridge the types here once.
function tool<S extends z.ZodTypeAny = z.ZodObject<{}>>(opts: {
  name: string;
  description: string;
  parameters?: S;
  execute: (input: z.infer<S>) => Promise<unknown>;
}): FunctionTool<any> {
  return new FunctionTool({ ...opts, parameters: opts.parameters as any, execute: opts.execute as any });
}

const searchTransactions = tool({
  name: 'search_transactions',
  description:
    'Find transactions in any date range, with optional filters. Returns the matching count, the total amount of ALL matches, ' +
    'and up to `limit` rows. Amounts are the user\'s own share (split expenses count only their part). Use this for lists, ' +
    'single-merchant totals, "how much on X", largest purchases, and anything the other tools do not cover.',
  parameters: z.object({
    startDate: ymd,
    endDate: ymd,
    type: z.enum(['income', 'expense']).optional(),
    categoryNames: z.array(z.string()).optional().describe('Exact category names, from list_categories_and_payment_methods'),
    expenseType: z.enum(['need', 'want', 'investment', 'investment_expense']).optional(),
    paymentMethodName: z.string().optional(),
    text: z.string().optional().describe('Words to match in the description or income source, e.g. "Swiggy" or "Goa"'),
    sortBy: z.enum(['date', 'amount']).optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
    limit: z.number().int().min(1).max(100).optional().describe('Rows to return (default 40). The totals always cover every match.'),
  }),
  execute: async input => {
    let paymentMethodId: string | undefined;
    if (input.paymentMethodName) {
      const pm = (await getPaymentMethods()).find(p => p.name.toLowerCase() === input.paymentMethodName!.toLowerCase());
      if (!pm) return { error: `No payment method named "${input.paymentMethodName}". Call list_categories_and_payment_methods.` };
      paymentMethodId = pm.id;
    }
    const base = {
      startDate: input.startDate,
      endDate: input.endDate,
      type: input.type,
      categoryNames: input.categoryNames,
      expenseType: input.expenseType,
      paymentMethodId,
      search: input.text,
      sortKey: input.sortBy ?? 'date',
      sortDir: input.sortDir ?? 'desc',
      pageSize: 200,
    } as const;
    // Page through so the total covers every match, not just the rows shown.
    // ponytail: capped at 2,000 rows (10 pages); a SQL sum would lift the cap.
    const first = await queryTransactions({ ...base, page: 1 });
    const rows = [...first.rows];
    for (let page = 2; rows.length < first.total && page <= 10; page++) {
      rows.push(...(await queryTransactions({ ...base, page })).rows);
    }
    const limit = input.limit ?? 40;
    return {
      matchCount: first.total,
      totalAmount: round2(rows.reduce((s, t) => s + netAmount(t), 0)),
      totalIsPartial: rows.length < first.total,
      rowsShown: Math.min(limit, rows.length),
      rows: rows.slice(0, limit).map(t => ({
        id: t.id,
        date: getCalendarDateString(t.date),
        type: t.type,
        amount: round2(netAmount(t)),
        ...(t.myShare != null && t.myShare !== t.amount ? { fullAmount: t.amount } : {}),
        description: t.description,
        category: t.category?.name,
        paymentMethod: t.paymentMethod?.name,
        expenseType: t.expenseType,
        source: t.source || undefined,
      })),
    };
  },
});

const spendingBreakdown = tool({
  name: 'spending_breakdown',
  description: 'Totals per category for any date range, largest first. Fast way to answer "where did my money go" or compare categories.',
  parameters: z.object({ startDate: ymd, endDate: ymd, type: z.enum(['income', 'expense']).optional().describe('Default expense') }),
  execute: async ({ startDate, endDate, type }) => {
    const rows = await getCategoryBreakdown(startDate, endDate, type ?? 'expense');
    return { total: round2(rows.reduce((s, r) => s + r.total, 0)), categories: rows.map(r => ({ ...r, total: round2(r.total) })) };
  },
});

const monthlyTotals = tool({
  name: 'monthly_totals',
  description:
    'Month-by-month totals for a calendar year: income, total expenses, needs, wants, investments, cashback/interest/dividends and ' +
    'transaction count. Use for yearly questions, trends and month-vs-month comparisons.',
  parameters: z.object({ year: z.number().int().min(2000).max(2100) }),
  execute: async ({ year }) => {
    const rows = await getMonthlyRollups(year);
    return {
      year,
      months: rows.map(r => ({
        month: MONTHS[r.monthIndex] ?? r.monthIndex,
        income: round2(r.totalIncome),
        expenses: round2(r.totalExpenses),
        needs: round2(r.needs),
        wants: round2(r.wants),
        investments: round2(r.investments),
        cashbackInterestDividends: round2(r.cashbackInterestDividends),
        transactions: r.transactionCount,
      })),
    };
  },
});

const listLookups = tool({
  name: 'list_categories_and_payment_methods',
  description: 'Exact category names (income and expense), payment method names, and which years have data. Call before filtering by name.',
  execute: async () => {
    const [cats, pms, years] = await Promise.all([getCategories(), getPaymentMethods(), getTransactionYears()]);
    return {
      expenseCategories: cats.filter(c => c.type === 'expense').map(c => c.name),
      incomeCategories: cats.filter(c => c.type === 'income').map(c => c.name),
      paymentMethods: pms.map(p => p.name),
      yearsWithData: years,
    };
  },
});

const budgets = tool({
  name: 'get_budgets',
  description: 'Monthly budget limits (per category or per need/want type). Pair with spending_breakdown or search_transactions for usage.',
  execute: async () => {
    const [list, cats] = await Promise.all([getBudgets(), getCategories()]);
    return list.map(b => ({
      name: b.name,
      monthlyLimit: b.amount,
      appliesTo: b.type === 'category' ? `category: ${cats.find(c => c.id === b.targetId)?.name ?? b.targetId}` : `expense type: ${b.targetId}`,
    }));
  },
});

const recurringRules = tool({
  name: 'get_recurring_rules',
  description: 'Recurring monthly entries (rent, subscriptions, EMIs, salary): amount, day of month, active or paused.',
  execute: async () => {
    const [rules, cats, pms] = await Promise.all([getRecurringRules(), getCategories(), getPaymentMethods()]);
    return rules.map(r => ({
      id: r.id,
      description: r.description,
      type: r.type,
      amount: r.amount,
      dayOfMonth: r.dayOfMonth,
      active: r.isActive,
      category: cats.find(c => c.id === r.categoryId)?.name,
      paymentMethod: pms.find(p => p.id === r.paymentMethodId)?.name,
      expenseType: r.expenseType,
      from: r.startDate,
      to: r.endDate,
    }));
  },
});

const splitBalances = tool({
  name: 'get_split_balances',
  description: 'Who owes whom from split expenses. Positive net means that person owes the user.',
  execute: async () => getSplitBalances(),
});

const portfolioOverview = tool({
  name: 'portfolio_overview',
  description:
    'The investment portfolio the user tracks by hand: totals (invested, current value, P&L, XIRR) and every asset with its own ' +
    'totals and id. There is no live price feed; values are as of each asset\'s latest manual valuation.',
  execute: async () => {
    const d = await getPortfolioDashboardData();
    const s = d.summary;
    return {
      totals: {
        invested: s.totalInvested, currentValue: s.totalCurrentValue, netPnl: s.netPnl, netPnlPercent: s.netPnlPercent,
        xirr: s.xirr, assets: s.assetCount, transactions: s.transactionCount, latestUpdate: s.latestUpdateDate,
        best: s.bestPerformer?.asset.name, worst: s.worstPerformer?.asset.name,
      },
      assets: d.assetSummaries.map(a => ({
        id: a.asset.id, name: a.asset.name, type: a.asset.assetType, currency: a.asset.currency,
        invested: a.totalInvested, currentValue: a.currentValue, netPnl: a.netPnl, netPnlPercent: a.netPnlPercent,
        xirr: a.xirr, holdingDays: a.holdingDays, transactions: a.transactionCount, valuedOn: a.latestValuation?.date,
      })),
    };
  },
});

const portfolioAsset = tool({
  name: 'portfolio_asset_detail',
  description: 'One portfolio asset\'s buys, sells and valuations. Get the id from portfolio_overview.',
  parameters: z.object({ assetId: z.string() }),
  execute: async ({ assetId }) => {
    const { dashboard } = await getPortfolioAssetDetail(assetId);
    const d = dashboard.assetSummaries.find(a => a.asset.id === assetId);
    if (!d) return { error: `No asset with id ${assetId}. Call portfolio_overview for ids.` };
    return {
      transactions: d.transactions.slice(0, 100).map(t => ({ date: t.date, type: t.type, amount: t.amount, quantity: t.quantity, price: t.pricePerUnit, notes: t.notes })),
      valuations: d.valuations.slice(0, 40).map(v => ({ date: v.date, value: v.totalValue, quantity: v.quantity, price: v.pricePerUnit })),
    };
  },
});

export const LEDGER_TOOLS: BaseTool[] = [searchTransactions, spendingBreakdown, monthlyTotals, listLookups, budgets, recurringRules, splitBalances];
export { searchTransactions, spendingBreakdown, monthlyTotals, budgets, recurringRules, splitBalances };
export { portfolioOverview };
const PORTFOLIO_TOOLS: BaseTool[] = [portfolioOverview, portfolioAsset, searchTransactions];

export const HOW_TO_WORK = `## HOW TO WORK
- You have tools that read the user's real data. ALWAYS call a tool to get numbers; never guess, estimate or reuse a number you did not fetch.
- Any period is fine: last month, October, a quarter, the whole year, year over year. Work out exact YYYY-MM-DD ranges from today's date, then query them.
- Prefer one or two well-aimed calls (spending_breakdown or monthly_totals for totals, search_transactions for lists or one merchant). Do arithmetic on what the tools return.
- If a filter needs an exact name and you are unsure of it, call list_categories_and_payment_methods first.
- State the period you analysed in the answer.`;

export const ANSWER_STYLE = `- Simple markdown: **bold**, "-" bullets, numbered lists. No markdown tables and no headings above ###.
- Amounts in Indian rupees with Indian grouping: ₹1,23,456. Drop ".00"; keep paise only when they are not zero. Percentages to 1 decimal.
- End every answer with 2-4 follow-up questions the user might ask next (12 words or fewer each), exactly:
[FOLLOWUPS]
- question one
- question two
[/FOLLOWUPS]
- Stay on personal finance and this user's money. Politely decline anything unrelated.`;

/** The portfolio chat still shows tables from a text block. */
const SHARED_RULES = `${HOW_TO_WORK}

## OUTPUT
${ANSWER_STYLE}
- To show a list of transactions, use exactly this block, one per line, fields separated by "|", no header row, dates written like 4 Nov 2026:
[START_TABLE]
4 Nov 2026|₹1,200|🍽️ Lunch at restaurant|Food and Dining
[END_TABLE]`;

export type AgentTurn = { role: 'user' | 'assistant'; content: string };

export interface FinanceAgentInput {
  query: string;
  history?: AgentTurn[];
  modelKey: string;
  verbose?: boolean;
  /** The month the page is showing — a default when the question names no period. */
  viewing?: { month: number; year: number };
  investmentFocus?: boolean;
}

export function financeContext(input: Pick<FinanceAgentInput, 'viewing' | 'investmentFocus' | 'verbose'>): string {
  const today = getCalendarDateString(new Date());
  const viewing = input.viewing ? `${MONTHS[input.viewing.month]} ${input.viewing.year}` : null;
  return `You are FinWise AI, a precise, friendly personal-finance assistant for an Indian user. Currency is INR.

## CONTEXT
- Today is ${today}.
${viewing ? `- The user is looking at ${viewing} in the app. Use that month ONLY when the question names no period ("this month" means ${viewing}). Any other period they mention, look it up.` : ''}
${input.investmentFocus ? '- Investment focus is on: centre the answer on investments (expenseType "investment", categories like Stocks, Mutual Funds, Gold, RD) and passive income (dividends, interest, cashback), across the whole year unless a period is named.' : ''}
- Style: ${input.verbose ? 'detailed. Explain the reasoning and add useful context.' : 'concise. Lead with the answer and the key numbers.'}`;
}

function portfolioInstruction(scopedAssetName?: string): string {
  return `You are FinWise AI's portfolio assistant. Today is ${getCalendarDateString(new Date())}.
${scopedAssetName ? `The user is looking at one asset: **${scopedAssetName}**. Focus on it unless they ask more broadly.` : 'The user is looking at their whole portfolio.'}
All portfolio data is entered by hand; there is no live market feed. Never invent prices, predict markets, or recommend securities they do not hold. If the data can't answer, say what they could add (units, NAV, a fresh valuation).
search_transactions reads their expense ledger, where SIPs and stock buys are also logged; use it for cash-flow questions.

${SHARED_RULES}`;
}

/** Runs one agent turn and returns its final text. Earlier turns are replayed into a throwaway session. */
async function runAgentTurn(agent: LlmAgent, query: string, history: AgentTurn[] = []): Promise<string> {
  const runner = new InMemoryRunner({ agent, appName: 'finwise' });
  const session = await runner.sessionService.createSession({ appName: 'finwise', userId: 'me' });
  for (const turn of history.slice(-8)) {
    await runner.sessionService.appendEvent({
      session,
      event: createEvent({
        invocationId: 'history',
        author: turn.role === 'user' ? 'user' : agent.name,
        content: { role: turn.role === 'user' ? 'user' : 'model', parts: [{ text: turn.content }] },
      }),
    });
  }

  let finalText = '';
  let error = '';
  for await (const event of runner.runAsync({
    userId: 'me',
    sessionId: session.id,
    newMessage: { role: 'user', parts: [{ text: query }] },
    runConfig: { maxLlmCalls: 10 },
  })) {
    if (event.errorMessage) error = event.errorMessage;
    for (const p of event.content?.parts ?? []) {
      if (p.functionCall) console.info(`[adk] ${agent.name} → ${p.functionCall.name}(${JSON.stringify(p.functionCall.args)})`);
    }
    if (isFinalResponse(event)) {
      const text = event.content?.parts?.map(p => p.text ?? '').join('') ?? '';
      if (text.trim()) finalText = text;
    }
  }
  if (!finalText && error) throw new Error(error);
  return finalText;
}

export async function runPortfolioAgent(input: { query: string; history?: AgentTurn[]; modelKey: string; scopedAssetName?: string; scopedAssetId?: string }): Promise<string> {
  const agent = new LlmAgent({
    name: 'finwise_portfolio',
    description: 'Answers questions about the user\'s investment portfolio.',
    model: adkModelFor(input.modelKey),
    instruction: portfolioInstruction(input.scopedAssetName) + (input.scopedAssetId ? `\nThat asset's id is ${input.scopedAssetId}.` : ''),
    tools: PORTFOLIO_TOOLS,
    generateContentConfig: { temperature: 0.1 },
  });
  return runAgentTurn(agent, input.query, input.history);
}

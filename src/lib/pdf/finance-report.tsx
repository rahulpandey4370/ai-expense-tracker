// Monthly / annual finance report as a real PDF (replaces the page screenshot). Browser-only.
import { Text, View } from '@react-pdf/renderer';
import type { AppTransaction } from '@/lib/types';
import { netAmount } from '@/lib/split-utils';
import { C, Doc, Footer, Table, Tiles, inr, s, toFile } from './kit';

interface AiSections {
  executiveSummary?: string; incomeVsExpenseAnalysis?: string; categoryDeepDive?: string;
  savingsAndInvestmentAnalysis?: string; actionableRecommendations?: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const plain = (t: string) => t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '').trim();
const isInvest = (t: AppTransaction) => t.expenseType === 'investment' || (t.expenseType as string) === 'investment_expense';

export function financeNumbers(txs: AppTransaction[]) {
  const income = r2(txs.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0));
  const exp = txs.filter(t => t.type === 'expense');
  const invested = r2(exp.filter(isInvest).reduce((a, t) => a + netAmount(t), 0));
  const spend = exp.filter(t => !isInvest(t));
  const spending = r2(spend.reduce((a, t) => a + netAmount(t), 0));
  const needs = r2(spend.filter(t => t.expenseType === 'need').reduce((a, t) => a + netAmount(t), 0));
  const wants = r2(spend.filter(t => t.expenseType === 'want').reduce((a, t) => a + netAmount(t), 0));
  const byCat = new Map<string, number>();
  for (const t of spend) byCat.set(t.category?.name ?? 'Other', (byCat.get(t.category?.name ?? 'Other') ?? 0) + netAmount(t));
  const categories = [...byCat.entries()].map(([name, v]) => ({ name, value: r2(v) })).filter(c => c.value > 0).sort((a, b) => b.value - a.value);
  const byPlace = new Map<string, number>();
  for (const t of spend) { const k = t.description.split(':')[0].trim(); byPlace.set(k, (byPlace.get(k) ?? 0) + netAmount(t)); }
  const places = [...byPlace.entries()].map(([name, v]) => ({ name, value: r2(v) })).sort((a, b) => b.value - a.value).slice(0, 8);
  const saved = r2(income - spending - invested);
  return { income, spending, invested, saved, needs, wants, categories, places, rate: income > 0 ? Math.round((saved / income) * 1000) / 10 : null };
}

function Bar({ pct }: { pct: number }) {
  return (
    <View style={{ height: 6, backgroundColor: C.soft, borderRadius: 3, marginTop: 3 }}>
      <View style={{ height: 6, width: `${Math.max(2, Math.min(100, pct))}%`, backgroundColor: C.accent, borderRadius: 3 }} />
    </View>
  );
}

export async function financeReportPdf(opts: { periodName: string; annual: boolean; transactions: AppTransaction[]; ai?: AiSections | null }): Promise<File> {
  const n = financeNumbers(opts.transactions);
  const months = opts.annual
    ? Array.from({ length: 12 }, (_, m) => {
        const txs = opts.transactions.filter(t => new Date(t.date).getMonth() === m);
        const k = financeNumbers(txs);
        return { m, ...k, count: txs.length };
      }).filter(x => x.count > 0)
    : [];
  const maxCat = n.categories[0]?.value ?? 1;
  const ai = opts.ai;
  const sections: [string, string | undefined][] = ai ? [
    ['Summary', ai.executiveSummary], ['Income vs spending', ai.incomeVsExpenseAnalysis],
    ['Where the money went', ai.categoryDeepDive], ['Savings & investments', ai.savingsAndInvestmentAnalysis],
  ] : [];

  const doc = (
    <Doc title={`FinWise report · ${opts.periodName}`}>
      <View style={[s.band, { backgroundColor: C.accent }]}>
        <Text style={s.brand}>finwise</Text>
        <Text style={s.title}>{opts.annual ? 'Annual report' : 'Monthly report'}</Text>
        <Text style={s.sub}>{opts.periodName} · {opts.transactions.length} transactions</Text>
      </View>
      <Tiles items={[
        { label: 'Income', value: inr(n.income), tone: 'pos' },
        { label: 'Spending', value: inr(n.spending), note: 'your share of splits', tone: 'neg' },
        { label: 'Invested', value: inr(n.invested) },
        { label: 'Saved', value: inr(n.saved), note: n.rate == null ? undefined : `${n.rate}% of income`, tone: n.saved >= 0 ? 'pos' : 'neg' },
      ]} />

      <Text style={s.h2}>Needs, wants & investments</Text>
      <Table
        cols={[{ label: 'Type', width: '40%' }, { label: 'Amount', width: '30%', align: 'right' }, { label: 'Of spending + investing', width: '30%', align: 'right' }]}
        rows={[['🏠 Needs', n.needs], ['🎉 Wants', n.wants], ['📈 Investments', n.invested]].map(([label, v]) => {
          const base = n.spending + n.invested;
          return { cells: [label as string, inr(v as number), base > 0 ? `${Math.round(((v as number) / base) * 100)}%` : '—'] };
        })}
      />

      {n.categories.length > 0 && (
        <>
          <Text style={s.h2}>By category</Text>
          <Table
            cols={[{ label: 'Category', width: '38%' }, { label: '', width: '37%' }, { label: 'Amount', width: '25%', align: 'right' }]}
            rows={n.categories.slice(0, 14).map(c => ({ cells: [c.name, <Bar key={c.name} pct={(c.value / maxCat) * 100} />, inr(c.value)] }))}
          />
        </>
      )}

      {n.places.length > 0 && (
        <>
          <Text style={s.h2}>Top places you spent</Text>
          <Table cols={[{ label: 'Where', width: '70%' }, { label: 'Amount', width: '30%', align: 'right' }]} rows={n.places.map(p => ({ cells: [p.name, inr(p.value)] }))} />
        </>
      )}

      {months.length > 0 && (
        <>
          <Text style={s.h2}>Month by month</Text>
          <Table
            cols={[{ label: 'Month', width: '28%' }, { label: 'Income', width: '18%', align: 'right' }, { label: 'Spending', width: '18%', align: 'right' }, { label: 'Invested', width: '18%', align: 'right' }, { label: 'Saved', width: '18%', align: 'right' }]}
            rows={months.map(x => ({
              cells: [new Date(2000, x.m, 1).toLocaleDateString('en-IN', { month: 'long' }), inr(x.income), inr(x.spending), inr(x.invested), `${x.saved < 0 ? '−' : ''}${inr(x.saved)}`],
              tone: [undefined, undefined, undefined, undefined, x.saved >= 0 ? 'pos' : 'neg'],
            }))}
          />
        </>
      )}

      {ai && (
        <View break>
          <Text style={s.h2}>AI analysis</Text>
          {sections.filter(([, t]) => t).map(([h, t]) => (
            <View key={h} style={{ marginBottom: 8 }} wrap>
              <Text style={{ fontWeight: 700, marginBottom: 2 }}>{h}</Text>
              {plain(t!).split(/\n+/).map((para, i) => <Text key={i} style={s.para}>{para.replace(/^[-*•]\s*/, '• ')}</Text>)}
            </View>
          ))}
          {!!ai.actionableRecommendations?.length && (
            <View>
              <Text style={{ fontWeight: 700, marginBottom: 2 }}>What to do next</Text>
              {ai.actionableRecommendations.map((r, i) => <Text key={i} style={s.para}>{i + 1}. {plain(r)}</Text>)}
            </View>
          )}
        </View>
      )}
      <Footer note={`FinWise · ${opts.periodName} · amounts in ₹`} />
    </Doc>
  );
  return toFile(doc, `FinWise_report_${opts.periodName.replace(/\s+/g, '_')}.pdf`);
}

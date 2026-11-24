// Monthly / annual finance report as a real PDF (replaces the page screenshot). Browser-only.
import { Text, View } from '@react-pdf/renderer';
import type { AppTransaction } from '@/lib/types';
import { financeByMonth, financeNumbers } from './finance-numbers';
import { C, Doc, Table, Tiles, inr, s, toFile } from './kit';

interface AiSections {
  executiveSummary?: string; incomeVsExpenseAnalysis?: string; categoryDeepDive?: string;
  savingsAndInvestmentAnalysis?: string; actionableRecommendations?: string[];
}

const plain = (t: string) => t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '').trim();
const money = (n: number) => `${n < 0 ? '−' : ''}${inr(n)}`;

function Bar({ pct }: { pct: number }) {
  return (
    <View style={{ height: 6, backgroundColor: C.soft, borderRadius: 3, marginTop: 3 }}>
      <View style={{ height: 6, width: `${Math.max(2, Math.min(100, pct))}%`, backgroundColor: C.accent, borderRadius: 3 }} />
    </View>
  );
}

export async function financeReportPdf(opts: { periodName: string; annual: boolean; transactions: AppTransaction[]; ai?: AiSections | null }): Promise<File> {
  const n = financeNumbers(opts.transactions);
  const months = opts.annual ? financeByMonth(opts.transactions) : [];
  const maxCat = n.categories[0]?.value ?? 1;
  const ai = opts.ai;
  const sections: [string, string | undefined][] = ai ? [
    ['Summary', ai.executiveSummary], ['Income vs spending', ai.incomeVsExpenseAnalysis],
    ['Where the money went', ai.categoryDeepDive], ['Savings & investments', ai.savingsAndInvestmentAnalysis],
  ] : [];

  const doc = (
    <Doc title={`FinWise report · ${opts.periodName}`} footer={`FinWise · ${opts.periodName} · amounts in ₹`}>
      <View style={[s.band, { backgroundColor: C.accent }]}>
        <Text style={s.brand}>finwise</Text>
        <Text style={s.title}>{opts.annual ? 'Annual report' : 'Monthly report'}</Text>
        <Text style={s.sub}>{opts.periodName} · {opts.transactions.length} transactions</Text>
      </View>
      <Tiles items={[
        { label: 'Income', value: inr(n.income), tone: 'pos' },
        { label: 'Spending', value: inr(n.spending), note: 'your share of splits', tone: 'neg' },
        { label: 'Invested', value: inr(n.invested) },
        { label: 'Saved', value: money(n.saved), note: n.rate == null ? undefined : `${n.rate}% of income`, tone: n.saved >= 0 ? 'pos' : 'neg' },
      ]} />

      <Text style={s.h2}>Needs, wants & investments</Text>
      <Table
        cols={[{ label: 'Type', width: '40%' }, { label: 'Amount', width: '30%', align: 'right' }, { label: 'Of spending + investing', width: '30%', align: 'right' }]}
        rows={[['🏠 Needs', n.needs], ['🎉 Wants', n.wants], ['📈 Investments', n.invested], ...(n.other > 0 ? [['❔ No type set', n.other]] : [])].map(([label, v]) => {
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
              cells: [new Date(2000, x.m, 1).toLocaleDateString('en-IN', { month: 'long' }), inr(x.income), inr(x.spending), inr(x.invested), money(x.saved)],
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
    </Doc>
  );
  return toFile(doc, `FinWise_report_${opts.periodName.replace(/\s+/g, '_')}.pdf`);
}

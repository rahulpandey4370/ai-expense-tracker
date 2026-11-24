// Group and person split reports as real PDFs. Browser-only (dynamic import).
import { Text, View } from '@react-pdf/renderer';
import type { GroupDetail } from '@/lib/split/types';
import { groupReportData, personReportData, simplifiedDiffers, type PersonData } from '@/lib/split/report';
import { C, Doc, Header, Table, Tiles, fmtDate, inr, monthName, s, signedInr, toFile } from './kit';

const today = () => new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const todayYmd = () => new Date().toLocaleDateString('en-CA');
const spansMonths = (from: string, to: string) => from.slice(0, 7) !== to.slice(0, 7);
const safe = (x: string) => x.replace(/[^\w-]+/g, '_').slice(0, 40);

/** Month heading on the first row of each month (only when the range covers several). */
function withMonths<T extends { date: string }>(rows: T[], multi: boolean) {
  let last = '';
  return rows.map(r => {
    const m = r.date.slice(0, 7);
    const month = multi && m !== last ? monthName(m) : undefined;
    last = m;
    return { r, month };
  });
}

export async function groupReportPdf(d: GroupDetail, from: string, to: string, label: string): Promise<File> {
  const r = groupReportData(d, from, to);
  const me = d.meMemberId;
  const name = (id: string) => (id === me ? 'You' : d.members.find(m => m.id === id)?.name ?? 'Someone');
  const multi = spansMonths(from, to);
  const asOf = fmtDate(to);
  const past = to < todayYmd();

  const doc = (
    <Doc title={`${d.group.name} · ${label}`} footer={`FinWise Split · ${d.group.name} · amounts in ₹`}>
      <Header title={`${d.group.emoji ?? ''} ${d.group.name}`.trim()} subtitle={`${label} · ${fmtDate(from)} – ${fmtDate(to)}`} right={`Generated ${today()}`} />
      <Tiles items={[
        { label: 'Group spent', value: inr(r.totalSpent), note: `${r.expenses.length} expense${r.expenses.length === 1 ? '' : 's'}` },
        ...(me ? [
          { label: 'Your share', value: inr(r.myShare) },
          { label: 'You paid', value: inr(r.myPaid) },
          { label: 'Your balance', value: Math.abs(r.myBalanceAtEnd) < 0.005 ? 'Settled' : inr(r.myBalanceAtEnd),
            note: `${r.myBalanceAtEnd > 0 ? 'you get back · ' : r.myBalanceAtEnd < 0 ? 'you owe · ' : ''}as of ${asOf}`,
            tone: r.myBalanceAtEnd > 0 ? 'pos' as const : r.myBalanceAtEnd < 0 ? 'neg' as const : undefined },
        ] : []),
      ]} />

      <Text style={s.h2}>To settle up · as of {asOf}</Text>
      {past ? <Text style={[s.muted, { fontSize: 8, marginBottom: 4 }]}>Payments made after {asOf} aren&apos;t counted here. Check the app for today&apos;s balances.</Text> : null}
      {r.transfers.length === 0
        ? <Text style={[s.para, s.muted]}>✅ Everyone is square.</Text>
        : (
          <View style={{ marginBottom: 6 }}>
            {r.transfers.map((t, i) => (
              <Text key={i} style={s.para}>• <Text style={{ fontWeight: 700 }}>{name(t.from)}</Text> pays <Text style={{ fontWeight: 700 }}>{name(t.to)}</Text> {inr(t.amount)}</Text>
            ))}
          </View>
        )}

      <Text style={s.h2}>Each person, this period</Text>
      <Table
        cols={[{ label: 'Person', width: '40%' }, { label: 'Paid', width: '20%', align: 'right' }, { label: 'Share', width: '20%', align: 'right' }, { label: 'Net', width: '20%', align: 'right' }]}
        rows={r.people.map(p => ({ cells: [p.name, inr(p.paid), inr(p.share), signedInr(p.net)], tone: [undefined, undefined, undefined, p.net > 0 ? 'pos' : p.net < 0 ? 'neg' : undefined] }))}
      />

      <Text style={s.h2}>Expenses</Text>
      {r.expenses.length === 0 ? <Text style={s.muted}>No expenses in this period.</Text> : (
        <Table
          cols={[{ label: 'Date', width: '15%' }, { label: 'What', width: me ? '37%' : '53%' }, { label: 'Paid by', width: '16%' }, { label: 'Amount', width: '16%', align: 'right' }, ...(me ? [{ label: 'Your share', width: '16%', align: 'right' as const }] : [])]}
          rows={withMonths(r.expenses, multi).map(({ r: e, month }) => ({
            month,
            cells: [fmtDate(e.date).replace(/ \d{4}$/, ''), `${e.emoji ? `${e.emoji} ` : ''}${e.description}`, name(e.paidBy), inr(e.amount), ...(me ? [e.shares[me] ? inr(e.shares[me]) : '—'] : [])],
          }))}
        />
      )}

      {r.settlements.length > 0 && (
        <>
          <Text style={s.h2}>Payments</Text>
          <Table
            cols={[{ label: 'Date', width: '15%' }, { label: 'From', width: '28%' }, { label: 'To', width: '28%' }, { label: 'Amount', width: '29%', align: 'right' }]}
            rows={r.settlements.map(x => ({ cells: [fmtDate(x.date).replace(/ \d{4}$/, ''), `💸 ${name(x.from)}`, name(x.to), inr(x.amount)] }))}
          />
        </>
      )}
    </Doc>
  );
  return toFile(doc, `FinWise_${safe(d.group.name)}_${safe(label)}.pdf`);
}

export async function personReportPdf(p: PersonData, from: string, to: string, label: string): Promise<File> {
  const r = personReportData(p, from, to);
  const multi = spansMonths(from, to);
  const owesMe = p.net > 0;
  const doc = (
    <Doc title={`${p.name} · ${label}`} footer={`FinWise Split · You & ${p.name} · amounts in ₹`}>
      <Header title={`You & ${p.name}`} subtitle={`${label} · ${fmtDate(from)} – ${fmtDate(to)}`} right={`Generated ${today()}`} />
      <Tiles items={[
        { label: 'Shared spending', value: inr(r.sharedSpend), note: (n => `${n} expense${n === 1 ? '' : 's'} together`)(r.items.filter(i => i.kind === 'expense').length) },
        { label: 'Change this period', value: signedInr(r.periodNet), note: `+ means ${p.name} owes you more` },
        { label: 'Balance today', value: Math.abs(p.net) < 0.005 ? 'Settled' : inr(p.net), note: Math.abs(p.net) < 0.005 ? 'all square' : owesMe ? `${p.name} owes you` : `you owe ${p.name}`, tone: owesMe ? 'pos' : p.net < 0 ? 'neg' : undefined },
      ]} />

      {p.groups.length > 0 && (
        <>
          <Text style={s.h2}>By group</Text>
          <Table
            cols={[{ label: 'Group', width: '60%' }, { label: 'Balance', width: '40%', align: 'right' }]}
            rows={p.groups.map(g => ({ cells: [`${g.groupEmoji ?? ''} ${g.groupName}`.trim(), Math.abs(g.net) < 0.005 ? 'Settled' : `${g.net > 0 ? `${p.name} owes you` : 'you owe'} ${inr(g.net)}`], tone: [undefined, g.net > 0 ? 'pos' : g.net < 0 ? 'neg' : undefined] }))}
          />
        </>
      )}

      <Text style={s.h2}>Together, by date</Text>
      {r.items.length === 0 ? <Text style={s.muted}>Nothing between you two in this period.</Text> : (
        <Table
          cols={[{ label: 'Date', width: '13%' }, { label: 'What', width: '33%' }, { label: 'Group', width: '18%' }, { label: 'Paid by', width: '12%' }, { label: 'Amount', width: '12%', align: 'right' }, { label: 'Effect', width: '12%', align: 'right' }]}
          rows={withMonths(r.items, multi).map(({ r: i, month }) => ({
            month,
            cells: [fmtDate(i.date).replace(/ \d{4}$/, ''), `${i.emoji ? `${i.emoji} ` : ''}${i.title}`, i.groupName, i.paidByName, inr(i.amount), signedInr(i.impact)],
            tone: [undefined, undefined, undefined, undefined, undefined, i.impact > 0 ? 'pos' : i.impact < 0 ? 'neg' : undefined],
          }))}
        />
      )}
      <Text style={[s.muted, { fontSize: 7.5, marginTop: 4 }]}>Effect: + means {p.name} owes you more, − means you owe {p.name} more (a payment from {p.name} shows as −).</Text>
      {simplifiedDiffers(p) ? <Text style={[s.muted, { fontSize: 7.5, marginTop: 2 }]}>Balances follow each group&apos;s simplified settle-up (fewest payments), so they can differ from adding up the rows above.</Text> : null}
    </Doc>
  );
  return toFile(doc, `FinWise_${safe(p.name)}_${safe(label)}.pdf`);
}

export { C };

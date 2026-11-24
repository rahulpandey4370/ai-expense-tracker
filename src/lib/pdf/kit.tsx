// Building blocks for FinWise PDFs (real vector documents via @react-pdf/renderer — not screenshots).
// Browser-only: import this module dynamically from a click handler.
import { Document, Font, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import type { ReactElement } from 'react';

let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  // Browser: served from /fonts. Node (scripts/checks): read from public/fonts on disk.
  const base = typeof window !== 'undefined' ? window.location.origin : `${process.cwd()}/public`;
  Font.register({ family: 'Noto Sans', fonts: [
    { src: `${base}/fonts/NotoSans-Regular.ttf` },
    { src: `${base}/fonts/NotoSans-Bold.ttf`, fontWeight: 700 },
  ] });
  Font.register({ family: 'Newsreader', fonts: [
    { src: `${base}/fonts/Newsreader-Medium.ttf`, fontWeight: 500 },
    { src: `${base}/fonts/Newsreader-SemiBoldItalic.ttf`, fontWeight: 600, fontStyle: 'italic' },
  ] });
  // Emoji render as small images (Twemoji, CC-BY 4.0).
  Font.registerEmojiSource({ format: 'png', url: 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/' });
  Font.registerHyphenationCallback(word => [word]); // never hyphenate names/merchants
  fontsReady = true;
}

export const C = {
  ink: '#14201f', sec: '#5a6f6d', line: '#dfe9e7', zebra: '#f5faf9',
  accent: '#0b6f72', soft: '#e3f4f2', pos: '#15803d', neg: '#c2410c',
};

export const inr = (n: number) =>
  `₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: Math.round(n * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const signedInr = (n: number) => (Math.abs(n) < 0.005 ? '₹0' : `${n > 0 ? '+' : '−'}${inr(n)}`);
export const fmtDate = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
export const monthName = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

export const s = StyleSheet.create({
  page: { fontFamily: 'Noto Sans', fontSize: 9.5, color: C.ink, paddingTop: 34, paddingBottom: 52, paddingHorizontal: 36, lineHeight: 1.35 },
  band: { backgroundColor: C.accent, color: '#fff', borderRadius: 10, padding: 16, marginBottom: 14 },
  brand: { fontFamily: 'Newsreader', fontSize: 11, opacity: 0.9 },
  title: { fontFamily: 'Newsreader', fontWeight: 500, fontSize: 24, lineHeight: 1.15, marginTop: 8 },
  sub: { fontSize: 9.5, opacity: 0.9, marginTop: 4 },
  tiles: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tile: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 10 },
  tileLabel: { fontSize: 7.5, color: C.sec, textTransform: 'uppercase', letterSpacing: 0.6 },
  tileValue: { fontSize: 15, fontWeight: 700, lineHeight: 1.2, marginTop: 4 },
  tileNote: { fontSize: 7.5, color: C.sec, marginTop: 3 },
  h2: { fontFamily: 'Newsreader', fontWeight: 500, fontSize: 14, lineHeight: 1.2, marginTop: 10, marginBottom: 6 },
  muted: { color: C.sec },
  table: { borderWidth: 1, borderColor: C.line, borderRadius: 8, overflow: 'hidden', marginBottom: 6 },
  tr: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: C.line },
  th: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, backgroundColor: C.soft },
  thText: { fontSize: 7.5, fontWeight: 700, color: C.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
  monthRow: { paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#fafcfc', borderTopWidth: 1, borderTopColor: C.line },
  monthText: { fontSize: 8, fontWeight: 700, color: C.sec },
  pill: { fontSize: 8, color: C.accent, backgroundColor: C.soft, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  para: { marginBottom: 6 },
  footer: { position: 'absolute', bottom: 22, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: C.sec },
});

export function Header({ title, subtitle, right }: { title: string; subtitle: string; right?: string }) {
  return (
    <View style={s.band}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={s.brand}>finwise <Text style={{ fontWeight: 600, fontStyle: 'italic' }}>split</Text></Text>
        {right ? <Text style={{ fontSize: 8, opacity: 0.85 }}>{right}</Text> : null}
      </View>
      <Text style={s.title}>{title}</Text>
      <Text style={s.sub}>{subtitle}</Text>
    </View>
  );
}

export function Tiles({ items }: { items: { label: string; value: string; note?: string; tone?: 'pos' | 'neg' }[] }) {
  return (
    <View style={s.tiles}>
      {items.map((t, i) => (
        <View key={i} style={s.tile}>
          <Text style={s.tileLabel}>{t.label}</Text>
          <Text style={[s.tileValue, t.tone === 'pos' ? { color: C.pos } : t.tone === 'neg' ? { color: C.neg } : {}]}>{t.value}</Text>
          {t.note ? <Text style={s.tileNote}>{t.note}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export interface Col { label: string; width: number | string; align?: 'left' | 'right' }

/** A table that repeats its header on each page and never splits a row. Rows may carry a month heading. */
export function Table({ cols, rows }: { cols: Col[]; rows: ({ month?: string; cells: (string | ReactElement)[]; tone?: ('pos' | 'neg' | undefined)[] })[] }) {
  return (
    <View style={s.table}>
      <View style={s.th} fixed>
        {cols.map((c, i) => <Text key={i} style={[s.thText, { width: c.width as any, textAlign: c.align ?? 'left' }]}>{c.label}</Text>)}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} wrap={false}>
          {r.month ? <View style={s.monthRow}><Text style={s.monthText}>{r.month}</Text></View> : null}
          <View style={[s.tr, ri % 2 ? { backgroundColor: C.zebra } : {}]}>
            {r.cells.map((cell, ci) => (
              typeof cell === 'string'
                ? <Text key={ci} style={[{ width: cols[ci].width as any, textAlign: cols[ci].align ?? 'left' }, r.tone?.[ci] === 'pos' ? { color: C.pos } : r.tone?.[ci] === 'neg' ? { color: C.neg } : {}]}>{cell}</Text>
                : <View key={ci} style={{ width: cols[ci].width as any }}>{cell}</View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export function Footer({ note }: { note: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{note}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

export function Doc({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Document title={title} author="FinWise" creator="FinWise" producer="FinWise">
      <Page size="A4" style={s.page}>{children}</Page>
    </Document>
  );
}

/** Render a document to a File ready to view, download or share. */
export async function toFile(doc: ReactElement, filename: string): Promise<File> {
  registerFonts();
  const blob = await pdf(doc as any).toBlob();
  return new File([blob], filename, { type: 'application/pdf' });
}

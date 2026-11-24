# Round 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Spec:** docs/superpowers/specs/2026-11-24-split-round4-design.md
**Tech Stack:** Next 15, React 18, Tailwind 3, recharts 2.15, @react-pdf/renderer.

## Global Constraints
- Colours only from `TYPE_COLORS` (+ teal for Split). No DDL, no new dependencies.
- KPI numbers come from one pure function shared by the screen and the PDF.

## Review Focus
- Month with no expenses but payments; group with one member; removed members with history.
- Hero lines when the selected month differs from the newest month.
- Owed breakdown sums must equal the hero total.
- Legend chips must not fight the existing filter dropdowns (same state).

### Task 1: `groupKpis(d, from?, to?)` in `src/lib/split/report.ts` + check
Returns totals, count, avg per expense, avg per day, biggest, payments total, top payer, per-person paid/share/net, and
`byMonth` (last 6 months with activity). `groupLines(d, month)` takes a month.

### Task 2: group screen KPI strip + insights sheet (2 charts)
### Task 3: PDF group report KPIs + summary
### Task 4: Home owed breakdown sheet
### Task 5: indicators + palette fixes
Verify: tsc, all checks, gate, mocked browser screenshots; fresh review; deploy.

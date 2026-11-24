# Split Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix the group back button, surface edit/delete, add "Paid with", group edit/delete, and a home feed filter.

**Architecture:** Client-side feed filtering over a full activity list from `getHome`; `paidWith` lives in
`split_expenses.meta` (no DDL); group edit uses the existing `updateGroup` op.

**Tech Stack:** Next 15, React 18, TanStack Query, zod, Supabase (service role).

**Spec:** docs/superpowers/specs/2026-11-24-split-polish-design.md

## Global Constraints
- No DDL. INR only. Everyone in a group can add/edit/delete; group edit/delete needs `canManage`.
- Only the owner stores a payment-method `id`; `paidWith.name` ≤ 60 chars.
- Activity cap 2000.

## Review Focus
- An edit that doesn't send `paidWith` (voice/scan/chat saves) must keep the existing value.
- A friend editing an owner expense must not wipe the owner's `paidWith.id`… accepted: their save sends the name they see; id is dropped (ruling: friends can change "paid with"; id only matters for owner's own spending link, which already stores the method on the transaction).
- Person filter must include settlements where the person is either party.
- Custom range with only one end set filters open-ended.
- Owner payer + "Add to my spending": spending.paymentMethodId comes from Paid with.

---

### Task 1: Feed filter
**Files:** Create `src/lib/split/feed.ts`, `src/lib/split/feed.check.ts`; modify `src/lib/split/types.ts` (ActivityItem: `date: string; people: string[]`), `src/lib/split/service.ts` (getHome: fill date/people, sort by date desc then at desc, cap 2000), `src/components/split/home-tabs.tsx` (filter chips + summary; month headers from `date`).
**Interfaces:** `filterActivity(items, f: FeedFilter): ActivityItem[]`; `FeedFilter = { groupId?: string; person?: string; from?: string; to?: string }`; `feedMonths(items): string[]` (YYYY-MM, newest first); `monthRange(ym): { from, to }`.
- [ ] check: group, person (expense payer/sharer and settlement party), from-only, to-only, both, combined; months unique/newest first; monthRange('2026-02') → 02-01..02-28.
- [ ] run → FAIL; implement → ok; commit.

### Task 2: Paid with
**Files:** `types.ts` (ExpenseMeta.paidWith), `route.ts` (saveExpense `paidWith` nullable optional), `service.ts` (meta merge), `expense-sheet.tsx`, `receipt-view.tsx`.
- [ ] implement; tsc; mocked-API browser check that the owner-payer sees the dropdown and a guest sees the text box; commit.

### Task 3: Group header, group sheet, delete buttons
**Files:** `split.css` (`.s-icon-btn`), `group-view.tsx`, new `group-sheet.tsx`, `members-sheet.tsx` (drop delete), `receipt-view.tsx` (Delete), settlement rows.
- [ ] implement; screenshot header; tsc, checks, gate; commit; deploy.

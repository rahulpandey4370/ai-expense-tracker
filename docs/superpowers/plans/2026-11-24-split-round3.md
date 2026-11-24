# Split Round 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal / Spec:** docs/superpowers/specs/2026-11-24-split-round3-design.md
**Tech Stack:** Next 15, React 18, TanStack Query, zod, Supabase (service role).

## Global Constraints
- No DDL. Owner-only: `linkTransactionId`, `expenseForTransaction`.
- Hero lines only from loaded data.

## Review Focus
- Linking must not create a second transaction, and must refuse a transaction already in another group expense.
- A non-owner (friend / link guest) can never link or look up transactions.
- Month picker: a group whose newest month changes after adding an expense; switching groups resets month and page.
- Hero lines with an empty group / no activity.

### Task 1: hero lines + tap to type
Pure `homeLines(data, today)` / `groupLines(detail, today)` in `src/lib/split/hero-lines.ts` with a check;
`Hero.onSay`; `VoiceSheet.startTyping`.

### Task 2: home order + group month picker
Pure `monthPage(items, month, page, size=50)` in `src/lib/split/feed.ts` with checks; home-tabs and group-view UI.

### Task 3: link an existing transaction
Server: route zod `linkTransactionId`, `expenseForTransaction` op; service link logic. Client: transaction-form,
SplitComposer/ExpenseSheet pass-through. Verify: tsc, checks, gate, mocked browser.

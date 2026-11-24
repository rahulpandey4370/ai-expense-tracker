# Split Full-Amount Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Settings switch makes splits I paid count at full amount in the main app, and group expenses stay out of Transactions unless I tick "Add to my spending".

**Architecture:** `transactions.net_amount` becomes a trigger-maintained column driven by `app_settings.split_full_amount`; an RPC flips the setting and recalculates. Client `netAmount()` prefers the server value. Expense sheet defaults the checkbox off and hides it in main-app flows.

**Tech Stack:** Postgres (Supabase), PGlite for local SQL checks, Next 15 server actions, TanStack Query.

**Spec:** docs/superpowers/specs/2026-11-24-split-full-amount-design.md

## Global Constraints
- Claude never runs DDL on the live DB; the owner pastes `supabase/split-full-amount.sql` into the SQL editor.
- `app_settings` RLS on, no policies, revoked from anon/authenticated; new functions executable by service_role only.
- Switch off reproduces today's `net_amount` exactly (`coalesce(my_share, amount)`).
- Setting key `split_full_amount`, seeded `true`.
- If the setting row is missing, behave as off.

## Review Focus
- App deployed before the SQL is run: the settings read must not crash Settings/Home (treat missing table as "off", switch disabled with a hint).
- Edits to amount/my_share/paid_by_id after the switch flips must recompute net_amount (trigger on update).
- A friend-paid transaction (paid_by_id set) must stay at my share with the switch on.
- Toggling must refresh cached totals everywhere (invalidate all queries).
- Transaction detail "Your share" and export "Your share" must keep showing my share when the switch is on.

---

### Task 1: SQL migration + local check

**Files:**
- Create: `supabase/split-full-amount.sql`
- Create: `supabase/split-full-amount.check.mjs` (runs with the PGlite install in the session scratchpad; documented in its header)

**Interfaces:**
- Produces: table `app_settings(key text pk, value jsonb, updated_at timestamptz)`; `my_spend(amount numeric, my_share numeric, paid_by_id text) returns numeric`; trigger `transactions_net_amount` (before insert/update of amount, my_share, paid_by_id); RPC `set_split_full_amount(p_on boolean) returns void` (upserts setting, recalculates all rows).

- [ ] Step 1: write the check: load schema.sql + functions.sql + migration in PGlite; insert t1 (I paid 300, my_share 100), t2 (friend paid 500, my_share 200), t3 (unsplit 80). Assert net_amount = 300/200/80 (seeded on); `set_split_full_amount(false)` → 100/200/80; update t1.amount to 600, my_share 200 → 200; flip on → 600; migration runs twice without error; `transactions_expanded` still selects net_amount.
- [ ] Step 2: run it — Expected: FAIL (migration file missing).
- [ ] Step 3: write the migration (`alter column net_amount drop expression`, guarded so a rerun is a no-op).
- [ ] Step 4: run — Expected: `ok`.
- [ ] Step 5: commit.

### Task 2: server actions + client helper

**Files:**
- Modify: `src/lib/split-utils.ts` (`netAmount = t.netAmount ?? t.myShare ?? t.amount`; `othersShare = t.amount - (t.myShare ?? t.amount)`)
- Create: `src/lib/split-utils.check.ts`
- Create: `src/lib/actions/settings.ts`: `getSplitFullAmount(): Promise<{ on: boolean; ready: boolean }>` (ready=false when the table is missing), `setSplitFullAmount(on: boolean): Promise<void>` (calls the RPC, revalidates `/`)
- Modify: `src/components/recent-transactions-list.tsx:171` and `src/lib/export.ts:153` to use `t.myShare ?? t.amount` for "Your share"

- [ ] Step 1: check asserts: `netAmount({amount:100,myShare:40,netAmount:100})===100`, `othersShare(same)===60`, `netAmount({amount:100,myShare:40})===40`, `netAmount({amount:100})===100`.
- [ ] Step 2: run — Expected: FAIL on the first assert.
- [ ] Step 3: implement; run — Expected: `ok`.
- [ ] Step 4: commit.

### Task 3: Settings switch + expense sheet default

**Files:**
- Modify: `src/app/settings/page.tsx` (Profile tab card "Split expenses": Switch bound to the two actions; on change `queryClient.invalidateQueries()`; disabled with "Run supabase/split-full-amount.sql first" when `ready` is false)
- Modify: `src/components/split/expense-sheet.tsx` (`fromMainApp = !!spendingDefaults`; new expense: `inSpending` starts `fromMainApp`; checkbox rendered only when `!fromMainApp`; label "Add to my spending")

- [ ] Step 1: implement both.
- [ ] Step 2: verify: tsc (21 pre-existing errors only), all checks, production build exit 0, gate 14/14; open /groups expense sheet on the share page with mocked API and confirm the box is unticked.
- [ ] Step 3: commit; give the owner the SQL to paste.

# Settl-style Split — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real Supabase Google auth with owner/friend roles, and a Settl-style group split ledger shared via accounts or private links.

**Architecture:** `@supabase/ssr` cookie sessions + `src/middleware.ts` gate (server actions owner-only). A new `split_*` ledger (Postgres) is served by one route handler `/api/split` (op-dispatch, one access check) and rendered by one `SplitApp` component tree in three shells (owner tab, friend app, guest link).

**Tech Stack:** Next 15.3 App Router, React 18, TanStack Query 5, Supabase (service-role server client + `@supabase/ssr`), zod, Tailwind/shadcn, `tsx` for checks.

**Spec:** `docs/superpowers/specs/2026-11-24-settl-style-split-design.md`

## Global Constraints

- Owners = emails in `OWNER_EMAILS` (comma-separated, case-insensitive). Everyone else signed in = friend.
- Env: `SUPABASE_PROJECT_URL`, server-only `SUPABASE_ANON_KEY`, `OWNER_EMAILS`; never print values.
- Money in INR rupees as `numeric`; all share math in integer paise; shares must sum exactly to the amount.
- Share token: 32 random bytes base64url in `split_groups.share_token`.
- No DDL run against the live DB; SQL goes in `supabase/split-groups.sql`.
- Visual: FinWise teal (`#008080` family), coral for "you owe", serif display + italic accent word, pill buttons. No Settl wordmark/mascots/copy.
- Checks are `assert`-based `*.check.ts` files run with `npx tsx <file>` (no test framework in repo).

## Review Focus

1. Uneven paise (₹100 ÷ 3, 33.33%) → shares sum exactly to amount; leftover goes to first participants, never dropped. (Task 1)
2. Friend calling another group's id, or guest token for group A used on group B → 404/403. (Task 4 check)
3. Signed-in non-owner hitting `/`, `/transactions` or any server action → redirected/403, not data. (Task 3 manual verify)
4. Editing/deleting an owner-linked expense → linked `transactions` row updated/deleted too, KPIs stay right. (Task 5)
5. Exact/percent inputs that don't add up → save blocked with "₹X left"/"₹X over", not a silent mismatch. (Task 1 + Task 6)

---

### Task 1: Split math (pure)

**Files:** Create `src/lib/split/math.ts`, `src/lib/split/math.check.ts`

**Interfaces — Produces:**
- `type SplitMethod = 'equal'|'exact'|'percent'|'shares'|'items'|'cover'`
- `resolveShares(amount: number, method: SplitMethod, input: ShareInput): { shares: Record<string, number>; error?: string }`
  - `ShareInput = { participants: string[]; values?: Record<string, number>; items?: {name: string; amount: number; memberIds: string[]}[]; coveredBy?: string }`
  - equal: split across participants; exact: `values` are rupees, must sum to amount; percent: must sum to 100; shares: weights; items: each item split equally among its `memberIds`, item total must equal amount; cover: `coveredBy` owes everything.
- `computeBalances(members: string[], expenses: {paidBy: string; shares: Record<string, number>}[], settlements: {from: string; to: string; amount: number}[]): Record<string, number>` (positive = is owed)
- `simplifyDebts(balances: Record<string, number>): {from: string; to: string; amount: number}[]` (greedy largest creditor ↔ largest debtor)

- [ ] Write `math.check.ts` asserting: equal ₹100/3 → [33.34,33.33,33.33] sum 100; percent 33.33/33.33/33.34 of ₹1000 sums 1000; exact mismatch returns `error` containing "left"; shares 2:1 of ₹90 → 60/30; items (₹60 pizza A+B, ₹40 wine B) → A 30, B 70; cover → coveredBy 100; balances with settlement net to zero; simplify of A:+50,B:-30,C:-20 → 2 transfers.
- [ ] Run `npx tsx src/lib/split/math.check.ts` → fails (module missing).
- [ ] Implement in paise; leftover paise to first participants in order.
- [ ] Run → prints `ok`. Commit.

### Task 2: Schema + migration SQL

**Files:** Create `supabase/split-groups.sql`

Tables per spec (`split_groups`, `split_members`, `split_expenses`, `split_expense_shares`, `split_settlements`), indexes on `group_id`, `split_members(user_id)`, `split_members(lower(email))`. Function `split_save_expense(p_expense jsonb, p_shares jsonb)` upserting expense + replacing shares atomically. Data migration block (idempotent, guarded by `not exists`): each `split_users` row → `direct` group "You & <name>" with owner member + that person; each transaction having splits/paid_by → `split_expenses` (method `exact`, `transaction_id` linked) + shares; settled shares / `my_share_settled` → `split_settlements`.

- [ ] Write SQL. Commit. (Owner applies it — see checklist.)

### Task 3: Supabase Auth + middleware

**Files:** Create `src/lib/auth/supabase-server.ts`, `src/lib/auth/supabase-browser.ts`, `src/lib/auth/roles.ts`, `src/app/auth/callback/route.ts`, `src/middleware.ts`. Modify `src/contexts/AuthContext.tsx`, `src/app/login/page.tsx`, `src/components/layout/protected-layout-wrapper.tsx`. Delete `src/lib/actions/auth.ts`. Add dep `@supabase/ssr`.

**Produces:** `getSessionUser(): Promise<{id: string; email: string; name: string; isOwner: boolean} | null>` (server); `isOwnerEmail(email?: string|null): boolean`; `useAuth()` keeps `{isAuthenticated, isLoadingAuth, logout}` and adds `user`, `isOwner`, `loginWithGoogle()`.

Middleware rules: public = `/login`, `/auth/*`, `/s/*`, `/demo`, `/api/sms`, `/api/notify/*`, `/api/review/*`, `/api/split`, assets (`_next`, `manifest.json`, `sw.js`, `workbox-*`, images). `Next-Action` header → owner or 403. Non-owner signed-in on owner page → redirect `/groups`. Signed-out → `/login?next=`.

- [ ] Implement; `npm run typecheck` passes. Verify manually: signed-out `/` → `/login`; `curl -X POST -H 'Next-Action: x' localhost:9002/` → 403. Commit.

### Task 4: Split service + `/api/split`

**Files:** Create `src/lib/split/access.ts`, `src/lib/split/service.ts`, `src/lib/split/types.ts`, `src/app/api/split/route.ts`, `src/lib/split/access.check.ts`

**Produces:**
- `type Access = {kind:'owner'|'friend'; userId: string; email: string; name: string} | {kind:'guest'; groupId: string}`
- `resolveAccess(req: Request): Promise<Access|null>` — session first, else `x-split-token` header → hash lookup.
- `canSeeGroup(access, group, members): boolean` (pure, tested in `access.check.ts`)
- POST `/api/split` body `{op, ...}` → JSON. Ops: `home`, `group`, `createGroup`, `updateGroup`, `addMember`, `updateMember`, `removeMember`, `saveExpense`, `deleteExpense`, `settle`, `deleteSettlement`, `shareLink` (regenerate), `linkToSpending`. zod-validated per op; errors → `{error}` with 400/403/404.
- `home` returns `{me, groups:[{id,name,emoji,kind,myBalance,lastActivity}], people:[{name, email, net}], totals:{owed, owe}, activity:[...]}`; `group` returns `{group, members, expenses, settlements, balances, transfers, meMemberId}`.

- [ ] Write `access.check.ts`: owner sees any group; friend sees only groups with their userId/email; guest only its groupId. Run → fail. Implement. Run → ok.
- [ ] Implement service + route; typecheck. Commit.

### Task 5: Owner spending link

**Files:** Modify `src/lib/split/service.ts`

`saveExpense` with `access.kind==='owner'` and `spending: {categoryId, paymentMethodId, expenseType}` → upsert linked `transactions` row (amount = full if owner paid else owner share; `my_share` = owner share; `is_split` true; description; date). Delete expense → delete linked transaction. Edit → update it. Owner share 0 → remove link. `linkToSpending` op does the same for an existing expense.

- [ ] Implement; manual verify in dev after SQL applied. Commit.

### Task 6: Settl-style UI

**Files:** Create `src/components/split/` — `split-app.tsx` (tabs + routing via `?g=`), `use-split.ts` (react-query over `/api/split`, sends token header for guests), `home-tab.tsx`, `group-view.tsx`, `expense-sheet.tsx` (method chips, live review rows, left/over indicator, owner-only spending pickers), `settle-sheet.tsx` (suggested transfers + Mark as paid + UPI handoff), `members-sheet.tsx` (add by name/email, share link copy/regenerate), `people-tab.tsx`, `activity-tab.tsx`, `insights-tab.tsx`, `split.css` tokens (scoped under `.split-ui`).
Modify `src/app/split-expenses/page.tsx` (render `<SplitApp mode="owner"/>`). Create `src/app/groups/page.tsx` (friend shell), `src/app/s/[token]/page.tsx` (guest shell, "I am X" picker stored in localStorage).

- [ ] Build; `npm run typecheck`; run dev and click through create group → add expense (each method) → settle → share link in a private window. Commit.

### Task 7: Point old split entry points at groups

**Files:** Modify `src/components/transaction-form.tsx`, `src/components/splits/split-editor.tsx`, `src/lib/split-utils.ts`, AI entry caller.

Transaction form "Split" section → pick group/person + method; on save create transaction then `saveExpense` linked to it. Remove writes to `transaction_splits` for new entries (old rows stay readable).

- [ ] Implement; typecheck; manual verify. Commit.

### Owner checklist
See spec "Owner checklist". Phase 2/3 items are separate plans.

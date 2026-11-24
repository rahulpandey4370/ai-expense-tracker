# Settl-style Split + real auth — design

Date: 2026-11-24 · Branch: `feat/settl-style-split`

## Why

The owner wants the Split tab to work and feel like Settl (settl.fyi): groups, every split type,
fewest-transfer settle-up, and — the real driver — the ability to **share a group with friends** so
both sides see and edit the same ledger. Today friends are just names, and the app's login is a
browser-only flag the server never checks, so nothing can safely be shared.

## Goals

1. Real auth: Supabase Auth with **Sign in with Google** (free tier; no auth email sending needed).
2. **Owners** (emails in `OWNER_EMAILS`) get the whole app. **Anyone else** who signs in is a
   *friend*: they only see the split groups they belong to (option A).
3. **Share links**: a private link opens one group with no account. Visitor picks "I am X".
4. Settl-style Split: groups (trip/home/couple/other) and 1-on-1 balances, split types
   equal / exact / percent / shares / item-by-item / "I cover", leftover paise allocated, settle-up
   with fewest transfers, mark as paid, balances per person across groups.
5. Owner's personal finance stays correct: an expense the owner adds in a group links to a
   personal `transactions` row so KPIs/budgets/reports keep counting only the owner's share.

## Non-goals (now)

- Option B (each account gets its own full finance tracker). Design must not block it: group tables
  carry no owner-only assumptions beyond "owner = member with `user_id`".
- Moving money. Settle-up records payments; a UPI deep link (`upi://pay`) is a handoff, not a payment.

## Anti-goals

- Copying Settl's code, wordmark, mascots or marketing copy. We copy **patterns** (balance headline,
  tabbed split home, split review rows, pill buttons, settle-up cards), in FinWise's own teal.
- Friends seeing anything outside their groups. Friend expenses silently landing in the owner's KPIs.

## Constraints

- Next 15.3 App Router on Vercel; Supabase Postgres accessed with the **service-role key**
  (RLS bypassed) — so server code is the only access control. Every group read/write goes through
  one access helper.
- Supabase free plan: 50k MAU, default SMTP only mails org members → Google OAuth only.
- No DDL run against the live DB by Claude: migration SQL lives in `supabase/split-groups.sql` and
  the owner applies it.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| 1 | Separate app synced to this one | Two DBs + sync conflicts. Rejected as overkill. |
| **2+3** | **Share links + friend accounts inside this app, one DB** | **Picked.** One ledger, changes show up on both sides instantly. |
| — | Keycloak | Can't run on Vercel; rejected for Supabase Auth (free, already used). |

## Architecture

### Auth
- `@supabase/ssr` cookie sessions. `/login` → Google OAuth → `/auth/callback` exchanges the code.
- `middleware.ts` refreshes the session and enforces:
  - Public: `/login`, `/auth/*`, `/s/*` (share links), `/demo`, `/api/sms`, `/api/notify/*`,
    `/api/review/*` (own bearer secrets), `/api/split` (does its own auth), static/PWA assets.
  - **Any server-action request (`Next-Action` header) requires an owner** — covers all 83 existing
    actions in one place. Friends/guests never call server actions; they use `/api/split`.
  - Owner-only pages/APIs: everything else. A signed-in friend is redirected to `/groups`.
- `AuthContext` reads the Supabase session; `ProtectedLayoutWrapper` exempts `/groups` and `/s/*`.
- On first friend sign-in, `group_members` rows with a matching (Google-verified) email are claimed
  (`user_id` set).

### Data model (new tables; existing ones untouched except a FK column)
- `split_groups(id, name, emoji, kind[trip|home|couple|other|direct], currency, share_token_hash,
  created_at, updated_at, archived_at)`
- `split_members(id, group_id, name, email, user_id, is_owner, created_at, removed_at)`
- `split_expenses(id, group_id, description, amount, date, emoji, method
  [equal|exact|percent|shares|items|cover], paid_by, created_by, meta jsonb (items, weights),
  transaction_id → transactions, created_at, updated_at, deleted_at)`
- `split_expense_shares(expense_id, member_id, amount)` — resolved shares, always sum to amount.
- `split_settlements(id, group_id, from_member, to_member, amount, date, note, created_by,
  created_at, deleted_at)`
- Balance per member = paid − owed + settlements sent − settlements received. Simplify = greedy
  match of largest creditor with largest debtor (≤ n−1 transfers). Shares are never "flagged
  settled"; settlements are first-class rows, so fewest-transfer payments (A→C) are representable.

### Access helper
`resolveAccess(req)` → `{kind:'owner'|'friend', userId, email}` or `{kind:'guest', groupId,
memberId?}` from the share-token cookie. `assertGroupAccess(groupId, access)` gates every op.
Owners see all groups; friends see groups where they're a member; guests see only their token's group.

### Share links
32 random bytes, base64url; only the SHA-256 hash is stored. Regenerating revokes the old link.
`/s/[token]` sets an httpOnly cookie with the token and shows the group; "I am X" is stored in a
second cookie and used as `created_by`/default payer.

### Owner's personal ledger
- Owner adds a group expense → also writes a `transactions` row: amount = full amount if owner paid,
  else owner's share; `my_share` = owner's share; linked via `split_expenses.transaction_id`.
  Edits/deletes keep it in sync.
- Friend-added expense that includes the owner → shown on the owner's Split home with
  "Add to my spending" (one tap creates the linked transaction). No silent writes.
- Old `transaction_splits`/`split_users` data: migration SQL copies each person into a `direct`
  group and each split transaction into a linked `split_expense`; settled shares become settlements.
  The transaction form's split editor and AI split parsing write to the group model afterwards.

### UI (Settl patterns, FinWise teal)
Tokens: accent `#008080`-family teal, soft tint cards, coral for "you owe", serif display headings
with an italic accent word, pill buttons. One `SplitApp` component tree used in three shells:
- `/split-expenses` (owner, inside the app shell), `/groups` (friend standalone), `/s/[token]` (guest).
- Tabs: **Home** (headline "You're owed ₹X / You owe ₹Y", groups by recent activity, Add expense),
  **People** (net per person across groups, settle up), **Activity** (feed), **Insights**
  (spend by group/month). Group screen: balance strip, expense cards ("You paid ₹164 · you lent
  ₹123"), Settle up sheet with suggested transfers + Mark as paid, members & share link sheet.
- Add expense sheet: amount, description, payer, participants, method chips, live per-person review
  rows with remaining/over indicator.

## Phases

1. **Auth + groups core** (this branch): auth, middleware, tables, `/api/split`, all split types,
   settle-up, share links, friend app, redesigned UI, owner transaction link, migration SQL.
2. Comments, undo, duplicate warning, search, WhatsApp reminder with UPI link.
3. Multi-currency (Frankfurter FX), receipt scan, voice entry (reuse existing mic/AI entry).

## Owner checklist (manual)
1. Google Cloud → OAuth client (Web), redirect `https://<project>.supabase.co/auth/v1/callback`.
2. Supabase → Auth → Providers → Google: paste client id/secret. Auth → URL config: Site URL =
   Vercel domain; redirect URLs = `https://<domain>/auth/callback`, `http://localhost:9002/auth/callback`.
3. Env (Vercel + `.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `OWNER_EMAILS` (comma-separated).
4. Run `supabase/split-groups.sql` in the Supabase SQL editor (after a backup).

## Calls made by Claude (correct any)
- Friends/guests talk to one `/api/split` endpoint, not server actions — lets middleware block all
  server actions for non-owners without relying on Next internals.
- Friend-added expenses use an "Add to my spending" button rather than the SMS pending queue
  (that table is SMS-shaped: raw text, hash).
- Single payer per expense (Settl's flows are single-payer).
- `/api/chat` and `/api/read` become owner-only (today anyone can call them and spend AI credits);
  the public `/demo` page loses AI features for signed-out visitors.
- Old email/password env login is removed in favour of Google.

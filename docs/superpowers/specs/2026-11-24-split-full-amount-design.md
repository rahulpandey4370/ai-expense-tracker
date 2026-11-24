# Split expenses: full amount as my spend, and group expenses stay in FinWise Split

## Why
The owner pays every shared bill; splitting is only for tracking who owes what. So the main app (Home, Transactions,
Reports, budgets, alerts, AI) should count the full amount of a split the owner paid. Group expenses logged inside
FinWise Split should not appear in the main app unless the owner adds them.

## Decisions (approved by the owner, 2026-11-24)
1. **Settings switch** "Count the full amount of splits I paid" (Settings → Profile). On: a transaction I paid
   (`paid_by_id is null`) counts at `amount`. Off: `coalesce(my_share, amount)` as today. When a friend paid, my share
   counts either way. Starts **on**. Flipping it recalculates every transaction.
2. **"Add to my spending"** stays only in FinWise Split's expense sheet, and starts **unticked** for new expenses.
   Main-app entry points (transaction form "Split this expense", SMS inbox Split, AI chat) don't show the checkbox;
   logging there always creates the transaction (unchanged behaviour).
3. Group expenses already in Transactions stay; deleting one on Transactions leaves the group expense alone (FK is
   `on delete set null`).
4. Split screens, balances and settle-ups are unchanged; only "my spend" totals change.

## Approach
`transactions.net_amount` already exists (generated `coalesce(my_share, amount)`) and every server-side total reads it
(yearly/category SQL functions, notifications, the row mapper). Turn it into a normal column filled by a trigger that
reads the setting from a new `app_settings` table; an RPC flips the setting and recalculates all rows in one
transaction. The client helper `netAmount()` prefers the server's `netAmount`, so all ~35 client totals follow.
Displays that mean "your share" read `myShare` directly.

Rejected: changing each of the ~35 client call sites plus the SQL functions to read the setting — many places to keep
consistent, and server totals (alerts, SQL functions) would need their own copy of the rule.

## Constraints
- The owner runs DDL in the Supabase SQL editor; nothing is run against the live DB by Claude.
- `app_settings`: RLS on, no policies, privileges revoked from anon/authenticated; new functions executable only by
  service_role (matches `supabase/rls-lockdown.sql`).
- Switch off must reproduce today's numbers exactly.

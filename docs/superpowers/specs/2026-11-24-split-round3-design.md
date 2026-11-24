# FinWise Split round 3: split old transactions into groups, group month picker, home order, real hero lines

Approved by the owner 2026-11-24 (item 3: option 2).

## Decisions
1. **Split an existing transaction into a group.** Editing an expense transaction (owner): "Split this expense" opens
   the group composer prefilled from the form. Saving creates the group expense *linked to that transaction*
   (`saveExpense.linkTransactionId`, owner only, new expense only) — no duplicate transaction. On link the server clears
   the transaction's old Quick-split rows (`transaction_splits`, the `legacy_<tx>` bridged expense) and `paid_by_id`,
   then the normal spending sync sets amount/my_share/is_split/category/payment. A transaction already linked to a real
   group expense shows "Edit split", which opens that expense in FinWise Split (new op `expenseForTransaction`).
   Refused: non-expense transactions, a transaction already linked to another group expense.
   Known edge: payments recorded against the old Quick split stay in Quick splits.
2. **Group month picker.** Native month select (months with activity, "November 2026 · 12"), newest month selected by
   default; more than 50 entries in a month → 50 per page with Prev/Next. Balances/totals stay whole-group.
3. **Home order (option 2).** Tabs unchanged. Home: hero → groups strip → recent activity (filters). Unfiltered recent
   shows the last 20; with a filter or search, all matches.
4. **Hero lines from real data**, no placeholders. Home: spent this month (my share), who owes whom (top 2), biggest
   expense this month, expenses this week. Group: total spent, my transfers, biggest expense, my share so far. Nothing
   yet → "Tap here to log an expense". Tapping the line opens the type-it box (VoiceSheet, mic off, keyboard focused).

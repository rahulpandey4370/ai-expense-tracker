# Split Phase 2 — Settl-parity UI, receipts, splits from every entry point

Spec: user request 2026-11-24 (see conversation) + `docs/superpowers/specs/2026-11-24-settl-style-split-design.md`.
Rule: copy Settl's layout/interaction patterns, not its mascots/wordmark/copy. Looks = our own 4 themes with
standard-emoji sidekicks. Luna = `openai::gpt-5.6-luna` (same as `SMS_MODEL`).

## Tasks
1. **Backend receipts + AI** — `meta.receipt` (storage path) + `meta.said` (voice/SMS text); private bucket
   `split-receipts` auto-created with the service key; `/api/split` ops `attachReceipt`, `receiptUrl` (signed, 1h,
   group-scoped), `scanReceipt` (Luna → items/total/date). `SPLIT_MODEL` constant. ActivityItem gains emoji/expenseId/paidByMe.
   Check: `npx tsx src/lib/split/voice.check.ts` + new receipt cleaner check.
2. **Looks + Home/feeds/tabs** — `data-look` themes (onyx/lagoon/coral/grape), wordmark + sidekick header with
   search + bell, hero card (owed/owe, "N expenses logged this week", scan/pencil/voice), Settl feed rows,
   groups strip, tabs Home/People/Insights/You (You = looks, import, how-to, sign out).
3. **Receipt view** — tap expense → receipt card (mono, dashed rules, zigzag edge, what-was-said quote, items,
   per-person totals, photo on top). Edit/delete from there.
4. **Capture from Home** — voice/scan/pencil open for last-used group with group chips to switch; ExpenseSheet
   gains receipt attach, scan, spending defaults, onSaved.
5. **SplitComposer + main-app entry points** — transaction form "Split this expense", AI parse rows with
   splitDetails (+ new `groupName`), SMS inbox Split button (note → parseVoice), chat tool `add_split_expense`
   (gated preview; receipt from chat attachment).
6. **Verify** — Luna on a generated receipt via parse-receipt flow, chat read_attachment prompt, split scan;
   Playwright screenshots (mocked API) of home/looks/receipt view; `next build`; gate.sh.

## Ledger
(append `Task N: complete …` / `Ruling:` lines here)

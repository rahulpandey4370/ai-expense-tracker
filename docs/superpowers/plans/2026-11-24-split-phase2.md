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
Task 1: complete (b2ed1bc) checks math/access/bridge/splitwise/voice/receipt ok; Ruling: SPLIT_MODEL follows SMS_MODEL (gpt-6-luna) — user switched SMS to gpt-6-luna and asked for one Luna across flows — cost: override via SPLIT_AI_MODEL
Task 6 (partial): Luna live-verified — split scan, voice x2, parse-receipt flow, chat read_attachment all correct on generated GST receipt; fixed JSON-mode prompt bug (59ac711)
Tasks 2-4: complete (6368575); guest page screenshots grape/coral + receipt view OK; Ruling: Home/You tabs not screenshotted (behind Google login) — user to check at localhost
Task 5: complete (321aad1); Luna parse picked groupName 'Goa trip' + participants live; Ruling: editing an existing transaction keeps the old split editor (legacy Quick splits) — only new entries go through groups — cost: can't move an old transaction into a group from the form
Final review (phase 2): fable reviewer — With fixes; fixed I1 bulk drop, I2 chat receipt (removed), I3 cap race (reservation), I4 meta CAS, I5 group receipt cleanup, I6 group switching; minors fixed: motion, sr, IST date, blank group, size limits, photo race, capture attr
Final: Ruling: quota reservations are rows in ai_usage (feature split_ai_quota, 0 tokens) — no DDL needed — cost: Usage page shows an extra zero-cost feature row
Final: minor (deferred): gpt-6-luna has no catalog price (cost_usd null); SMS split skips sms_account_hints learning; seatless guests can replace receipts; HomeCapture/composer error states partial

## Phase 3 (2026-11-24)
Ruling: Settl's mascot artwork not copied — original sidekicks (purse/coin/receipt/piggy SVGs) — cost: not identical to Settl
Ruling: @react-pdf/renderer 4.7.0 with all internals pinned via overrides — 2026-11-24 sub-releases broken (unpublished hyphenate; font/render expect registerStdFonts) — cost: manual bumps later
Verified: group/person/finance PDFs rendered in Node (rasterised) and group PDF generated + viewed in browser (1.3s); build ok; gate 9/9; checks math/access/bridge/splitwise/voice/receipt/report ok

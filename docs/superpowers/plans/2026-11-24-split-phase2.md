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

## Phase 3 review fixes (review of 7e53869..2531eb2, model fable)

- Final: fixed C1 server actions reachable via middleware-exempt paths (/fonts/zzz.ttf, /zzz.png, /sw.js returned 404/405 instead of 403) — middleware now runs on everything except _next build assets and lets only GET/HEAD of /public files skip the gate. gate.sh "action via missing font path / top-level image / sw.js" RED→GREEN, gate 13/13
- Final: fixed I6 finance PDF disagreed with the Reports screen and AI summary — new src/lib/pdf/finance-numbers.ts uses investmentCategoryNames, the AI report's precedence (investment > want > need > other), the screen's category fallback (source / Uncategorised), IST month bucketing, null-safe description; Saved shows a minus; "No type set" row. finance-numbers.check.ts RED→GREEN
- Final: fixed I1 person balance (group-simplified) vs row effects (pairwise) contradicting — simplifiedDiffers() adds an explanation in the person view and PDF when they differ. report.check.ts RED→GREEN
- Final: fixed I2 period tile labelled repayments "you owe more" in red — neutral "Change this period, + means X owes you more"; settlement rows neutral colour in the person view. (label only, verified by render)
- Final: fixed I3 getPerson matched removed seats — uses active() like getHome/settleWithPerson. (needs DB; verified by reading — no unit test)
- Final: fixed I4 past-period settle-up looked current — heading and balance tile say "as of <end date>", plus a note when the period ended before today. (verified by render)
- Final: fixed I5 seatless link guest got "Your share ₹0 / Settled" — "your" tiles and column dropped when there's no seat. (verified by render)
- Final: fixed (re-graded Minor→Important) empty custom date produced "Invalid Date" / all-history PDF — "Pick both dates" guard.
- Final: Ruling: I7 iframe viewer on phones — "View PDF" is hidden when navigator.pdfViewerEnabled === false (Chrome Android); iOS Safari keeps the inline viewer plus the Open link — not device-tested; cost if wrong: View shows only page 1 or a blank frame on some phones, Download/Share still work
- Final: fixed C1 (second half, pre-existing on master) /_next/static still skips the middleware, and Next really runs root-layout actions there: a POST with isPushSubscriptionSaved's id to /_next/static/zzz returned a real DB answer. requireOwner() added to the four root-layout push actions in pending.ts. gate.sh "root-layout action refuses via _next/static" RED (fix stashed) → GREEN, gate 14/14
- Final: Ruling: owner checks only in the four actions bundled into the root layout / not-found page (the only ones reachable via /_next/static); page-level actions stay behind the middleware — cost if wrong: an action later imported into the root layout is reachable unauthenticated unless it calls requireOwner()
- Final: Ruling: finance PDF "Saved" subtracts untyped expenses too (the screen's Cash Savings ignores them) — untyped spending is still money spent — cost if wrong: PDF Saved is lower than the screen's chart when untyped expenses exist
- Final: minor (deferred): Reports page no longer offers "share as image"; dead image branches remain in share-file-dialog
- Final: minor (deferred): dismissing the report sheet mid-generation still pops the share dialog
- Final: minor (deferred): report month default can be a future month; stale selected month after refetch; only 12 month chips
- Final: minor (deferred): group report Net column includes settlements while only Paid/Share are shown
- Final: minor (deferred): emoji CDN failures are cached for the session, no fetch timeout, third-party request per emoji (self-host Twemoji PNGs to fix all three)
- Final: minor (deferred): blob "Open" tab breaks on reload after the dialog closes
- Final: minor (deferred): person view error state has no Back button; renaming a no-email member breaks old ?p= links; ?p= carries the email
- Final: minor (deferred): Home feed month headers group by createdAt, not expense date
- Final: minor (deferred): removed member with only a settlement in the period is missing from the people table
- Final: minor (deferred): two no-email members with the same name merge into one person across groups (name-key design)
- Final: minor (deferred): Reports screen Cash Savings ignores untyped expenses (screen bug, see ruling above)
- Final: Reports chart now uses the shared investmentCategoryNames (8 names) like the PDF, dashboard and AI report; yearly-overview and demo pages still list 3 (minor, deferred)
- Final: Ruling: share-as-image removed from Reports with the screenshot export — the user asked for real PDFs, image needed html2canvas — cost if wrong: no Instagram-friendly image; asked the user
- Final: Ruling: non-Latin glyphs — checked: Devanagari ("किराना दुकान") renders correctly with the bundled Noto Sans — cost if wrong: none seen
- Final: Ruling: service-worker caching of /fonts for offline PDFs not added — making a PDF also fetches emoji online; offline PDFs were never asked for — cost if wrong: no PDFs offline
- Final: Ruling: @react-pdf internals stay pinned to the August set — newer releases are broken (missing hyphenate package, std-fonts) — cost if wrong: no upstream fixes until the pins are lifted
- Final: Ruling: Twemoji CC-BY 4.0 credit (plus font licences) added to the About page — cost if wrong: none
- Final: Ruling: real-device behaviour of navigator.share and the download-then-WhatsApp fallback not tested — needs a phone; user asked to try — cost if wrong: share button falls back to download
- Final: fixed (found while checking multi-page layout, not in the review) the "Page x of y" footer never rendered in any PDF — an inherited page lineHeight makes the pinned react-pdf drop fixed views containing render-prop text. Page lineHeight removed (it barely changed spacing); Doc now draws the footer from a `footer` prop. Verified: pdftotext finds the footer on every page (group 3/3, person 1/1, finance 1/1); a 60-expense report repeats its table header on page 2
- Final: minor (deferred): a table split across pages draws its left border past the last row on the earlier page
- Final: minor (deferred, pre-existing): pickMe may pick a removed own seat; settleWithPerson settles merged name-keyed people together

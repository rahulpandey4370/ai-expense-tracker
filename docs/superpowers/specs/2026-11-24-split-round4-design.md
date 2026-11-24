# Round 4: group KPIs + insights, report KPIs, owed breakdown, Activity indicators

Approved by the owner 2026-11-24. Indicator mockups: docs/mockups/activity-indicators.html (owner picked Option A for
types, Option B for Split; app colours kept).

## Decisions
1. **Group screen** (the month chip drives it; opens on the latest month with entries):
   - Moving text is about that month only (spent, my share, biggest, count). The hero's owed/owe figure stays lifetime.
   - KPI strip (2×2) under the hero: Spent · month, Your share · month, Group total (all time), Top payer · month.
   - "More insights" opens a sheet with a This month / All time switch: per person paid / share / net, biggest
     expense, average per expense, average per day, count, payments made, who owes whom now (lifetime), and two charts:
     paid vs share per person (follows the switch) and spend by month (last 6 months with activity, selected highlighted).
2. **Group PDF report**: KPI tiles for the period plus an all-time row; a plain-language Summary (totals, each person's
   paid and share, who owes whom as of the end date).
3. **Home**: tapping "You're owed / You owe" opens a per-group breakdown (who owes what in each group, group subtotal,
   net); tapping a group opens it. From `HomeData.people[].groups`; no server change.
4. **Activity + Home recent list**: a 3px left edge stripe per expense in its type colour; a teal "Split" tag with the
   two-people icon for split transactions. Legend chips (Need, Want, Investment, Split) above the Activity list, which
   toggle the existing filters. Desktop Type column shows the same stripe colour as a dot + word.
5. **One palette** from `src/lib/type-colors.ts`: Need blue #3b82f6, Want purple #a855f7, Investment (and
   investment expense) yellow #eab308, Savings green. Stragglers fixed: KPI card investment tone, yearly overview
   investment figures. Split = teal.

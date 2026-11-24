# FinWise Split polish: back button, edit/delete, "Paid with", group edit, home feed filter

Approved by the owner 2026-11-24 ("Go").

## Why
The group screen's back button rendered as a dot, edit/delete were buried, groups couldn't be edited, and the home
feed couldn't be narrowed down.

## Decisions
1. **Back button**: a fixed-size round button (`shrink-0`) with a bold left arrow, clear in all four looks. The separate
   emoji tile goes; the emoji moves into the subtitle line.
2. **Edit / delete**: the expense view gets Edit and Delete side by side (Delete hidden for Quick-split rows, which are
   edited on Transactions). Settle-up payments in the group list get a delete button (no edit; delete and re-record).
3. **Paid with** (`meta.paidWith = { id?, name }`, shown on the receipt):
   - owner viewer and the owner is the payer → dropdown of main-app payment methods; that choice also feeds
     "Add to my spending" (the separate "Paid with…" select there is hidden in that case);
   - anyone else, or the owner logging a bill someone else paid → free text (max 60).
   - Only the owner may store an `id`; omitted on save = keep what's there; null = clear.
4. **Group edit/delete**: a ⋯ button on the group header (signed-in members, `canManage`) opens a sheet: name, emoji,
   type, Save, Delete group (confirm → back home). Delete moves out of the People sheet.
5. **Home feed filter**: chips for group, person (paid, has a share, or is a party to a payment), time (this month,
   last month, each month with activity, custom from/to). Filters combine with search; a Clear chip resets; a summary
   line shows count and my net. The feed uses each entry's own date for sorting and month headers.
   The server sends the full activity list (cap 2000) instead of the newest 60.

## Approaches
- Feed filter client-side over the full list (chosen) vs a server-side filtered query: data is small; one round trip,
  instant filter changes. Ceiling: very large histories; raise the cap or page then.
- Group actions in a sheet (chosen) vs a dropdown menu: the sheet matches the split UI and holds the edit form anyway.

## Left to the builder
Copy, layout details, chip styling.

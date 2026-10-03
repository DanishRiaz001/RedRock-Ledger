# Navigation: one-step-back + direct menu switching + unsaved-changes confirmation

Requested 2026-09-18. Root cause diagnosed, not yet built — this is a multi-screen refactor, not a quick patch.

## Bug 1 — Back button skips levels on deep drill-downs

`FinanceTracker.jsx` already has a real pushState/popstate mechanism (see the `poppingRef`/`useEffect`/`onPop` block around line 49-111) that pushes one history entry per navigation step and unwinds one level per Back press. It currently tracks exactly three levels: `tab`, `ledgerAcc`, `vatTerminView`.

The bug: several drill-down screens have their OWN local `detailTxn` (or equivalent "which record is open for editing") state that isn't part of this tracked stack — e.g. `LedgerDrilldownScreen` (reports.jsx ~2786), `ReskontroDesktopScreen`, and likely others with the same "list → click row → open detail/edit modal" pattern. Opening a bilag from inside one of these screens doesn't push a history entry, so Back skips straight past that level to whatever was open before the drill-down itself.

### Fix
For each affected screen: lift its local `detailTxn`-equivalent state up into `FinanceTracker.jsx`, pass it down as a controlled prop (same as `ledgerAcc` already is), add it to the pushState effect's dependency list and payload, and add it to the popstate cascade's check order (checked BEFORE `ledgerAcc`/`vatTerminView` since it's the deepest level). Mechanical, but needs doing per-screen — sweep `grep -n "detailTxn" src/components/reports.jsx` (and ledger.jsx) for every screen with this pattern before considering it done "in the whole website" as asked.

Screens known to need this (found via `detailTxn` local state, not exhaustively verified against every drill-down):
- `LedgerDrilldownScreen` (reports.jsx) — confirmed repro case (Trial balance → General ledger → edit bilag)
- `ReskontroDesktopScreen` (reports.jsx)
- `VATTerminDetailScreen` (reports.jsx) — check if `vatTerminView` already covers this or if it has its own deeper txn-open state
- Any other reports.jsx screen with its own `detailTxn`/`openTxn` local state — search before starting

## Bug 2 — Clicking another sidebar menu while a detail view is open

User wants: if a nested detail/edit view is open (e.g. editing a bilag) and the user clicks an unrelated sidebar item, it should switch straight to that new screen instead of requiring multiple Back clicks first — UNLESS there's unsaved/in-progress data in the currently open form, in which case it should show a confirmation dialog before discarding it and navigating away. Opening a link in a new browser tab should never trigger this (a new tab is a separate, unaffected instance).

This needs a global "is the current screen dirty" signal — likely a lightweight shared ref/context that any entry form (EditModal, NewEntryForm, InvoiceFormScreen, etc.) sets when the user has typed something not yet saved, checked by the sidebar's navigation click handlers (and possibly the same popstate handler from Bug 1) before actually navigating away. This is a separate, larger feature from Bug 1 — no existing scaffolding for it in the codebase yet, so it starts from zero. Needs its own design pass (what counts as "dirty" per form type, where the confirmation dialog lives, whether it should be a native `confirm()` or a themed modal) before implementation.

## Suggested order
Bug 1 is scoped and mechanical — reasonable to tackle first, screen by screen. Bug 2 needs a short design pass first (defining "dirty" consistently across every entry form) before any code.

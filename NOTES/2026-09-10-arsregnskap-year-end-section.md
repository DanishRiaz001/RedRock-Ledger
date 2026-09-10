# Årsregnskap / year-end section — build plan (2026-09-10)

Danish sent Tripletex screenshots (Regnskapsoversikt, Årsregnskap detail matrix,
Åpningsbalanse voucher) and asked for the **same feature** in RedRock. Mockup
built first (artifact) — this is the implementation plan behind it.

## What Tripletex has

### Sidebar
`Regnskap` group → **Årsregnskap ▾** (3rd sidebar level):
- Regnskapsoversikt  (always — the landing table)
- Årsregnskap 2026 / 2025 / …  (one per open or recent fiscal year, dynamic)

### 1. Regnskapsoversikt (overview)
One row per fiscal year:
| Årsregnskap | Rapporter | Avsluttet | SAF-T 1.2 | SAF-T 1.3 |
- year label + contextual links for older years (Åpningsbalanse / Opprett historisk balanse)
- "Kontospesifikasjon (hovedbok) CSV" quick link
- "Avsluttet" checkbox (year closed y/n)
- SAF-T export per version
- footer: **Nytt årsregnskap**, **Last ned regnskap**

### 2. Årsregnskap <year> (detail)
- Banner if year can't close ("an earlier year is still open" — years close in order)
- Tabs: **Detaljer** | **Historisk balanse**
- **Period matrix** — rows × 13 periods (Jan…Des + year-end adj):
  - Periode lukket        (lock checkbox per period)
  - Periode gjenåpnet     (reopened flag per period)
  - Rapporter: Bilagsoversikt (journal) · Saldobalanse · Kontospesifikasjon ·
    Kunde-/Leverandør-/Ansattspesifikasjon — 👁 preview + CSV per period
  - Mva-melding — per termin, links to the melding
  - Avstemminger — one row per bank account; each cell = reconciliation record
    ("2026-03-10 (Apex R/DR)" = date + who signed off)
- **Lagre**

### 3. Åpningsbalanse (as a voucher)
- It's bilag **"0-<year>"** with a Startdato, Detaljer/Vedlegg tabs, comments
- Table: `Konto` | **Inngående saldo** (Beløp NOK · Valuta · Beløp valuta) | **Dimensjon** (Ansatt) | ✕
- Locked rows show: *"Beløpet kan ikke endres i en periode der det finnes en avstemt kontoutskrift."*
- Grouped **open-item** sections for reskontro accounts — NOT one lump:
  - `1500 Kundefordringer – Åpne poster` → per customer → per-invoice lines (fakturanr, dato, beløp) → Sum per customer → Sum 1500
  - `2400 Leverandørgjeld – Åpne poster` → per supplier → per-invoice lines → subtotals
  - `2910 Gjeld til ansatte og eiere – Åpne poster` → per person → dated lines → subtotals
- **Kontrollsum: 0,00** at the bottom

## What RedRock has today
- `OpeningBalanceScreen` (settings3.jsx:306) — flat balances grid + CSV import +
  a 2-step "open items" flow (one lump amount per contact for 1500/2400 only).
  **Bug found:** doPost posts the lump 1500/2400 row AND the per-contact open
  items → 1500/2400 double-counted. Fix: when open items exist for an account,
  skip its lump row and post only the per-contact lines (their sum must equal
  the lump — enforce with a control-sum check).
- Reconciliation, Mva-meldinger, Trial balance, SAF-T export (in Backup screen),
  General ledger — all exist, just not tied together per-period.
- **No** period-lock, **no** year-close concept, **no** consolidated matrix.

## STATUS (2026-09-11, commit d5cd63c)

- **Phase 1 (opening balance) — DONE.** Rebuilt as a single voucher view
  ("Bilag 0 · Åpningsbalanse") with inline per-invoice open items, Dimensjon
  (project) column, Kontrollsum. No currency columns (currency isn't persisted).
- **Phase 3 (Årsregnskap section UI) — DONE, lean version.** Sidebar
  Accounting → Årsregnskap. `AnnualAccountsScreen` in reports.jsx:
  Regnskapsoversikt (year rows + CSV + SAF-T + Avsluttet), per-year period
  matrix (lock months, Mva-melding status, bank-recon status, "Avslutt år").
- **Phase 2 (period lock) — used the EXISTING `companyProfile.periodCloseDate`**
  (one "closed up to" date, advanced a month at a time) instead of a new
  per-period table. `blockIfLocked` already enforces it on every write. Good
  enough; a true per-period lock/reopen with audit is still a possible upgrade.
- **Phase 4 (year close) — NOT done.** "Avslutt år" only locks the 12 periods.
  The result-to-equity posting (8xxx net → 2050/2080 dated 31.12) and the
  roll-forward of every balance-sheet account's closing balance into next
  year's opening voucher are still manual. This is the main remaining piece.

## Build plan

### Phase 1 — Åpningsbalanse upgrade (small, do first)
`settings3.jsx OpeningBalanceScreen`:
1. Fix the double-count bug (skip lump row when open items exist for it).
2. Open-items step: per-contact **multiple dated lines** — `{contactId, invoiceNo,
   date, dueDate, amount}` (flat list, grouped in the UI by contact with
   subtotals). Post each with its own invoiceNo/dueDate so aged reports work.
3. **Kontrollsum panel**: for each reskontro account show `Trial balance figure ·
   Allocated · Unallocated` and block Post until unallocated = 0.
4. Support **2910 Gjeld til ansatte og eiere** and any reskontro account, not
   just 1500/2400 (detect from imported rows which accounts are reskontro-type).
5. Right-align amount inputs + headers, tabular-nums (alignment pass).
6. Optional: currency + Dimensjon columns (defer — currency isn't persisted
   anywhere yet, see [[2026-09-10-entry-types-gap-analysis.md]]).

### Phase 2 — Period lock infrastructure (DB + engine)
- New table `accounting_periods` (or extend `reconciliation_status`):
  `{user_id, company_id, year, period (1-13), locked bool, locked_at, locked_by,
   reopened bool, reopened_at, reopened_by, note}`.
- `addTransaction` / `saveEdit` / `deleteTxn` / reversal / bank-post: **reject**
  (or warn-and-require-override) any write whose date falls in a locked period.
  Central guard — one `isPeriodLocked(date)` check at the top of every mutation.
- RLS: only `rr_can_write_settings` may lock/unlock.

### Phase 3 — Årsregnskap section UI
- Sidebar: add 3rd-level expansion under a new "Årsregnskap" item in the
  Accounting group (FinanceTracker.jsx sidebar `cat.items` supports `subItems`
  already — extend to a dynamic year list).
- `AnnualAccountsOverviewScreen` (Regnskapsoversikt): year table, reads fiscal
  years from company profile start date → current year. SAF-T download per year
  reuses `buildSAFTXml`. "Avsluttet" = all 13 periods locked + a `year_closed`
  flag.
- `AnnualAccountYearScreen` (Årsregnskap <year>): the period matrix.
  - Periode lukket/gjenåpnet → writes `accounting_periods`.
  - Report cells → deep-link to the existing screens pre-filtered to that
    period (Trial balance, General ledger, Journal, Reskontro specs) + a
    "CSV" that runs that screen's existing Excel/CSV export scoped to the period.
  - Mva-melding row → link into VATTerminDetailScreen for that termin.
  - Avstemminger rows → link into BankReconciliationScreen for that account+month,
    show the approved/reconciled status already tracked there
    (`isBankReconApproved`).
- `Historisk balanse` tab → the opening balance for that year (Phase 1 screen,
  read-only once the prior year is closed).

### Phase 4 — Year close
- "Avslutt år" action: requires all periods locked, trial balance balanced,
  all VAT terminer filed, all bank recons approved.
- Posts the **result-disposition entry**: move P&L result (8xxx net) to equity
  (2050 Annen egenkapital / 2080 udekket tap) dated 31.12, and roll every
  balance-sheet account's closing balance into next year's opening balance
  (either as a real "0-<year+1>" opening voucher or a computed IB — Tripletex
  uses a real voucher).
- Once closed: the year's periods can't be unlocked without an explicit
  "Gjenåpne år" (logged).

## Scope / risk
- Phase 1 is safe and self-contained — ship it alone.
- Phase 2 changes the core write path — every entry screen must be tested against
  a locked period. High blast radius.
- Phase 4 posts real closing entries to client books — needs the VAT-split fix
  ([[2026-09-10-vat-not-posted-as-ledger-line.md]]) done first, or the equity
  roll-forward inherits the gross-expense error.
- Norwegian statutory year-end (Årsoppgjør / Altinn RF-1167 etc.) is a separate,
  much bigger thing — Tripletex has "Årsoppgjør" as its own module. This plan is
  just the bookkeeping-close half (period lock + IB roll-forward + SAF-T), not
  the tax-return filing.

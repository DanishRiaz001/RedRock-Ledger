# NOTES — parked plans, strategies, and analyses

Things Claude was asked for (a plan, a strategy, a gap analysis, a proposal)
that weren't acted on in the same session, saved here to pick up later.

Not code. Ignored by the build. One file per topic, dated.

| File | What it is |
|---|---|
| `2026-09-10-entry-types-gap-analysis.md` | What's missing in Advance Voucher / Supplier Invoice / Customer Invoice |
| `2026-09-10-security-vat-saft-status.md` | Where security (RLS), VAT/MVA, and SAF-T stand + what's left |
| `2026-09-10-backup-strategy.md` | Recommended backup strategy for the accounting data |
| `2026-09-10-vat-not-posted-as-ledger-line.md` | VAT isn't split into its own posting — expenses/income booked gross; fix plan |
| `2026-09-10-arsregnskap-year-end-section.md` | Year-end / Årsregnskap section (overview + period matrix + opening-balance voucher) — 4-phase build plan |
| `2026-09-10-vat-split-feature-research.md` | Norwegian VAT account structure confirmed vs Skatteetaten; MVA settleAccount bugs fixed; VAT-split feature design + rollout plan |

---
## Backlog status (2026-09-11) — big sweep, commits 597d1b9..040bc89

DONE & pushed: saveEdit no longer drops project/money-source/vat_split ·
PDF exports open a preview tab (pdfPreview helper) · currency persistence
(transactions.currency + currency_amount; addTransaction/saveEdit/saveInvoice/
opening-balance/SAF-T all thread it) · real periodization engine (defer +
monthly recognition) · Årsregnskap year-close (result → 2050/8800 + lock) ·
SAF-T real GroupingCode from saftCode13 + project dimensions (AnalysisTypeTable
+ Line/Analysis) · opening-balance single-voucher layout with Valuta + Dimensjon
columns · Årsregnskap section (Regnskapsoversikt + period matrix) ·
EditModal project-picker UI · reverse-charge VAT full both-legs posting
(computeVat + reverseChargeLegs, wired into addTransaction and
insertBankLineTxn) · client-switcher access bug (granted clients were
invisible on desktop) + no-limit scrollable list · viewingUserId now
persisted like activeCompanyId (refresh no longer drops a granted client's
books) · Mva-meldinger back-navigation no longer crosses tab boundaries ·
duplicate filename headers removed from every document-preview panel ·
reverse entry requires confirmation everywhere + Audit trail shows who ·
"Voucher details" hidden for Advance Voucher entries, date/description now
side by side · Bank reconciliation "Sync to entries" scoped to bank-posted
entries only + "Already synced" message · Mva-melding tables no longer show
an irrelevant Leverandør/Kunde column · sidebar narrowed.

REMAINING:
- **sql/fix_attachments_storage_rls.sql — written, NOT yet run.** This is the
  actual fix for "Couldn't load X.pdf" when a granted employee opens a file a
  client (or a different employee) uploaded. Run once in the Supabase SQL
  editor.
- SAF-T v1.4 (mandatory 2027-01-01) — v1.3 is solid & XSD-validated; v1.4 is a
  schema migration.
- VAT historical backfill — go-forward is live; sql/backfill_vat_split.sql has
  the dry-run + apply, to be run deliberately per company after a backup.
- RLS verification — user must run the pg_tables query (security notes).
- Mva-melding filed/paid/reconciled status is per-browser localStorage, not
  the DB — switching browsers resets the checkmarks (the underlying numbers
  are always recalculated from the ledger, so nothing is lost, just the
  status flags). Flagged as a gap in security-vat-saft-status.md; not yet
  moved to a DB table.

---
## Backlog status (2026-09-12) — dropdown theming, report headers, reverse-charge audit, super-admin gate

DONE & pushed: **site-wide themed dropdown** — a from-scratch `ThemedSelect`
component (`ledger.jsx`) replacing all ~74 native `<select>` elements across
reports.jsx, invoicing.jsx, ledger.jsx, settings2.jsx, settings3.jsx, admin.jsx
(a native select's open popup can't be CSS-styled — hard browser limitation,
not a bug, hence the custom component) · **company name + org number on every
downloaded report** — `xlsxHeaderRows()` (utils.js) + `<ReportPdfHeader>`
(reports.jsx) now prepended/injected into every PDF print-area and Excel
export in the app: Trial balance, Income statement, Balance sheet, VAT report,
General ledger, Mva-meldinger (year list + termin detail), Customer/Supplier
ledger (Reskontro), Chart of accounts, Contacts, Open posts, plus the mobile
Reports screen's Income statement/Balance sheet/account-ledger exports and the
generic top-bar download-menu fallback · **VAT split always on** —
`companyProfile.splitVat` hardcoded true, on/off toggle removed from VAT
codes screen (replaced with a static "always on" info card) ·
**reverse-charge VAT math bug fixed** — found via an explicit
auditor/reviewer-mindset pass: codes 81-92 were lumped into the ordinary
domestic-purchase bucket and their vatAmount was subtracted from netVat as if
an ordinary deductible input credit, which is wrong for both deductible codes
(should net to zero — self-assessed output cancels claimed input) and
non-deductible codes (should add to the amount owed — real cost, no offsetting
claim); now a separate `reverseChargeTxns` bucket + `reverseChargeNetEffect`
folded correctly into `netVat` · **Årsregnskap crash fixed** (React error
#310 — a `useState` was declared after a conditional early `return`, a Rules
of Hooks violation) + `ScreenErrorBoundary` now has a real "Go to Dashboard"
escape hatch instead of only "Try again" · **company creation restricted to
the super-admin** (danishriaz001@gmail.com only) — UI gate in
FinanceTracker.jsx plus a real RLS INSERT policy
(`sql/restrict_company_creation.sql`, must be run in Supabase) · **Payment
types settings redesigned** with an explicit Save · **clean bank-statement
descriptions feature** — a consent-based before/after preview strips known
filler text from unposted "From bank statement" lines only (never touches
ledger-entered descriptions), with a per-line restore (↺) that only appears
while the line is still unposted; needs `sql/add_bank_line_original_description.sql`
run in Supabase · Mva-meldinger/Bank reconciliation cosmetic pass — column
misalignment fixed, boilerplate removed, year-picker redesigned, Approve
banner moved onto the same row as the title, search box ~30% bigger, History/
Send/Read-PDF and Sync/Remove folded into "⋮" menus.

REMAINING (added this sweep):
- **sql/add_bank_line_original_description.sql — written, NOT yet run.**
  Needed for the clean-descriptions restore feature to persist
  `original_description`.
- Confirm `sql/restrict_company_creation.sql` has actually been applied in
  Supabase (super-admin-only company creation is only enforced client-side
  until the RLS policy is live).
- Everything under "REMAINING" from the 2026-09-11 section above is still
  open (attachments RLS fix, SAF-T v1.4, VAT historical backfill, RLS
  verification query, Mva-melding status still in localStorage).

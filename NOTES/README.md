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
columns · Årsregnskap section (Regnskapsoversikt + period matrix).

REMAINING (deliberately not done this sweep):
- Reverse-charge VAT full both-legs posting — needs the Mva-melding
  reverse-charge logic built alongside it; the accounts/links are correct and
  the single-row fallback is safe. Its own project.
- SAF-T v1.4 (mandatory 2027-01-01) — v1.3 is solid & XSD-validated; v1.4 is a
  schema migration.
- VAT historical backfill — go-forward is live; sql/backfill_vat_split.sql has
  the dry-run + apply, to be run deliberately per company after a backup.
- RLS verification — user must run the pg_tables query (security notes).
- EditModal project-picker UI — the data-loss bug is fixed; adding the field
  is minor plumbing through DetailModal's call sites.

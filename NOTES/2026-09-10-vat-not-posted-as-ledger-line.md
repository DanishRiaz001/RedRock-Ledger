# VAT is never posted as its own ledger line — expense/income shown gross (2026-09-10)

**RESOLVED (2026-09-12):** `companyProfile.splitVat` is now hardcoded `true`
for every company (the on/off toggle was removed from VAT codes settings —
see [[README]] 2026-09-12 backlog entry), and `src/lib/vatsplit.js`'s
`vatSplit()`/`reverseChargeLegs()` are wired into every posting path
(`addTransaction`, bank-statement posting, invoice creation) via
`planVatSplit()` in appshell.jsx. Every new posting with an `autoSplit` VAT
code now writes the net amount to the P&L account and the VAT to the correct
27xx settlement account — Problem 2 below no longer applies going forward.
Problem 1 (preview-vs-save line-filter mismatch) is also already fixed —
invoicing.jsx's totals bar (~line 5141) now builds `invLineAmounts` from the
same `postableExtra=invExtraLines.filter(l=>l.accountCode&&parseFloat(l.amount))`
filter `saveInvoice` uses, so the preview and what actually posts always
match.
**What's still true:** transactions posted BEFORE splitVat became mandatory
are still gross (flagged `vat_split=false`) — that's exactly what
`sql/backfill_vat_split.sql`'s dry-run/apply is for, still not run.

## What Danish saw
Supplier invoice, one cost line: 4000 incl. 25% VAT (code 1), account 4000
"Innkjøp av råvarer". The running totals bar showed **Debit 4 200 / Credit (AP)
4 200 / VAT 800** — and he flagged the calculation as wrong.

Two separate problems.

## Problem 1 — the preview counts lines that won't post (cosmetic)
`invoicing.jsx` ~line 5095, the Debit/Credit/VAT/Difference bar:
```js
const invLineAmounts=[invAmount,...invExtraLines.map(l=>l.amount)];
```
It sums **every** extra line's amount, but `saveInvoice` (line 4025) only posts
lines that have BOTH an account code AND an amount:
```js
...invExtraLines.filter(l=>l.accountCode&&parseFloat(l.amount))
```
In the screenshot the 2nd line had an amount (200) but no account selected, so
the preview said 4 200 while only 4 000 would actually be booked.
**Fix:** make the preview use the same filter as the save.

## Problem 2 — VAT is not split out into its own posting (the real issue)

### How a supplier invoice posts today
`saveInvoice` → `onSave` → `addTransaction` (appshell.jsx:758) writes **ONE row
per cost line**:

| field | value (screenshot) |
|---|---|
| debit_code | 4000  (expense account) |
| credit_code | 2400  (Leverandørgjeld / AP) |
| amount | 4000  ← **VAT-INCLUSIVE** |
| vat_code | "1" |
| vat_pct | 25 |
| vat_amount | 800  ← stored as **metadata only** |

So for a purchase invoice:
- **DEBIT = the cost/expense account** (4000, 6xxx, 7xxx…), gross amount
- **CREDIT = 2400 Leverandørgjeld** (AP), gross amount
- negative amount (kreditnota) flips them
- "Payment" toggle on → extra row: Dr 2400 Supplier / Cr bank

For a customer invoice it's the mirror: Dr 1500 (AR) / Cr sales account, gross.

### Why that's wrong for a VAT-registered business
`vat_amount` is **only** read by the VAT reports (Mva-meldinger, VAT report).
Trial Balance / General Ledger / Income Statement / Balance Sheet all compute
account movement from raw `t.amount` on `debitCode`/`creditCode`
(reports.jsx TrialBalanceScreen ~line 3337) and **never subtract `vatAmount`**.

Net effect of the 4000 invoice:
- Account **4000 (expense / P&L)** moves **4 000** — should be **3 200 net**.
  → expenses and COGS overstated by the VAT on every VAT-bearing purchase.
- Account **2710 (Inngående mva, balance sheet)** moves **0** — should be **800**.
  → input VAT receivable missing from the balance sheet entirely.
- Account 2400 (AP) moves 4 000 — **correct** (that's what's owed).
- Balance sheet still balances only because BOTH the missing debit (2710) and
  the overstatement (4000) are on the debit side and cancel — it's wrong in two
  places that happen to net out.
- Same story on the sales side: 3 (Utgående mva) 2700 never moves; income is
  shown gross.

### Correct Norwegian posting for that invoice
```
Dr 4000 Innkjøp av råvarer      3 200
Dr 2710 Inngående mva             800
Cr 2400 Leverandørgjeld                4 000
```

### The data to do it right is already there
Every `MVA_CODES` entry carries `settleAccount` (utils.js) — code "1" → "2710",
code "3" → "2700", code "11" → "2711", etc. The posting code just doesn't use it.

## Suggested fix (one engine, all entry paths)
In `addTransaction` (appshell.jsx:758) — and the same for `saveEdit` (1529) and
the multi-line `save()` receipt path (~1087) — when `vat_code`/`vat_amount` is
present and non-zero:
1. Look up `vc = MVA_CODES.find(c => c.code === vat_code)`; get
   `vatAccount = vc.settleAccount`.
2. Post the **net** amount (`amount − vat_amount`) to the expense/income line's
   debit/credit pair.
3. Post a second row for `vat_amount`:
   - input VAT (purchase): Dr `vatAccount` / Cr 2400 (AP) — or Cr bank if paid
   - output VAT (sale): Dr 1500 (AR) / Cr `vatAccount`
   - share the same `bilag` + `groupRef`.
4. Keep `vat_amount` on the net line for the VAT report (don't double count —
   the VAT report already filters `isExpenseSK(debitCode)` / `isIncomeSK`, and
   the new VAT-account line is 27xx so it won't be picked up as a purchase/sale).
   Verify Mva-meldinger totals don't change after the switch.
5. Codes with `settleAccount: null` (code 5, 6, 0 — no VAT) → post as today,
   single gross line.
6. Migration decision: existing rows are gross-in-expense. Either leave历史 as-is
   and only fix new entries, or write a one-off backfill that splits every
   historical VAT-bearing row. Backfill is cleaner for reporting but touches
   real client books — do it as an explicit, reviewed migration.

## Scope / risk
- Touches the core posting path — every entry type (advance voucher, supplier
  invoice, customer invoice, recurring invoices, quotes→invoice, bank
  reconciliation "post"). Test each.
- Trial Balance / P&L / Balance Sheet numbers for VAT-registered companies WILL
  change (correctly) — expenses drop by input VAT, a 2710/2700 balance appears.
- Pakistan companies (no VAT, codes null) — unaffected.
- Reconciliation / SAF-T `<TaxInformation>` work (already in the SAF-T notes)
  gets easier once VAT is a real posting.

## Related
- [[2026-09-10-entry-types-gap-analysis.md]] — cross-cutting #1 (currency) and #2
  (periodization) are in the same "posting path is simplified" family.
- [[2026-09-10-security-vat-saft-status.md]] — SAF-T per-line TaxInformation.

# VAT-split feature — research + design + status (2026-09-10)

Danish asked for the VAT-split fix (post input/output VAT as its own ledger
line, not buried in the P&L account) and, before pushing, a researched report
confirming the Norwegian VAT account structure. This is that report.

---

## 1. The Norwegian VAT account structure — CONFIRMED against Skatteetaten

Source of truth: **Skatteetaten's own SAF-T "General Ledger Standard Accounts"**
CSV — `github.com/Skatteetaten/saf-t` → `General Ledger Standard Accounts/CSV/
General_Ledger_Standard_Accounts_4_character.csv`. Also cross-checked against
Conta / Snapbooks kontohjelp and the Tripletex Kontoplan screenshot.

### The official SAF-T standard 27xx block

| Account | Name (NOR) | Side |
|---|---|---|
| **2700** | Utgående merverdiavgift, høy sats (25 %) | OUTPUT (salg) |
| **2701** | Utgående merverdiavgift, middels sats (15 %) | OUTPUT |
| **2702** | Utgående merverdiavgift, middels sats, råfisk mv | OUTPUT |
| **2703** | Utgående merverdiavgift, lav sats (12 %) | OUTPUT |
| **2704** | Utgående mva ved kjøp av tjenester fra utlandet, høy sats | OUTPUT (reverse charge) |
| **2705** | Utgående mva – innførsel av varer, høy sats | OUTPUT (import) |
| **2706** | Utgående mva – innførsel av varer, middels sats | OUTPUT (import) |
| **2707** | Utgående mva – innenlands kjøp m/omvendt avgiftsplikt, høy sats | OUTPUT |
| **2709** | Utgående mva ved kjøp av tjenester fra utlandet, lav sats | OUTPUT |
| **2710** | Inngående merverdiavgift, høy sats (25 %) | INPUT (kjøp) |
| **2711** | Inngående merverdiavgift, middels sats (15 %) | INPUT |
| **2712** | Inngående merverdiavgift, middels sats, råfisk mv | INPUT |
| **2713** | Inngående merverdiavgift, lav sats (12 %) | INPUT |
| **2714** | Inngående mva ved kjøp av tjenester fra utlandet, høy sats | INPUT |
| **2715** | Inngående mva – innførsel av varer, høy sats | INPUT (import) |
| **2716** | Inngående mva – innførsel av varer, middels sats | INPUT (import) |
| **2717** | Inngående mva – innenlands kjøp m/omvendt avgiftsplikt, høy sats | INPUT |
| **2718** | Inngående mva ved kjøp av tjenester fra utlandet, lav sats | INPUT |
| **2740** | Oppgjørskonto merverdiavgift | SETTLEMENT |
| 2770+ | Arbeidsgiveravgift / finansskatt | NOT VAT (payroll) |

**Answer to Danish's question: yes — 2700–2709 = sales (utgående/output),
2710–2718 = purchases (inngående/input), 2740 = the settlement account** where
all of them net at termin close. Everything ≥ 2770 is payroll tax, not VAT.
The whole VAT block maps to SAF-T grouping code `2740`.

### Two valid layouts exist

Tripletex (and RedRock's `accounts_data.js`) use a slightly different but common
variant:

| Acct | RedRock / Tripletex chart | vs Skatteetaten standard |
|---|---|---|
| 2702 | Utgående mva, **lav sats** | standard: råfisk |
| 2703 | Utgående mva **kjøp tjenester utland, høy** | standard: lav sats |
| 2712 | Inngående mva, **lav sats** | standard: råfisk |
| 2713 | **Direktepostert** inngående mva innførsel, høy | standard: inngående lav |
| 2714 | **Direktepostert** inngående mva innførsel, middels | standard: inng. utland høy |

Both are legitimate — they all group to SAF-T `2740`, so the export is fine
either way. What matters is being **internally consistent** and putting input
VAT on an input account and output VAT on an output account.

---

## 2. Bugs found in `MVA_CODES[].settleAccount` — FIXED (not pushed)

Checked every code's `settleAccount` against RedRock's own default chart
(`src/lib/accounts_data.js`). `settleAccount` is currently used **only** for a
display line in the VAT-codes reference screen, so these were cosmetic — but the
VAT split would turn them into real mis-postings, so fixed first:

| Code | Was | Now | Why |
|---|---|---|---|
| **33** (output, lav sats 12 %) | 2703 | **2702** | 2703 in our chart = "kjøp tjenester utland, høy"; 2702 = "Utgående mva, lav sats". Code 33 is common (transport, hotell, kino, kringkasting) — real bug. |
| **32** (output, råfisk 11.11 %) | 2702 | **2701** | our chart has no råfisk account; 2701 (middels sats) is the closest correct home, not 2702 (lav sats). Niche. |
| **81, 82, 83, 84** (import input VAT) | 2705 / 2706 | **null** | 2705/2706 in our chart are OUTPUT accounts. The standard's input-import accounts (2715/2716) aren't in the default chart. Null → the split safely falls back to one gross row instead of posting an input deduction onto an output account. |

Verified OK (all targets exist in the default chart, correct side):
`3→2700, 31→2701, 1→2710, 11→2711, 13→2712, 14→2713, 15→2714, 91→2710`.

**Still to do for full import-VAT support:** add 2715/2716 (and 2717/2718) to
`accounts_data.js`, then point codes 81/83/86/88 at them.

---

## 3. The VAT-split feature — design (helper written, NOT wired, NOT pushed)

### How it posts

Behind a per-company flag `companyProfile.splitVat` (default OFF). When a line
has a VAT code with a settlement account, one gross row becomes two sharing one
bilag:

```
purchase, code 1 (input, →2710):        sale, code 3 (output, →2700):
  Dr <expense>  net                        Dr <customer> gross
  Dr 2710       vatAmount                   Cr <income>   net
  Cr <supplier> gross                       Cr 2700       vatAmount
```

The net (P&L) row keeps the `vat_code`/`vat_pct`/`vat_amount` metadata so the
Mva-melding still reads it; the 27xx rows are balance-sheet accounts so the VAT
report won't double-count them.

### Helper — `src/lib/vatsplit.js` (done)

Pure function `vatSplit({debitCode,creditCode,amount,vatCode,vatAmount,
description}, accounts)` → `null` or `{net, vatLeg}`. Returns null when: no VAT
code, code has no `settleAccount`, VAT ≈ 0 or ≥ gross, a **negative** amount
(kreditnota / reversal — left one-line), or the settlement account is missing
from the chart.

### Wiring — NOT done (the risky part)

Three DB insert points in `appshell.jsx` need it:
- `addTransaction` (line ~758) — advance voucher + supplier/customer quick invoice
- `insertBankLineTxn` (~1085) — bank-reconciliation "Post"
- `createInvoice` (~1180) — full invoicing product

Plus `saveEdit` (~1529): editing a split voucher. Since `groupTxnLines` already
groups by shared `bilag` ([ledger.jsx:2208](src/components/ledger.jsx)), a
2-row split voucher already shows and edits as one voucher in EditModal — but
editing the expense amount won't auto-recompute the VAT leg. Acceptable for v1
(the grid shows a running Debit/Credit/Difference), documented.

### Migration decision (Danish's call)

Existing entries are all gross. Options:
1. Split new only → books inconsistent.
2. **One-time backfill** that splits every historical VAT row → consistent, but
   rewrites real client transactions → must be a reviewed, dry-run-first,
   reversible migration.
3. New + per-company backfill on demand.

Recommended: **#2 with a dry-run report first** (lists every row that changes
and by how much) before it commits.

### Rollout plan

1. Push the `settleAccount` fixes (section 2) — safe, standalone.
2. Wire `vatSplit` into the 3 insert points behind `splitVat` (default OFF).
3. Add the settings toggle (Accounting settings).
4. Prove on a test company: new voucher / supplier invoice / customer invoice /
   bank post → correct 2-row postings; Trial Balance shows net P&L + real 27xx
   balances; **Mva-melding totals unchanged**; SAF-T still validates and now
   reconciles GL vs TaxInformation.
5. Turn it on for one real company, run the dry-run backfill, review, commit.
6. Then default ON for new NO companies.

### Impact when ON
- Trial Balance / Income Statement / Balance Sheet change (correctly): P&L net,
  27xx accounts carry real balances.
- Closes the **last SAF-T caveat** ([[2026-09-10-security-vat-saft-status.md]]) —
  GL account movements will reconcile against `<TaxInformation>`.
- Pakistan / non-VAT companies: unaffected (codes have no settleAccount).

## Related
- [[2026-09-10-vat-not-posted-as-ledger-line.md]] — original analysis
- [[2026-09-10-security-vat-saft-status.md]] — SAF-T status
- [[2026-09-10-entry-types-gap-analysis.md]]

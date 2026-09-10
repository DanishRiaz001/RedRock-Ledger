# Security / VAT / SAF-T — status & what's left (2026-09-10)

## Security (RLS)

**Design is solid; the open question is whether it's turned on in the live
Supabase project.** Without RLS, anyone with the public anon key (visible in the
browser network tab) can call the Supabase REST API directly and read/write any
company's books, bypassing the UI.

Policy files (run in order, in the Supabase SQL editor):
- `sql/multi_tenant_rls.sql`
- `sql/multi_tenant_rls_part2.sql`
- `sql/multi_tenant_rls_part3.sql`
- `sql/company_scoped_rls.sql`
- `sql/add_reconciliation.sql`, `sql/add_project_tracking.sql`,
  `sql/add_voucher_drafts.sql` (each enables RLS on its own table)

**Verify — run this and every row must be `true`:**
```sql
select tablename, rowsecurity from pg_tables
where schemaname='public' and tablename in
('transactions','accounts','contacts','invoices','bank_statement_lines',
 'txn_attachments','inbox_files','audit_log','entry_comments','budgets',
 'money_sources','reconciliation_files','projects','voucher_drafts');
```

**Also run if not already:** `sql/fix_uuid_bigint_mismatch.sql` — same column
type bug we fixed for `reconciliation_files`, but for `audit_log` and
`entry_comments`. Until run, the Change Log and entry comments silently fail to
save on every entry.

Other:
- Auth = standard Supabase email/password + JWT. Fine.
- Anthropic API key = localStorage, bring-your-own-key, only sent to
  api.anthropic.com. Don't enter on a shared machine.
- No 2FA — it's a Supabase Auth config toggle, can be enabled.

---

## VAT / MVA — close, not 100%

Correct:
- `MVA_CODES` matches Skatteetaten standard tax codes.
- Net VAT = output − input, extracted from VAT-inclusive amounts. Math is right.
- Mva-meldinger uses the correct Skatteetaten grouping; sign flips
  (Skyldig / Til gode) are correct.

Gaps:
- **Code 15** ("innførsel, middels sats") has `rate: 25`, should be `15`. Dormant
  (not assignable in the UI yet) so zero current impact, but wrong. One-line fix
  in `utils.js`.
- **No Altinn/Skatteetaten filing integration** — Mva-meldinger is a *report*;
  the actual melding is filed manually via Altinn. Deliberate scope decision.
- **Status (filed/paid/reconciled) is per-browser localStorage**, not the DB.
  Switch browsers → checkmarks reset. The numbers are always recalculated from
  the ledger so nothing is lost, just the status flags.

---

## SAF-T — a strong draft, NOT audit-verified

Real: built against the actual `Norwegian_SAF-T_Financial_Schema_v_1.30.xsd`
(correct namespace, element names, structure). Produces well-formed XML with
chart of accounts + opening/closing balances, customers, suppliers, the VAT code
table, and every posting in the period.

Not verified / missing — **do not represent as "100% compliant":**
- **Never validated against the XSD.** SAF-T is strict about element ordering;
  built carefully but unconfirmed without a validator.
- **No per-line `<TaxInformation>`** (VAT code/rate/amount per line). Since
  SAF-T's audit purpose is reconstructing the VAT return, an auditor could
  reject it for this. **This is the main thing to add.**
- `GroupingCode` just repeats the account's own code instead of a real Norwegian
  standard-chart grouping.
- Address is best-effort split from a single free-text field.
- **v1.30 becomes invalid 1 Jan 2027** — v1.40 upgrade required.
- Requires the company org number set in Company info (alerts if missing).

Treat as: "a solid starting point to hand an accountant for review", not "ready
to submit unchanged". SAF-T is on-demand (produced when Skatteetaten asks,
usually mid-audit), so there's time to get it reviewed.

**If picking this up:** add per-line TaxInformation, do an element-ordering pass
against the XSD, then run it through a SAF-T validator.

---

## SAF-T — compared against a REAL Tripletex export (2026-09-10)

Diffed our `buildSAFTXml()` against an actual Tripletex SAF-T Financial export
(`887124132`, Motex Engineering, FY2026, 19 transactions, valid file).

**Verdict: our export will NOT have the same structure and would very likely
FAIL Skatteetaten's XSD validation.** The conceptual skeleton matches
(Header → MasterFiles{Accounts, Customers, Suppliers, TaxTable} →
GeneralLedgerEntries{Journal → Transaction → Line}), but many element NAMES and
sub-structures are wrong. Our version looks written against a generic/older
SAF-T guess, not the Norwegian v1.3 schema.

### Header — many wrong element names (this is the worst area)
| Norwegian SAF-T v1.3 (Tripletex) | RedRock currently emits | Status |
|---|---|---|
| `<AuditFileVersion>1.30` | `<FileVersion>1.30` | ❌ wrong name |
| `<AuditFileCountry>NO` | — | ❌ missing (required) |
| `<AuditFileDateCreated>` | `<AuditFileDate>` + `<DateCreated>` | ❌ wrong names |
| `<Company><RegistrationNumber>` | `<Company><CompanyID>` | ❌ wrong name |
| `<Company><Name>` | `<Company><CompanyName>` | ❌ wrong name |
| `<Company><Address><StreetName>` | `…<AddressDetail>` | ❌ wrong name |
| `<Company><Contact>` (ContactPerson, Telephone, Email) | — | ❌ missing |
| `<Company><TaxRegistration><TaxRegistrationNumber>NO…MVA` | — | ❌ missing |
| `<Company><BankAccount>` | — | ❌ missing |
| `<DefaultCurrencyCode>NOK` | `<CurrencyCode>NOK` (in Header) | ❌ wrong name |
| `<SelectionCriteria><SelectionStartDate>/<SelectionEndDate>` | loose `<StartDate>`/`<EndDate>` | ❌ not wrapped |
| `<HeaderComment>` | — | optional, fine to skip |
| `<TaxAccountingBasis>A` | `<TaxAccountingBasis>A` | ✅ |
| `<UserID>` | `<UserID>` | ✅ |

### MasterFiles / GeneralLedgerAccounts — shape OK, content thin
- `AccountID`, `AccountDescription`, `AccountType=GL`, Opening/Closing balances → ✅ match.
- `GroupingCategory`: Tripletex uses real Norwegian standard categories
  (`balanseverdiForAnleggsmiddel` etc.); we hardcode `GL01`. ❌
- `GroupingCode`: Tripletex uses the Norwegian standard-chart grouping code;
  we just repeat the account's own code. ❌
- Tripletex adds `StandardAccountID` on mapped accounts; we don't.

### Customers / Suppliers — wrong element names + missing sub-elements
| Tripletex | RedRock | Status |
|---|---|---|
| `<RegistrationNumber>` | `<CompanyID>` | ❌ |
| `<Name>` | `<CompanyName>` | ❌ |
| `<Address><StreetName>` | `<Address><AddressDetail>` | ❌ |
| `<BalanceAccount><AccountID>+Opening/ClosingDebitBalance` (complex) | `<BalanceAccount>1500</BalanceAccount>` (bare text) | ❌ wrong type |
| `<PartyInfo><Type>/<Status>` | — | ❌ missing |
| Supplier `<TaxRegistration>` | — | ❌ missing |
| `<CustomerID>` / `<SupplierID>` | same | ✅ |

### TaxTable — close
- `TaxTableEntry{TaxType=MVA, Description, TaxCodeDetails{TaxCode, Description,
  TaxPercentage, Country=NO, StandardTaxCode, BaseRate}}`.
- We emit all of that EXCEPT `<BaseRate>` (Tripletex: `100.0`). Minor. ✅-ish.
- Note: MVA code 15 rate was 25 in our table — fixed to 15 on 2026-09-10.

### AnalysisTypeTable — absent in ours
Tripletex emits it (89 entries: Bilagsart, projects, departments) and every
`<Line>` carries `<Analysis>` tags. We have no dimensions in the export. OK to
skip *for now* (we barely use dimensions), but projects won't appear.

### GeneralLedgerEntries / Transaction / Line
- Wrapper: `NumberOfEntries`, `TotalDebit`, `TotalCredit`, one `<Journal>` → ✅ match.
- Transaction: we're missing `<TransactionType>` (Tripletex: `Normal`) and
  `<SystemID>`. Order otherwise close.
- Line: Tripletex order is `RecordID, AccountID, Analysis*, ValueDate,
  [SupplierID|CustomerID], Description, DebitAmount|CreditAmount, ReferenceNumber`.
  Ours: `RecordID, AccountID, Description, DebitAmount|CreditAmount,
  [CustomerID|SupplierID], ReferenceNumber, DueDate`. ❌ Description is in the
  wrong position; we emit `<DueDate>` which isn't a Line child at that spot in
  1.3; we're missing `<ValueDate>`.
- **`<TaxInformation>` per line**: NOT present in this Tripletex file either —
  but only because none of its 19 transactions carried VAT. When a line has a
  tax code it's required, and we still don't emit it (see the VAT-not-split
  note — [[2026-09-10-vat-not-posted-as-ledger-line.md]]).

### To make ours actually conform
1. Rewrite the **Header** to the v1.3 element names above (biggest single fix).
2. Customers/Suppliers: `RegistrationNumber`/`Name`/`StreetName`, complex
   `BalanceAccount`, add `PartyInfo`.
3. Accounts: real `GroupingCategory` + `GroupingCode` from the Norwegian
   standard chart (need a mapping table — the RF-1167/"Norsk standard
   kontoplan" grouping).
4. Line: reorder to the v1.3 sequence, add `ValueDate`, drop `DueDate` from the
   Line, add `TransactionType`/`SystemID`.
5. Add `<TaxInformation>` once VAT is a real posting.
6. `AnalysisTypeTable` + `<Analysis>` lines if/when dimensions matter.
7. Validate against `Norwegian_SAF-T_Financial_Schema_v_1.30.xsd` (or 1.40)
   with a real XSD validator before calling it done.

This is a focused ~1-day rewrite of `buildSAFTXml()` (reports.jsx ~726). Safe
to do in isolation — it's a pure function, output only.

---

## SAF-T — DONE: rewritten to conform to the official v1.3 XSD (2026-09-10)

`buildSAFTXml()` was rewritten against the real
`Norwegian_SAF-T_Financial_Schema_v_1.30.xsd` (Skatteetaten) and now:

- **Validates** — `npm run validate-saft` generates a SAF-T XML from a
  synthetic dataset and runs `xmllint --noout --schema` against the bundled
  official XSD (`scripts/saft/`). Passes clean.
- Moved to its own React-free module `src/lib/saft.js` so the test can import it.
- **Structurally equivalent to a real Tripletex export** (diffed element paths):
  same element names, order and nesting through Header → MasterFiles →
  GeneralLedgerEntries → Journal → Transaction → Line. Fixed everything in the
  gap table above (AuditFileVersion, RegistrationNumber, StreetName,
  DefaultCurrencyCode, SelectionCriteria, Contact, TaxRegistration, BankAccount,
  complex BalanceAccount, PartyInfo, HeaderComment, TransactionType, SystemID,
  ValueDate, Line ordering).
- **Adds per-line `<TaxInformation>`** (TaxType/TaxCode/TaxPercentage/TaxBase +
  Debit/CreditTaxAmount) on the line matching the VAT direction — Tripletex's
  sample file lacked it only because that file had no VAT.

### Still not 100% — the remaining honest caveats
1. **VAT is posted gross in the GL** (separate issue —
   [[2026-09-10-vat-not-posted-as-ledger-line.md]]). The SAF-T is now
   schema-valid and the `<TaxInformation>` breaks out base+tax correctly, but
   account 3000/4000 etc. movements in the file are VAT-inclusive. An auditor
   reconciling GL account totals against the VAT base could flag the gap. Fix
   the posting model and this closes.
2. **No dimensions** — Tripletex emits `AnalysisTypeTable` + `<Analysis>` on
   lines (Bilagsart, projects, departments). We don't export projects/dept
   tags. Optional per XSD; add if a company relies on project reporting in SAF-T.
3. `GroupingCategory` is a coarse class label; `GroupingCode` is the 2-digit
   kontogruppe prefix. XSD-valid, but a full mapping to the Norwegian standard
   chart grouping would be more precise.
4. Company/contact address is still split from one free-text field by regex.
5. Not yet run through Skatteetaten's own SAF-T test tool (only xmllint + the
   Tripletex structural diff). Worth doing before it's handed to an auditor.
6. **v1.40** (mandatory 2027-01-01) not done — this is v1.30.

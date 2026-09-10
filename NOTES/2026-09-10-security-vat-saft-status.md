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

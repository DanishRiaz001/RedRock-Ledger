# Entry types — what's missing (2026-09-10)

Covers the three "make an entry" flows in `NewEntryForm` (invoicing.jsx):
- **Advance Voucher** = `entryMode === "receipt"`
- **Supplier Invoice** = `entryMode === "supplier"`
- **Customer Invoice** = `entryMode === "customer"` (the quick sale form, NOT the
  full `InvoiceFormScreen` with PDF/sending)

---

## Cross-cutting — affects all three

### 1. Currency is decorative — HIGH priority
Every one of the three has a currency picker in the UI. **None of them persist it.**
- `save()` (Advance Voucher) builds `rows` with only date/description/debitCode/
  creditCode/amount/debitVatCode/creditVatCode — no `currency`, no `amountNok`.
- `saveInvoice()` (Supplier/Customer) — `allLines` carries `currency`/`amountNok`
  per line, but the `onSave({...})` call never reads them.
- `appshell.jsx` — neither `addTransaction` INSERT nor `saveEdit` UPDATE writes a
  `currency` column. There is no such column being written anywhere.
- **Effect:** a EUR 1 000 invoice posts `amount = 1000` into a NOK ledger. Wrong.
- **To fix properly:** add a `currency` + `amount_nok` column to `transactions`
  (migration), thread `currency`/`amountNok` through both save paths and
  `saveEdit`, and use `amountNok` (falling back to `amount` for NOK) as the
  booked ledger amount. Show the FX line in reports.
- **Interim:** if multi-currency isn't needed yet, hide the currency pickers so
  they don't imply a capability that isn't there.

### 2. Periodization is fake — MEDIUM
`invPeriodizationAccount` on Supplier/Customer Invoice does NOT create real
deferral postings. It just appends `" (Periodization: 17xx · Name)"` to the line
description (comment in `saveInvoice`: "reference-only ... since there's no
dedicated column for it yet").
- A real periodization posts the full amount to a 17xx (prepaid) / 29xx
  (deferred income) balance account now, then reverses 1/N into the P&L account
  each month for N months — as its own set of dated transactions sharing a
  groupRef.
- Needs: a periodization engine (split into N monthly reversal entries), a
  "periodize over N months from date X" input, and a way to see/adjust the
  schedule. Non-trivial but it's a standard accounting feature.
- Advance Voucher has NO periodization option at all.

### 3. `saveEdit` drops fields the create flow sets — MEDIUM
`addTransaction` INSERT writes `money_source_id`, `project_id`, `entry_mode`.
`saveEdit` UPDATE (appshell.jsx ~1529) writes only date, debit_code, credit_code,
description, amount, contact_id, invoice_no, due_date, vat_code, vat_pct,
vat_amount.
- **Effect:** open a saved bilag, edit anything, save → `project_id` and
  `money_source_id` are NOT re-sent (they survive only because a partial
  Postgres UPDATE leaves untouched columns alone — so actually OK for now — BUT
  the EditModal has no UI to *change* project / periodization / money source
  after save, and if `currency` is ever added it must go in `saveEdit` too).
- Real gap: **EditModal can't edit project, periodization, or money source** —
  only the generic fields. Add those to the editor.

---

## Advance Voucher — specific

Working well: multi-line flexible balancing, one-sided lines, per-line VAT,
attachment, comment, reverse-line, duplicate detection, draft save, the
`+ New account` / `+ New customer/supplier` in the account dropdown.

Missing:
- **No project / department tracking** (only invoice modes have `invShowProject`).
- **No periodization** at all.
- **No recurring-template** support (recurring invoices exist; recurring vouchers
  don't — e.g. a monthly rent accrual).
- **Currency** — picker present, not saved (see cross-cutting #1).
- The bilag-edit view (EditModal) now matches New Entry visually, but see
  cross-cutting #3 — can't edit project/periodization/money-source there.

---

## Supplier Invoice — specific

Working well: multi-line Costs section, due date + invoice number (both
persisted), register-payment-now vs leave-as-open-item (partial payment
supported), kreditnota via negative amount, project tracking (persisted),
auto-link to 2400, last-account-for-this-supplier auto-fill, attachment on the
first line.

Missing:
- **Currency + Amount-in-NOK** — the fields render per cost line but
  `saveInvoice` ignores them (cross-cutting #1). A foreign-currency supplier
  invoice posts the foreign number as NOK.
- **Periodization** — description-text only (cross-cutting #2).
- **No approval / "awaiting approval" workflow** — invoice posts straight to the
  ledger. A firm may want a "received → to approve → approved → posted" flow.
- **No supplier-statement matching** (reconcile what the supplier says you owe
  vs what's booked).
- **No AI pre-fill from the attachment inside this form** — OCR/AI extraction
  only happens in the Inbox, then feeds the form. Attaching a PDF directly here
  doesn't trigger extraction.
- **No duplicate-invoice-number guard per supplier** — the generic
  date+amount+description duplicate check exists, but not "you already booked
  invoice #4561 from this supplier".

---

## Customer Invoice (quick sale form) — specific

This is the fast "record a sale" entry, mirrored from Supplier Invoice (1500,
output VAT). The full invoicing product (line items, PDF, send, dunning) is the
separate `InvoiceFormScreen`.

Missing:
- **Currency** — same as cross-cutting #1.
- **Periodization** — description-text only.
- **No document output** — this form can't produce a PDF or send anything;
  that's `InvoiceFormScreen`. If a user expects "make a customer invoice" to
  produce a sendable invoice, that expectation isn't met here. Consider a clear
  label ("Quick sale — no document") or a "convert to full invoice" action.
- **No credit-limit / overdue check** on the customer before booking.

---

## Suggested order if picking this up

1. Decide multi-currency: **wire it through** (column + save paths + saveEdit +
   report display) **or hide the pickers**. Don't leave it half-there.
2. Add project + (real) periodization + money-source editing to **EditModal**.
3. Build a real **periodization engine** (used by all three).
4. Advance Voucher: add **project tracking** to match invoice modes.
5. Supplier Invoice: **duplicate-invoice-number-per-supplier** guard (cheap, high
   value).
6. Longer: approval workflow, recurring vouchers, supplier-statement matching.

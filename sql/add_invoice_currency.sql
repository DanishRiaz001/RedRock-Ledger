-- Invoices posted in a currency other than the company's own base currency
-- (e.g. an NOK invoice on a PKR-based company's books) now store both the
-- original invoiced figure and the currency it was invoiced in, mirroring
-- the transactions table's own currency/currency_amount columns added by
-- add_transaction_currency.sql. invoices.total/subtotal/vat_amount always
-- hold the BASE-currency equivalent actually posted to the ledger —
-- currency_amount is the face-value total as invoiced, currency is that
-- invoice's currency code.

alter table invoices add column if not exists currency text;
alter table invoices add column if not exists currency_amount numeric;

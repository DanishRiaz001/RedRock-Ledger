-- ============================================================================
-- Foreign-currency postings
--
-- Until now the currency picker on the entry forms was decorative — a EUR
-- 1 000 invoice posted `amount = 1000` straight into the NOK ledger.
--
-- Now: `amount` is ALWAYS the NOK-booked value (so every report keeps summing
-- the same column, no report changes). When an entry is in another currency:
--   currency         — ISO code (EUR, USD, …); NULL / 'NOK' means domestic
--   currency_amount   — the original foreign amount (for the entry view + the
--                       SAF-T <CurrencyCode>/<CurrencyAmount> pair)
-- ============================================================================

alter table transactions add column if not exists currency text;
alter table transactions add column if not exists currency_amount numeric;

notify pgrst, 'reload schema';

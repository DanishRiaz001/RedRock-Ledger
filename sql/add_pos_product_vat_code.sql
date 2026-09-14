-- ============================================================================
-- POS products get their own VAT code, so a checkout sale can post the
-- correct output-VAT split (Dr payment account / Cr sale account net / Cr
-- 27xx VAT) instead of always posting gross with no VAT split at all —
-- the app's own VAT-split feature applies everywhere else already
-- (companyProfile.splitVat is mandatory), Checkout was the one path that
-- never carried a VAT code through to addTransaction.
-- ============================================================================
alter table pos_products add column if not exists vat_code text;

-- Records HOW an entry was originally created (supplier invoice, customer
-- invoice, or null for anything else — receipt/manual/bank/POS/etc.) so
-- reopening it later can recognizably show it as what it actually is,
-- instead of always falling back to the generic multi-line voucher editor.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS entry_mode text;

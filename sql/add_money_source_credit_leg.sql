-- ============================================================================
-- Independent money-source tag for the credit leg of a transaction.
--
-- A transfer between two of the user's own bank accounts (e.g. Alfalah ->
-- DIB) is stored as ONE transaction row — debitCode is the receiving bank,
-- creditCode is the sending bank. Until now that row had a single
-- money_source_id, so tagging "whose money" on one bank's side of the
-- transfer automatically showed the same tag on the OTHER bank's side too,
-- since both views were reading the same field off the same row.
--
-- money_source_id now means "the tag as seen from the DEBIT side" and this
-- new column is "the tag as seen from the CREDIT side" — independent, so a
-- transfer's two bank legs can be assigned to different people/sources (or
-- one tagged and the other left blank) without affecting each other. For an
-- ordinary transaction (only one side is a bank account), only
-- money_source_id is ever used — this column stays null.
-- ============================================================================
alter table transactions add column if not exists money_source_id_credit text;

-- Backfill: for transfers between two of the user's own "19xx" bank accounts
-- (NS 4102 series, excluding 1900 Cash in Hand itself) that were already
-- tagged under the old single-field scheme, mirror the existing tag onto
-- the new credit-leg column too — so nothing anyone currently sees changes
-- as a result of running this migration. Only re-tagging one side from now
-- on (in the app) makes that transfer's two legs diverge.
update transactions
set money_source_id_credit = money_source_id
where money_source_id is not null
  and money_source_id_credit is null
  and debit_code ~ '^[0-9]+$' and credit_code ~ '^[0-9]+$'
  and debit_code::numeric >= 1900 and debit_code::numeric < 2000 and debit_code <> '1900'
  and credit_code::numeric >= 1900 and credit_code::numeric < 2000 and credit_code <> '1900';

-- Adds the fields needed for auto AI-analysis of uploaded inbox files
-- (supplier/amount/invoice number/doc type), shown as suggestions in the
-- Voucher inbox screen so a file can be posted with one click instead of
-- opening it and typing everything by hand.
ALTER TABLE inbox_files ADD COLUMN IF NOT EXISTS ai_supplier text;
ALTER TABLE inbox_files ADD COLUMN IF NOT EXISTS ai_amount numeric;
ALTER TABLE inbox_files ADD COLUMN IF NOT EXISTS ai_invoice_no text;
ALTER TABLE inbox_files ADD COLUMN IF NOT EXISTS ai_doc_type text;
ALTER TABLE inbox_files ADD COLUMN IF NOT EXISTS ai_analyzed boolean DEFAULT false;
NOTIFY pgrst, 'reload schema';

-- Adds the new AI-extraction fields the Inbox now reads: invoice date,
-- due date, and a short description of the expense (from the document's
-- own "Fakturadato"/"Forfallsdato"/"Beskrivelse" fields).
ALTER TABLE inbox_files ADD COLUMN IF NOT EXISTS ai_invoice_date date;
ALTER TABLE inbox_files ADD COLUMN IF NOT EXISTS ai_due_date date;
ALTER TABLE inbox_files ADD COLUMN IF NOT EXISTS ai_description text;

-- Fix: audit log ("Change log") and entry comments both silently failed to
-- save, ever. Root cause: audit_log.entity_id and entry_comments.transaction_id
-- were both created as bigint, but the values the app actually sends are
-- UUIDs (transactions.id, invoices.id, contacts.id, etc. are all uuid).
-- Postgres rejected every insert with "invalid input syntax for type
-- bigint", and the app code swallowed that error without telling anyone —
-- so "Change log" always showed "No history recorded" and comments always
-- silently vanished, for every single entry, since these tables were
-- created. Confirmed safe: both columns are 100% empty (0 non-null rows),
-- so this is a pure type fix, not a data migration.
ALTER TABLE audit_log ALTER COLUMN entity_id TYPE uuid USING entity_id::text::uuid;
ALTER TABLE entry_comments ALTER COLUMN transaction_id TYPE uuid USING transaction_id::text::uuid;
NOTIFY pgrst, 'reload schema';

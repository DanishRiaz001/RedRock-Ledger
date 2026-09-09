-- Diagnostic for: "Couldn't save that attachment: invalid input syntax for
-- type uuid: '15'" when attaching/syncing a bank statement.
--
-- txn_attachments.txn_id and txn_attachments.file_id are both uuid columns,
-- referencing transactions.id and inbox_files.id respectively. Postgres
-- rejects the write because ONE of those two ids being passed in is "15" —
-- a short, non-uuid value — not a schema mismatch (both id columns really
-- are uuid; this is a bad ROW somewhere, not a bad column type).
--
-- Run this in the Supabase SQL editor and share the output — it finds
-- exactly which table/row has a non-uuid id sitting in it, which is what
-- decides the real fix (re-key it, or delete it if it's junk/test data).

select 'transactions' as table_name, id::text, description, date, amount
from transactions
where id::text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

select 'inbox_files' as table_name, id::text, name, storage_path, date
from inbox_files
where id::text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

-- Also worth checking directly: does any inbox file or transaction happen
-- to literally have "15" as its id (in case one of the id columns above
-- turns out to actually be a non-uuid type and this query itself errors —
-- if either of the two selects above fails to even run with a cast error,
-- that tells us which table's id column ISN'T uuid, which is useful too).
select 'inbox_files literal 15' as check_name, * from inbox_files where id::text = '15';
select 'transactions literal 15' as check_name, * from transactions where id::text = '15';

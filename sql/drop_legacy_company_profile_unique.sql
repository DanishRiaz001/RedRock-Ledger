-- Drop any leftover single-column UNIQUE(user_id) constraint on
-- company_profile that predates multi-company support.
--
-- fix_company_id_unique_constraints.sql added the composite
-- UNIQUE(user_id, company_id) constraint the app's upsert actually
-- targets, but never checked for (or dropped) an older single-column
-- UNIQUE(user_id) constraint that may still be sitting on this table from
-- before multi-company existed. If that old constraint is still present,
-- a SECOND company's first-ever company_profile save (a plain INSERT,
-- since no row exists yet for that company) collides with it — Postgres
-- enforces every unique constraint on a table during INSERT, not just the
-- one named in ON CONFLICT — and the save fails outright for any company
-- past your first one.
--
-- Finds any unique constraint on company_profile whose column list is
-- EXACTLY {user_id} (never touches the composite one, or anything else)
-- and drops it. Safe to run multiple times — a no-op once it's gone.

DO $$
DECLARE
  legacy_constraint text;
BEGIN
  SELECT con.conname INTO legacy_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'company_profile'
    AND con.contype = 'u'
    AND con.conkey = (
      SELECT array_agg(attnum ORDER BY attnum)
      FROM pg_attribute
      WHERE attrelid = rel.oid AND attname = 'user_id'
    )
  LIMIT 1;

  IF legacy_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE company_profile DROP CONSTRAINT %I', legacy_constraint);
    RAISE NOTICE 'Dropped legacy single-column unique constraint: %', legacy_constraint;
  ELSE
    RAISE NOTICE 'No legacy single-column unique(user_id) constraint found on company_profile — nothing to do.';
  END IF;
END $$;

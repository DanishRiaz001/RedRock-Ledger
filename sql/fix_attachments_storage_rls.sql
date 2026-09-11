-- ============================================================================
-- Fix: granted employees can't open a client's uploaded files ("Couldn't
-- load X.pdf" in the Voucher/Inbox preview when viewing a client you were
-- granted client_access to).
--
-- Root cause: files in Storage bucket "attachments" are stored under the
-- REAL UPLOADER's own auth uid (`${getCurrentUserId()}/timestamp_name`,
-- see uploadFileToStorage in src/lib/storage.js) — that's deliberate, so an
-- employee's own uploads are never blocked by RLS regardless of whose
-- books they're posting into. But the Storage bucket's default policy only
-- ever checks "does the first path segment equal auth.uid()", so a FILE
-- uploaded by the books' real owner (or a different employee) can never be
-- read by anyone else, even someone with a valid client_access grant to
-- those exact books.
--
-- Fix: extend the bucket's SELECT policy so it also allows reading a file
-- when the row referencing it (inbox_files.storage_path) belongs to a
-- books-owner (inbox_files.user_id) the requester has client_access to,
-- via the same rr_can_read(user_id) helper already used for every other
-- table (see sql/multi_tenant_rls.sql / multi_tenant_rls_part2.sql — run
-- those FIRST, this depends on rr_can_read existing).
--
-- Run this once in the Supabase SQL editor. Safe to re-run (drops+recreates
-- the policy). Does not touch INSERT/UPDATE/DELETE — uploads/deletes still
-- go through the existing "own folder only" behaviour, which is correct
-- since every upload is written under the real uploader's own uid.
-- ============================================================================

drop policy if exists "attachments_read_via_grant" on storage.objects;

create policy "attachments_read_via_grant" on storage.objects for select
using (
  bucket_id = 'attachments'
  and (
    -- unchanged: you can always read your own uploads
    auth.uid()::text = (storage.foldername(name))[1]
    -- new: you can also read a file if it's attached to a client's books
    -- you have any client_access grant for
    or exists (
      select 1 from inbox_files f
      where f.storage_path = storage.objects.name
        and rr_can_read(f.user_id)
    )
  )
);

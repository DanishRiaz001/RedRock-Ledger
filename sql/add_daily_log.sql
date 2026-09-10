-- ============================================================================
-- Daily Log — a dead-simple "capture anything from your day" feature.
-- The client snaps a photo / picks any files (receipt, parking ticket, a note
-- about charging the car) and writes one line about what it is. No accounting,
-- no posting — just a dated, searchable shoebox that a bookkeeper can turn into
-- real vouchers later.
--
-- The actual files are stored the same way as everything else: uploaded to the
-- `attachments` Storage bucket and recorded as rows in `inbox_files`
-- (folder = 'Daily Log'). This table only ties a note + date to the set of
-- inbox_files ids that belong to that capture, so nothing new is needed on the
-- Storage side and the files also show up in the normal Inbox.
--
-- Same company-scoped RLS pattern as voucher_drafts / reconciliation etc.
-- ============================================================================
create table if not exists daily_log_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  company_id uuid references companies(id) on delete cascade,
  -- what the client typed — "Charged the car at Circle K", "Lunch with client"
  note text not null default '',
  -- the day it happened (defaults to capture day, editable by the client)
  happened_on date not null default current_date,
  -- inbox_files.id values for the photos/documents in this capture
  file_ids bigint[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table daily_log_entries enable row level security;

drop policy if exists daily_log_entries_select on daily_log_entries;
create policy daily_log_entries_select on daily_log_entries for select
  using (rr_can_read_company(user_id, company_id));

drop policy if exists daily_log_entries_write on daily_log_entries;
create policy daily_log_entries_write on daily_log_entries for all
  using (rr_can_write_company(user_id, company_id))
  with check (rr_can_write_company(user_id, company_id));

create index if not exists daily_log_entries_company_idx on daily_log_entries(company_id);
create index if not exists daily_log_entries_date_idx on daily_log_entries(happened_on desc);

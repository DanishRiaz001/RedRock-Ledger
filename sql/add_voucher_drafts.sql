-- ============================================================================
-- Voucher drafts — "Draft" on the Advance Voucher screen saves the entry
-- WITHOUT posting it: no bilag is assigned, nothing lands in `transactions`.
-- The whole form (lines, date, description, entry mode) is kept as JSON so
-- resuming a draft can restore the exact editing state, not just a summary.
-- Same company-scoped RLS pattern as every other transactional table
-- (rr_can_write_company — entries-level write, not full/settings-level,
-- since drafting an entry needs the same permission as posting one).
-- ============================================================================
create table if not exists voucher_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid references companies(id) on delete cascade,
  entry_mode text not null default 'receipt', -- "receipt" | "supplier" | "customer"
  -- Free-form snapshot of the entry form at the moment "Draft" was clicked —
  -- lines, date, description, contact, everything needed to resume editing
  -- exactly where it left off. Kept as JSON rather than real columns since
  -- it mirrors the in-memory form shape 1:1 and that shape already varies
  -- by entry mode.
  form jsonb not null,
  -- A short label for the drafts list — the entry's own description when
  -- there is one, else a generic placeholder, computed client-side.
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table voucher_drafts enable row level security;

drop policy if exists voucher_drafts_select on voucher_drafts;
create policy voucher_drafts_select on voucher_drafts for select
  using (rr_can_read_company(user_id, company_id));

drop policy if exists voucher_drafts_write on voucher_drafts;
create policy voucher_drafts_write on voucher_drafts for all
  using (rr_can_write_company(user_id, company_id))
  with check (rr_can_write_company(user_id, company_id));

create index if not exists voucher_drafts_company_idx on voucher_drafts(company_id);

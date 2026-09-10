-- ============================================================================
-- VAT split — BACKFILL of historical (pre-flag) entries
--
-- Going forward, entries with a plain VAT code are booked net + a 27xx VAT
-- row (see add_vat_split.sql). This script does the same to entries that were
-- already posted GROSS: it reduces the P&L row to net and inserts the VAT leg.
--
-- ⚠️  THIS REWRITES REAL TRANSACTIONS. Run it deliberately, per company, and
--     ONLY after: (1) a full backup, (2) running section A (dry run) and
--     eyeballing the rows it will change, (3) confirming the company's books
--     should be net going back this far.
--
--     Set :owner to the books-owner user_id and :company to the company_id
--     (or leave :company NULL for a single-company account). Nothing commits
--     until you run section B inside an explicit transaction and COMMIT.
-- ============================================================================

-- code → { rate, settlement account, side }  (the autoSplit codes only)
create temporary table _vatmap(code text primary key, rate numeric, acct text, dir text) on commit drop;
insert into _vatmap values
  ('3','25','2700','output'),('31','15','2701','output'),('32','11.11','2701','output'),('33','12','2702','output'),
  ('1','25','2710','input'), ('11','15','2711','input'), ('12','11.11','2711','input'), ('13','12','2712','input');

-- Candidate rows: gross, plain VAT code, not already split, and the P&L
-- account is on the side the code's direction expects.
create temporary view _cand as
select t.*, m.rate, m.acct, m.dir,
       round(t.amount - t.vat_amount, 2) as net_amount
from transactions t
join _vatmap m on m.code = t.vat_code
where coalesce(t.vat_split,false) = false
  and t.vat_amount is not null and t.vat_amount <> 0
  and t.amount > t.vat_amount
  and t.user_id = :owner
  and (:company::uuid is null or t.company_id = :company::uuid)
  and ( (m.dir = 'input'  and left(t.debit_code,1) in ('4','5','6','7','8'))
     or (m.dir = 'output' and left(t.credit_code,1) = '3') );

-- ── Section A — DRY RUN (safe, read-only). Review this output. ──
select bilag, date, debit_code, credit_code, description,
       amount as gross_now, net_amount as net_after, vat_amount, acct as vat_leg_account, dir
from _cand
order by bilag;

select count(*) as rows_to_split, sum(vat_amount) as total_vat_to_move from _cand;

-- ── Section B — APPLY (uncomment, wrap in BEGIN/COMMIT, run once) ──
-- begin;
--   -- 1. insert the VAT leg for each candidate, sharing its bilag
--   insert into transactions (user_id, company_id, bilag, date, debit_code, credit_code, description, amount, vat_split)
--   select user_id, company_id, bilag, date,
--          case when dir='input'  then acct        else debit_code end,
--          case when dir='input'  then credit_code else acct        end,
--          description || ' — ' || case when dir='input' then 'inngående mva' else 'utgående mva' end,
--          vat_amount, true
--   from _cand;
--   -- 2. reduce the original P&L row to net + mark it
--   update transactions t set amount = c.net_amount, vat_split = true
--   from _cand c where c.id = t.id;
-- commit;
--
-- Then in Supabase: notify pgrst, 'reload schema';  (not needed — no schema change)

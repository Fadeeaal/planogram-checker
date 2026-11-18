-- Phase 2: shelf category on submissions + Claude vision analysis results.

-- Nullable so phase-1 rows stay valid; the API requires it for new submissions.
alter table public.submissions
  add column if not exists shelf_category text
  check (shelf_category in ('skincare', 'vitamin'));

create table if not exists public.submission_analyses (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'analyzing', 'done', 'failed')),
  attempts integer not null default 0,
  model text,
  -- Bump in code whenever the prompt/schema changes so old and new scores can be told apart.
  prompt_version text,
  overall_score integer,
  summary text,
  -- { "<product_key>": { found, share_of_shelf_pct, eye_level_m, visibility, blocking, facing_count, notes } }
  products jsonb,
  competitors text[],
  recommendations text[],
  raw_output jsonb,
  error text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists submission_analyses_status_idx
  on public.submission_analyses (status, created_at);

alter table public.submission_analyses enable row level security;

-- Flat report, one row per (submission, product) — similar to the old ShelfChecker sheet.
-- security_invoker keeps RLS in force for whoever queries the view.
create or replace view public.analysis_report
with (security_invoker = true) as
select
  s.submitted_at,
  st.name                                as store,
  s.shelf_category,
  s.photo_type,
  a.status,
  a.overall_score,
  a.summary,
  p.key                                  as product,
  (p.value ->> 'found')::boolean         as found,
  (p.value ->> 'share_of_shelf_pct')::numeric as share_of_shelf_pct,
  (p.value ->> 'eye_level_m')::numeric   as eye_level_m,
  p.value ->> 'visibility'               as visibility,
  p.value ->> 'blocking'                 as blocking,
  (p.value ->> 'facing_count')::integer  as facing_count,
  p.value ->> 'notes'                    as notes,
  array_to_string(a.competitors, ', ')   as competitors,
  array_to_string(a.recommendations, ' | ') as recommendations,
  a.error,
  a.submission_id,
  s.photo_path
from public.submission_analyses a
join public.submissions s on s.id = a.submission_id
join public.stores st on st.id = s.store_id
left join lateral jsonb_each(a.products) p on true;

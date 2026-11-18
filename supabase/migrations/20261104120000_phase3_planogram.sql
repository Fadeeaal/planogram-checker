-- Phase 3: Before -> planogram guide -> After flow, scored against the planogram.

-- An After photo points at the Before photo of the same shelf visit.
alter table public.submissions
  add column if not exists before_submission_id uuid
  references public.submissions (id) on delete set null;

-- One After per Before.
create unique index if not exists submissions_before_submission_id_key
  on public.submissions (before_submission_id)
  where before_submission_id is not null;

-- Planogram metrics (PROMPT_VERSION v2-planogram). overall_score, competitors
-- etc. from phase 2 stay for older rows.
alter table public.submission_analyses
  add column if not exists photo_issue text,
  add column if not exists observed_order text[],
  add column if not exists osa_pct integer,
  add column if not exists planogram_compliance_pct integer,
  add column if not exists sos_pct numeric,
  add column if not exists eye_level text,
  add column if not exists eye_level_m numeric,
  add column if not exists deviations text[];

-- Same columns as phase 2 (create or replace can only append), plus planogram fields.
-- For v2 rows "product" is a planogram SKU key.
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
  s.photo_path,
  p.value ->> 'shelf_level'              as shelf_level,
  a.prompt_version,
  a.photo_issue,
  a.osa_pct,
  a.planogram_compliance_pct,
  a.sos_pct,
  a.eye_level                            as brand_eye_level,
  a.eye_level_m                          as brand_eye_level_m,
  array_to_string(a.deviations, ' | ')   as deviations,
  s.before_submission_id
from public.submission_analyses a
join public.submissions s on s.id = a.submission_id
join public.stores st on st.id = s.store_id
left join lateral jsonb_each(a.products) p on true;

-- One row per shelf visit: Before vs After side by side. Visits where the SPG
-- has not sent the After photo yet show empty after_* columns.
create or replace view public.planogram_report
with (security_invoker = true) as
select
  b.submitted_at                         as before_at,
  af.submitted_at                        as after_at,
  st.name                                as store,
  b.shelf_category,
  ba.status                              as before_status,
  aa.status                              as after_status,
  ba.planogram_compliance_pct            as before_compliance_pct,
  aa.planogram_compliance_pct            as after_compliance_pct,
  ba.osa_pct                             as before_osa_pct,
  aa.osa_pct                             as after_osa_pct,
  ba.sos_pct                             as before_sos_pct,
  aa.sos_pct                             as after_sos_pct,
  ba.eye_level                           as before_eye_level,
  aa.eye_level                           as after_eye_level,
  aa.summary                             as after_summary,
  array_to_string(aa.deviations, ' | ')  as after_deviations,
  array_to_string(aa.recommendations, ' | ') as after_recommendations,
  concat_ws(' | ', ba.photo_issue, aa.photo_issue) as photo_issues,
  b.id                                   as before_submission_id,
  af.id                                  as after_submission_id,
  b.photo_path                           as before_photo_path,
  af.photo_path                          as after_photo_path
from public.submissions b
join public.stores st on st.id = b.store_id
left join public.submissions af on af.before_submission_id = b.id
left join public.submission_analyses ba on ba.submission_id = b.id
left join public.submission_analyses aa on aa.submission_id = af.id
where b.photo_type = 'before';

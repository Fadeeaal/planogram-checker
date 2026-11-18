-- Shelf heights from the shelf count (PROMPT_VERSION v5-shelf-height): every shelf is
-- 20 cm above the one below it (lowest = 20 cm). Claude reports shelf_from_bottom,
-- code computes height_cm and the level label. Only the report views change.

-- Same columns as phase 4 (create or replace can only append), plus per-SKU height.
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
  s.before_submission_id,
  a.detected_brand,
  a.facing_compliance_pct,
  public.shelf_width_cm(a.shelves)       as shelf_width_cm,
  public.plan_summary(a.plan)            as plan,
  (p.value ->> 'shelf_from_bottom')::integer as shelf_from_bottom,
  (p.value ->> 'height_cm')::integer as height_cm
from public.submission_analyses a
join public.submissions s on s.id = a.submission_id
join public.stores st on st.id = s.store_id
left join lateral jsonb_each(a.products) p on true;

-- Same columns as phase 4, plus the brand block height (m) for Before and After.
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
  af.photo_path                          as after_photo_path,
  ba.detected_brand                      as before_detected_brand,
  aa.detected_brand                      as after_detected_brand,
  ba.facing_compliance_pct               as before_facing_compliance_pct,
  aa.facing_compliance_pct               as after_facing_compliance_pct,
  public.shelf_width_cm(ba.shelves)      as shelf_width_cm,
  -- What the SPG was asked to build: the After's copy, or the Before's suggestion if no After yet.
  coalesce(af.target_plan, ba.plan) ->> 'source' as plan_source,
  public.plan_summary(coalesce(af.target_plan, ba.plan)) as suggested_plan,
  array_to_string(
    array(select jsonb_array_elements_text(coalesce(af.target_plan, ba.plan) -> 'excluded')), ', '
  )                                      as excluded_skus,
  ba.eye_level_m                         as before_eye_level_m,
  aa.eye_level_m                         as after_eye_level_m
from public.submissions b
join public.stores st on st.id = b.store_id
left join public.submissions af on af.before_submission_id = b.id
left join public.submission_analyses ba on ba.submission_id = b.id
left join public.submission_analyses aa on aa.submission_id = af.id
where b.photo_type = 'before';

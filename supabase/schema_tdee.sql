-- 食咗飯未 — TDEE v2：活動量問卷、減脂速度、安全篩查
-- 喺 Supabase → SQL Editor 執行。可重複執行（idempotent）。
-- 未執行之前，app 照常運作，用舊嘅「活動量」下拉（低信心），新問卷唔會儲存。

alter table public.profiles alter column activity_level drop not null;

alter table public.profiles add column if not exists steps_range text
  check (steps_range in ('lt3000', '3000_4999', '5000_6999', '7000_9999', 'gte10000', 'unknown'));
alter table public.profiles add column if not exists mean_steps_28d integer
  check (mean_steps_28d between 0 and 60000);
alter table public.profiles add column if not exists step_source text
  check (step_source in ('device', 'manual', 'estimate'));
alter table public.profiles add column if not exists step_coverage text
  check (step_coverage in ('high', 'medium', 'low'));
alter table public.profiles add column if not exists work_activity text
  check (work_activity in ('mostly_sitting', 'mixed', 'standing_walking', 'manual_labor', 'unknown'));
alter table public.profiles add column if not exists exercise_type text
  check (exercise_type in ('none', 'resistance', 'cardio', 'mixed', 'other'));
alter table public.profiles add column if not exists exercise_sessions_per_week integer
  check (exercise_sessions_per_week between 0 and 14);
alter table public.profiles add column if not exists exercise_minutes integer
  check (exercise_minutes between 0 and 300);
alter table public.profiles add column if not exists exercise_intensity text
  check (exercise_intensity in ('light', 'moderate', 'vigorous'));
alter table public.profiles add column if not exists exercise_included_in_steps text
  check (exercise_included_in_steps in ('yes', 'no', 'unknown'));

alter table public.profiles add column if not exists pace text
  check (pace in ('gentle', 'standard', 'faster', 'custom'));
alter table public.profiles add column if not exists custom_kcal integer
  check (custom_kcal between 800 and 6000);

-- 安全篩查：只儲存結果（最少蒐集原則），唔儲存用戶具體選咗乜病／藥物
alter table public.profiles add column if not exists risk_review text not null default 'not_assessed'
  check (risk_review in ('clear', 'needs_review', 'not_assessed'));

-- 用邊個版本嘅公式計出嚟，方便日後遷移同解釋
alter table public.profiles add column if not exists formula_version text;
alter table public.profiles add column if not exists activity_updated_at timestamptz;

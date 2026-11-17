-- 食咗飯未 — 身體組成（智能磅報告）記錄 ＋ AI 分析
-- 喺 Supabase → SQL Editor 執行。可重複執行（idempotent）。
-- 未執行之前，app 照常運作，只係身體組成功能用唔到。
-- 私隱：只儲存數字（唔儲存截圖）。每人每日一條（再記同一日會覆蓋）。

create table if not exists public.body_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(5, 1) not null check (weight_kg between 30 and 300),
  body_fat_pct numeric(4, 1) check (body_fat_pct between 3 and 65),
  lean_kg numeric(5, 1) check (lean_kg between 20 and 200),
  muscle_kg numeric(5, 1) check (muscle_kg between 10 and 150),
  skeletal_muscle_kg numeric(5, 1) check (skeletal_muscle_kg between 8 and 100),
  water_pct numeric(4, 1) check (water_pct between 25 and 80),
  protein_pct numeric(4, 1) check (protein_pct between 5 and 35),
  bone_kg numeric(3, 1) check (bone_kg between 0.8 and 8),
  visceral_fat numeric(3, 1) check (visceral_fat between 1 and 60),
  bmr_kcal integer check (bmr_kcal between 600 and 4500),
  body_age integer check (body_age between 5 and 99),
  bmi numeric(4, 1) check (bmi between 10 and 70),
  heart_rate integer check (heart_rate between 30 and 220),
  source text not null default 'manual' check (source in ('screenshot', 'manual')),
  analysis jsonb,                          -- 最近一次分析（總結、設定建議），免重複 call AI
  analysis_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, measured_on)
);

create index if not exists body_scans_user_date_idx on public.body_scans (user_id, measured_on desc);

alter table public.body_scans enable row level security;

drop policy if exists "body_scans_select_own" on public.body_scans;
drop policy if exists "body_scans_insert_own" on public.body_scans;
drop policy if exists "body_scans_update_own" on public.body_scans;
drop policy if exists "body_scans_delete_own" on public.body_scans;

create policy "body_scans_select_own" on public.body_scans for select to authenticated using (user_id = auth.uid());
create policy "body_scans_insert_own" on public.body_scans for insert to authenticated with check (user_id = auth.uid());
create policy "body_scans_update_own" on public.body_scans
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "body_scans_delete_own" on public.body_scans for delete to authenticated using (user_id = auth.uid());

revoke all on public.body_scans from anon;

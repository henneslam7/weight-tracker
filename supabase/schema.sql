-- Fit AI — Phase 1 schema
-- 喺 Supabase → SQL Editor 執行。可重複執行（idempotent）。

-- ───────────── profiles（每個用戶一行）─────────────
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  sex text not null check (sex in ('male', 'female')),
  birth_date date not null,
  height_cm numeric(5, 1) not null check (height_cm between 120 and 230),
  activity_level text not null
    check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal text not null check (goal in ('lose', 'maintain', 'gain')),
  target_weight_kg numeric(5, 1) check (target_weight_kg between 30 and 300),
  weekly_rate_kg numeric(3, 2) check (weekly_rate_kg between 0.25 and 0.75),
  updated_at timestamptz not null default now()
);

-- ───────────── weight_logs（同一日再記會覆蓋）─────────────
create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  logged_on date not null,
  weight_kg numeric(5, 2) not null check (weight_kg between 30 and 300),
  created_at timestamptz not null default now(),
  unique (user_id, logged_on)
);

create index if not exists weight_logs_user_date_idx
  on public.weight_logs (user_id, logged_on desc);

-- ───────────── RLS：淨係可以存取自己嘅資料 ─────────────
alter table public.profiles enable row level security;
alter table public.weight_logs enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using (user_id = auth.uid());
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (user_id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "weight_logs_select_own" on public.weight_logs;
drop policy if exists "weight_logs_insert_own" on public.weight_logs;
drop policy if exists "weight_logs_update_own" on public.weight_logs;
drop policy if exists "weight_logs_delete_own" on public.weight_logs;

create policy "weight_logs_select_own" on public.weight_logs
  for select to authenticated using (user_id = auth.uid());
create policy "weight_logs_insert_own" on public.weight_logs
  for insert to authenticated with check (user_id = auth.uid());
create policy "weight_logs_update_own" on public.weight_logs
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "weight_logs_delete_own" on public.weight_logs
  for delete to authenticated using (user_id = auth.uid());

-- anon 角色完全冇權限
revoke all on public.profiles from anon;
revoke all on public.weight_logs from anon;

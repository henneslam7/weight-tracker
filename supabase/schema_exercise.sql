-- Fit 過林峯 — 運動記錄 schema
-- 喺 Supabase → SQL Editor 執行。可重複執行（idempotent）。
-- 要先執行過 schema.sql（Phase 1）。

create table if not exists public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  logged_on date not null,
  exercise_type text not null check (char_length(exercise_type) between 1 and 30),
  name text not null check (char_length(name) between 1 and 60),
  duration_min integer check (duration_min between 1 and 600),
  calories integer not null check (calories between 0 and 3000),  -- 淨消耗（唔計靜止都會燒嘅部分）
  source text not null default 'met' check (source in ('met', 'manual')),
  created_at timestamptz not null default now()
);

create index if not exists exercise_logs_user_date_idx
  on public.exercise_logs (user_id, logged_on desc);

alter table public.exercise_logs enable row level security;

drop policy if exists "exercise_logs_select_own" on public.exercise_logs;
drop policy if exists "exercise_logs_insert_own" on public.exercise_logs;
drop policy if exists "exercise_logs_update_own" on public.exercise_logs;
drop policy if exists "exercise_logs_delete_own" on public.exercise_logs;

create policy "exercise_logs_select_own" on public.exercise_logs
  for select to authenticated using (user_id = auth.uid());
create policy "exercise_logs_insert_own" on public.exercise_logs
  for insert to authenticated with check (user_id = auth.uid());
create policy "exercise_logs_update_own" on public.exercise_logs
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "exercise_logs_delete_own" on public.exercise_logs
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.exercise_logs from anon;

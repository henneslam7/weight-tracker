-- 食咗飯未 — 放縱日（cheat day）：集齊 7 個印花後領取
-- 喺 Supabase → SQL Editor 執行。可重複執行（idempotent）。
-- 未執行之前，app 照常運作，印花照計，只係領取唔到放縱日。

create table if not exists public.cheat_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cheat_on date not null,                 -- 放縱日嗰日（今日或聽日）
  stamps_through date,                    -- 用咗嘅印花去到邊一日（包括）
  created_at timestamptz not null default now(),
  unique (user_id, cheat_on)
);

create index if not exists cheat_days_user_idx on public.cheat_days (user_id, cheat_on desc);

alter table public.cheat_days enable row level security;

drop policy if exists "cheat_days_select_own" on public.cheat_days;
drop policy if exists "cheat_days_insert_own" on public.cheat_days;

create policy "cheat_days_select_own" on public.cheat_days
  for select to authenticated using (user_id = auth.uid());
-- 只准領（insert），唔准改或者刪，避免反覆領
create policy "cheat_days_insert_own" on public.cheat_days
  for insert to authenticated with check (user_id = auth.uid());

revoke all on public.cheat_days from anon;

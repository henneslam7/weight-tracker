-- 食咗飯未 — 用戶設定（語氣、食物 roast、長者模式）
-- 喺 Supabase → SQL Editor 執行。可重複執行（idempotent）。
-- 要先執行過 schema.sql（Phase 1）。未執行之前，app 照常用預設值。

create table if not exists public.user_prefs (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  tone text not null default 'neighbour' check (tone in ('soft', 'neighbour', 'spicy')),
  food_roast boolean not null default true,
  elder_mode boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.user_prefs enable row level security;

drop policy if exists "user_prefs_select_own" on public.user_prefs;
drop policy if exists "user_prefs_insert_own" on public.user_prefs;
drop policy if exists "user_prefs_update_own" on public.user_prefs;
drop policy if exists "user_prefs_delete_own" on public.user_prefs;

create policy "user_prefs_select_own" on public.user_prefs
  for select to authenticated using (user_id = auth.uid());
create policy "user_prefs_insert_own" on public.user_prefs
  for insert to authenticated with check (user_id = auth.uid());
create policy "user_prefs_update_own" on public.user_prefs
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "user_prefs_delete_own" on public.user_prefs
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.user_prefs from anon;

-- 食咗飯未 — 放縱日券（cheat day）：每集齊 7 個印花賺 1 張，儲起，幾時用都得
-- 喺 Supabase → SQL Editor 執行。可重複執行（idempotent）；舊版（只有「今日／聽日」嘅）資料會保留。
-- 未執行之前，app 照常運作，印花照計，只係用唔到放縱日券。
--
-- 一行 = 一張券：
--   cheat_on = null  → 已賺到、儲起咗（冇期限、冇數量上限）
--   cheat_on = 日期  → 揀咗嗰日用（今日或將來；將來嘅可以取消／改期，券退返庫存）

create table if not exists public.cheat_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cheat_on date,
  stamps_through date,                    -- 呢張券用咗嘅印花去到邊一日（包括）
  created_at timestamptz not null default now(),
  unique (user_id, cheat_on)              -- 同一日只可以有一張（null 唔互相衝突）
);

-- 舊版 cheat_on 係 not null：放寬，儲起嘅券就係 cheat_on = null
alter table public.cheat_days alter column cheat_on drop not null;

-- 同一批印花只可以換一次券（防重複；App 自動換券用 upsert ignore duplicates）
create unique index if not exists cheat_days_user_through_uidx
  on public.cheat_days (user_id, stamps_through);
create index if not exists cheat_days_user_idx on public.cheat_days (user_id, cheat_on desc);

alter table public.cheat_days enable row level security;

drop policy if exists "cheat_days_select_own" on public.cheat_days;
drop policy if exists "cheat_days_insert_own" on public.cheat_days;
drop policy if exists "cheat_days_update_own" on public.cheat_days;

create policy "cheat_days_select_own" on public.cheat_days
  for select to authenticated using (user_id = auth.uid());
-- 只准新增「儲起嘅券」（cheat_on 要係 null，而且要有 stamps_through）；唔准直接新增已用嘅
create policy "cheat_days_insert_own" on public.cheat_days
  for insert to authenticated with check (user_id = auth.uid() and cheat_on is null and stamps_through is not null);
-- 改動內容由下面個 trigger 把關（只准：用券、改期、取消預約）；冇 delete
create policy "cheat_days_update_own" on public.cheat_days
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 把關：只准改 cheat_on；用咗嘅日子（今日或之前）鎖死；將來嘅可以改期或者取消（退返庫存）
create or replace function public.cheat_days_guard() returns trigger
language plpgsql as $$
declare
  hk_today date := (now() at time zone 'Asia/Hong_Kong')::date;
begin
  if new.user_id is distinct from old.user_id
     or new.stamps_through is distinct from old.stamps_through
     or new.id is distinct from old.id then
    raise exception 'cheat_days: 只可以改 cheat_on';
  end if;
  if old.cheat_on is not null and old.cheat_on <= hk_today then
    raise exception 'cheat_days: 已經用咗或者今日嘅放縱日唔可以改';
  end if;
  if new.cheat_on is not null and (new.cheat_on < hk_today or new.cheat_on > hk_today + 365) then
    raise exception 'cheat_days: 日期要係今日至一年內';
  end if;
  return new;
end $$;

drop trigger if exists cheat_days_guard on public.cheat_days;
create trigger cheat_days_guard before update on public.cheat_days
  for each row execute function public.cheat_days_guard();

revoke all on public.cheat_days from anon;

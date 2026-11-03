-- Fit 過林峯 — Phase 2 schema（食物日記 + AI + 提醒）
-- 喺 Supabase → SQL Editor 執行。可重複執行（idempotent）。
-- 要先執行過 schema.sql（Phase 1）。

-- ───────────── food_logs ─────────────
create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  logged_on date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  name text not null check (char_length(name) between 1 and 80),
  quantity_text text check (char_length(quantity_text) <= 80),
  calories integer not null check (calories between 0 and 5000),
  protein_g numeric(6, 1) not null default 0 check (protein_g between 0 and 500),
  carbs_g numeric(6, 1) not null default 0 check (carbs_g between 0 and 800),
  fat_g numeric(6, 1) not null default 0 check (fat_g between 0 and 500),
  source text not null default 'manual' check (source in ('manual', 'ai', 'saved')),
  ai_raw jsonb,
  created_at timestamptz not null default now()
);
create index if not exists food_logs_user_date_idx
  on public.food_logs (user_id, logged_on desc);

-- ───────────── saved_meals（常食餐單）─────────────
create table if not exists public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  quantity_text text check (char_length(quantity_text) <= 80),
  calories integer not null check (calories between 0 and 5000),
  protein_g numeric(6, 1) not null default 0 check (protein_g between 0 and 500),
  carbs_g numeric(6, 1) not null default 0 check (carbs_g between 0 and 800),
  fat_g numeric(6, 1) not null default 0 check (fat_g between 0 and 500),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ───────────── push_subscriptions ─────────────
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ───────────── reminder_settings（每個用戶一行）─────────────
create table if not exists public.reminder_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  weight_enabled boolean not null default true,
  weight_time text not null default '07:30' check (weight_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  breakfast_enabled boolean not null default true,
  breakfast_time text not null default '08:30' check (breakfast_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  lunch_enabled boolean not null default true,
  lunch_time text not null default '12:30' check (lunch_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  dinner_enabled boolean not null default true,
  dinner_time text not null default '19:00' check (dinner_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  snack_enabled boolean not null default false,
  snack_time text not null default '16:00' check (snack_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  evening_enabled boolean not null default true,
  evening_time text not null default '21:00' check (evening_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  inactive_enabled boolean not null default true,
  inactive_days integer not null default 3 check (inactive_days between 2 and 14),
  quiet_enabled boolean not null default true,
  quiet_start text not null default '23:00' check (quiet_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  quiet_end text not null default '07:00' check (quiet_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  updated_at timestamptz not null default now()
);

-- ───────────── reminder_log（防止同一日重複發送；只有 server 寫入）─────────────
create table if not exists public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  sent_on date not null,
  sent_at timestamptz not null default now(),
  unique (user_id, kind, sent_on)
);

-- ───────────── ai_usage（每日 AI 次數；只可以經 function 增加）─────────────
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);

create or replace function public.increment_ai_usage(p_day date, p_max integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  insert into public.ai_usage (user_id, day, count)
    values (v_uid, p_day, 0)
    on conflict (user_id, day) do nothing;
  update public.ai_usage
    set count = count + 1
    where user_id = v_uid and day = p_day and count < p_max
    returning count into v_count;
  if v_count is null then
    return -1; -- 已達上限
  end if;
  return v_count;
end;
$$;

revoke all on function public.increment_ai_usage(date, integer) from public, anon;
grant execute on function public.increment_ai_usage(date, integer) to authenticated;

-- ───────────── RLS ─────────────
alter table public.food_logs enable row level security;
alter table public.saved_meals enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminder_settings enable row level security;
alter table public.reminder_log enable row level security;
alter table public.ai_usage enable row level security;

-- food_logs / saved_meals / push_subscriptions / reminder_settings：完整 CRUD，限自己
do $$
declare
  t text;
begin
  foreach t in array array['food_logs', 'saved_meals', 'push_subscriptions', 'reminder_settings']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid())', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid())', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())', t || '_delete_own', t);
  end loop;
end $$;

-- reminder_log / ai_usage：用戶只可以讀自己；寫入只由 server（service role）或 function 做
drop policy if exists "reminder_log_select_own" on public.reminder_log;
create policy "reminder_log_select_own" on public.reminder_log
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own" on public.ai_usage
  for select to authenticated using (user_id = auth.uid());

-- anon 角色完全冇權限
revoke all on public.food_logs from anon;
revoke all on public.saved_meals from anon;
revoke all on public.push_subscriptions from anon;
revoke all on public.reminder_settings from anon;
revoke all on public.reminder_log from anon;
revoke all on public.ai_usage from anon;

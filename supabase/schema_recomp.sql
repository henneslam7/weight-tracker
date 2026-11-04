-- 食咗飯未 — 加入目標「減脂＋增肌」（體態重組，goal = 'recomp'）
-- 喺 Supabase → SQL Editor 執行。可重複執行（idempotent）。
-- 未執行之前，app 照常運作，只係揀唔到「減脂＋增肌」（儲存時會提示）。

-- 搵出 profiles 上面講 goal 嘅 check constraint 並換成新嘅（唔靠固定名）
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%goal in%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_goal_check check (goal in ('lose', 'maintain', 'gain', 'recomp'));

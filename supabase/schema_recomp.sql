-- 食咗飯未 — 加入目標「減脂＋增肌」（體態重組，goal = 'recomp'）
-- 喺 Supabase → SQL Editor 執行。可重複執行（idempotent）。
-- 未執行之前，app 照常運作，只係揀唔到「減脂＋增肌」（儲存時會提示）。

alter table public.profiles drop constraint if exists profiles_goal_check;
alter table public.profiles
  add constraint profiles_goal_check check (goal in ('lose', 'maintain', 'gain', 'recomp'));

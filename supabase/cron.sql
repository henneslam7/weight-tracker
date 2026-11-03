-- 食咗飯未 — 提醒排程（Supabase pg_cron + pg_net）
-- Vercel Hobby 嘅 cron 只可以每日一次，唔夠用，所以改由 Supabase 每 5 分鐘 call 一次 app 嘅 API。
--
-- 用法：
--   1. 先喺 Supabase → Database → Extensions 開啟 pg_cron 同 pg_net
--      （如果下面 create extension 報錯，就用 dashboard 開）
--   2. 將下面兩個 <...> 換成你自己嘅值，再執行
--        <APP_URL>     例如 https://weight-tracker-ten-xi.vercel.app （尾部唔好加 /）
--        <CRON_SECRET> 同 Vercel 環境變數 CRON_SECRET 一樣
--   3. 呢個檔案喺 repo 入面只係範本，唔好將真正嘅 secret commit 上 GitHub。

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 如果之前建立過，先移除
select cron.unschedule('fit-reminders')
where exists (select 1 from cron.job where jobname = 'fit-reminders');

select cron.schedule(
  'fit-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := '<APP_URL>/api/cron/reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <CRON_SECRET>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- 檢查：
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select id, status_code, error_msg, created from net._http_response order by created desc limit 10;
-- 停用：
--   select cron.unschedule('fit-reminders');

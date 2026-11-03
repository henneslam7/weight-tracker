# Fit 過林峯

個人 AI 健身 web app（單一用戶、mobile-first PWA）。所有提示、提醒、鼓勵文案都集中喺 `lib/copy.ts`，語氣係「同林峯一樣靚仔，仲要 fit 過佢」。

**Phase 1**：登入／註冊、onboarding、BMR／TDEE／calories／macros 計算機、體重記錄、7 日移動平均趨勢圖、PWA。

**Phase 2**：食物日記（手動／常食餐單／AI 文字／相片記食物，Gemini structured output）、每日 calories／macros 進度、Web Push 提醒（體重、餐單、夜晚補記、好耐冇記；智能略過已記錄、靜音時段）。

Stack：Next.js 15（App Router）· React 19 · Tailwind v4 · TypeScript strict · Supabase（Postgres + Auth + RLS）· Vercel。

## 起手

1. 開 Supabase project → SQL Editor 執行 `supabase/schema.sql`
2. `cp .env.example .env.local`，填入 `NEXT_PUBLIC_SUPABASE_URL` 同 `NEXT_PUBLIC_SUPABASE_ANON_KEY`（只用 anon key）
3. `npm install` → `npm run dev`
4. 註冊自己之後，喺 Supabase → Authentication → Providers → Email 關閉 sign-up
5. Vercel Import repo，加同樣兩個 env vars，部署
6. iPhone Safari → 分享 → 加入主畫面

## Phase 2 設定

1. Supabase SQL Editor 執行 `supabase/schema_phase2.sql`
2. Vercel 加環境變數（見 `.env.example`）：`GEMINI_API_KEY`、`GEMINI_MODEL`、`SUPABASE_SERVICE_ROLE_KEY`、`NEXT_PUBLIC_VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT`、`CRON_SECRET`，然後 Redeploy
3. 用 `supabase/cron.sql` 範本喺 Supabase 建立每 5 分鐘一次嘅排程（Vercel Hobby cron 只可以每日一次，所以唔用）
4. iPhone：Safari 加入主畫面 → 由主畫面開 → 「提醒」頁 → 開啟通知 → 發送測試通知
5. 驗證 Gemini：`GEMINI_API_KEY=… GEMINI_MODEL=… node scripts/ai-smoke.ts "午餐食咗碗叉燒飯"`

相片喺 browser 先壓縮（最長 1280px、JPEG），server 驗證格式同檔頭，用 Gemini inline image 估算，**唔會儲存相片**。

AI 全部喺 `lib/ai/`，換 model 或 provider 只改嗰度。Route：`/api/ai/food`（驗證 Bearer token、每日上限）、`/api/push/test`、`/api/cron/reminders`（CRON_SECRET）。

## 指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發 |
| `npm run build` | Production build（含 type check） |
| `npm test` | 全部測試（calc、reminders、ai；Node >= 22.6） |

## 重要規則

- 安全限制（`lib/calc.ts`）唔好放寬：減脂赤字 ≤ TDEE 25%；calories 下限男 1500 ／ 女 1200；只供 18 歲或以上；減脂目標體重 BMI ≥ 18.5。
- 日期一律用本地日期 `YYYY-MM-DD`（`lib/date.ts`），唔用 `toISOString()`。
- 所有表開 RLS（`user_id = auth.uid()`）。前端只用 anon key，永遠唔好用 service_role key。
- 所有數字係估算，唔係醫療建議。

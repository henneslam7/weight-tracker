# 食咗飯未

記食物、體重、運動嘅 mobile-first PWA（邀請制，約 15 人以內）。兩個街坊——**陳伯**同**歡嬸**日日睇住你：提醒、鼓勵同 roast 全部集中喺 `lib/copy.ts`（對白）同 `lib/roast.ts`（食物 roast）。

- 語氣三級：溫柔／街坊（預設）／毒舌，每人自己揀（`user_prefs`）。
- 毒舌對象係藉口、拖延、做 show、年卡唔去，同你同某啲食物嘅「孽緣」。**唔鬧身形**，唔講健康恐嚇、罪惡、補償。
- 食物 roast 由 Gemini 即興寫（同食物估算同一次 call，唔多食 AI 額度）；輸出要過 `lib/safety.ts`（身形、健康恐嚇、罪惡、補償、粗口、普通話字詞），唔合格就退返 `lib/roast.ts` 嘅固定句子。例句只係「風格參考」，改 `lib/ai/roastai.ts` 入面嘅 prompt 就可以調風格。
- 敏感時刻（食得太少、減得太快、超標、隔咗幾日返嚟、65 歲或以上）自動變溫柔，唔 roast（`lib/persona.ts`）。
- 今日三樣、印花卡、街坊級數：全部由記錄計出（`lib/gamify.ts`），只獎勵「有記錄」同「休息」。
- 65 歲或以上：較保守設定（赤字 ≤ 15%、每週 ≤ 0.25 kg、蛋白質 1.2 g/kg、目標 BMI ≥ 22、運動加成減半）、長者模式、開始前要確認。數值係設計預設，唔係醫療意見。

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

## 用戶設定（語氣、食物 roast、長者模式）

Supabase SQL Editor 執行 `supabase/schema_persona.sql`。未執行之前 app 用預設值，照常運作。每人每日 AI 上限預設 20 次（`AI_DAILY_LIMIT`）。公開註冊保持關閉，用 Supabase → Authentication → Users 手動邀請。

## 運動記錄 + AI 食咩好

1. Supabase SQL Editor 執行 `supabase/schema_exercise.sql`（未建表之前，app 其他功能照常，運動當 0）
2. 「運動」tab：揀運動類型 + 時間，按 `(MET − 1) × 體重 × 小時` 估算淨消耗（`lib/exercise.ts`），或者自己輸入 kcal
3. 運動消耗加返入當日 calories 上限（碳水目標 +kcal/4）：`lib/budget.ts`。比例 `EXERCISE_CREDIT_RATIO`（預設 1）、每日上限 `EXERCISE_CREDIT_CAP`（1000）都喺 `lib/exercise.ts`
4. 「食物」tab →「AI 食咩好？」：`/api/ai/suggest` 由 server 讀你嘅 profile／體重／今日食物同運動，自己計剩餘 calories 同 macros，再叫 Gemini 建議煮食或外食。每個建議會被驗證唔超過剩餘同單餐上限；剩餘 < 150 kcal 或者已超標就唔 call AI，只回覆支持性訊息（唔建議斷食、補償式少食或額外運動）

## 指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發 |
| `npm run build` | Production build（含 type check） |
| `npm test` | 全部測試（calc、reminders、ai、install、exercise、persona、cantonese；Node >= 22.6） |

## 重要規則

- 安全限制（`lib/calc.ts`）唔好放寬：減脂赤字 ≤ TDEE 25%；calories 下限男 1500 ／ 女 1200；只供 18 歲或以上；減脂目標體重 BMI ≥ 18.5。
- 日期一律用本地日期 `YYYY-MM-DD`（`lib/date.ts`），唔用 `toISOString()`。
- 所有表開 RLS（`user_id = auth.uid()`）。前端只用 anon key，永遠唔好用 service_role key。
- 所有數字係估算，唔係醫療建議。
- 廣東話用字：`npm run test:cantonese` 會掃走普通話字詞同未證實用字，但唔可以代替母語者審稿。

# Fit AI

個人 AI 健身 web app（單一用戶、mobile-first PWA）。

**Phase 1（呢個 repo 而家）**：登入／註冊、onboarding、BMR／TDEE／calories／macros 計算機、體重記錄、7 日移動平均趨勢圖、PWA。

Stack：Next.js 15（App Router）· React 19 · Tailwind v4 · TypeScript strict · Supabase（Postgres + Auth + RLS）· Vercel。

## 起手

1. 開 Supabase project → SQL Editor 執行 `supabase/schema.sql`
2. `cp .env.example .env.local`，填入 `NEXT_PUBLIC_SUPABASE_URL` 同 `NEXT_PUBLIC_SUPABASE_ANON_KEY`（只用 anon key）
3. `npm install` → `npm run dev`
4. 註冊自己之後，喺 Supabase → Authentication → Providers → Email 關閉 sign-up
5. Vercel Import repo，加同樣兩個 env vars，部署
6. iPhone Safari → 分享 → 加入主畫面

## 指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發 |
| `npm run build` | Production build（含 type check） |
| `npm run test:calc` | 公式測試（Node >= 22.6） |

## 重要規則

- 安全限制（`lib/calc.ts`）唔好放寬：減脂赤字 ≤ TDEE 25%；calories 下限男 1500 ／ 女 1200；只供 18 歲或以上；減脂目標體重 BMI ≥ 18.5。
- 日期一律用本地日期 `YYYY-MM-DD`（`lib/date.ts`），唔用 `toISOString()`。
- 所有表開 RLS（`user_id = auth.uid()`）。前端只用 anon key，永遠唔好用 service_role key。
- 所有數字係估算，唔係醫療建議。

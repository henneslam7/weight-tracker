import { NextResponse } from "next/server";
import {
  AiError,
  canSuggest,
  MAX_PREF_CHARS,
  noSuggestNote,
  suggestMeals,
  type SuggestMode,
} from "@/lib/ai";
import { dayBudget, remaining } from "@/lib/budget";
import { computePlan } from "@/lib/calc";
import { nowInZone } from "@/lib/date";
import { sumBurned } from "@/lib/exercise";
import { isMealType, sumFood } from "@/lib/food";
import { authenticate } from "@/lib/server/auth";
import type { Profile } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEFAULT_DAILY_LIMIT = 30;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

const isMode = (v: unknown): v is SuggestMode => v === "cook" || v === "eat_out" || v === "any";

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth) return json({ error: "unauthorized", message: "請重新登入" }, 401);

  // 輸入
  let mode: SuggestMode = "any";
  let meal: string | null = null;
  let preference = "";
  try {
    const b = (await req.json()) as { mode?: unknown; meal?: unknown; preference?: unknown };
    if (isMode(b.mode)) mode = b.mode;
    meal = typeof b.meal === "string" ? b.meal : null;
    preference = typeof b.preference === "string" ? b.preference.trim() : "";
  } catch {
    return json({ error: "bad_request", message: "請求格式唔啱" }, 400);
  }
  if (!isMealType(meal)) return json({ error: "bad_request", message: "請揀邊一餐" }, 400);
  if (preference.length > MAX_PREF_CHARS) {
    return json({ error: "too_long", message: `偏好最多 ${MAX_PREF_CHARS} 個字` }, 400);
  }

  // 由 database 讀資料（用戶 token，RLS 生效）自己計剩餘，唔信 client
  const today = nowInZone().date;
  const [profileR, weightR, foodR, exerciseR] = await Promise.all([
    auth.supabase.from("profiles").select("*").maybeSingle(),
    auth.supabase.from("weight_logs").select("weight_kg").order("logged_on", { ascending: false }).limit(1),
    auth.supabase
      .from("food_logs")
      .select("calories, protein_g, carbs_g, fat_g")
      .eq("logged_on", today),
    auth.supabase.from("exercise_logs").select("calories").eq("logged_on", today),
  ]);
  if (profileR.error || weightR.error || foodR.error || exerciseR.error) {
    return json({ error: "server", message: "讀取資料失敗，請稍後再試" }, 500);
  }
  const profile = profileR.data as Profile | null;
  const weight = weightR.data?.[0]?.weight_kg as number | undefined;
  if (!profile || weight === undefined) {
    return json({ error: "no_plan", message: "請先設定個人資料並記錄體重，先計到每日目標。" }, 409);
  }
  const planR = computePlan({ profile, weightKg: weight, today });
  if (!planR.ok) return json({ error: "no_plan", message: planR.reason }, 409);

  const budget = dayBudget(planR.plan, sumBurned(exerciseR.data ?? []));
  const rem = remaining(budget, sumFood(foodR.data ?? []));

  // 剩餘太少／已超標：唔 call AI（慳錢），回覆支持性訊息，唔計入次數
  if (!canSuggest(rem.calories)) {
    return json({ suggestions: [], remaining: rem, note: noSuggestNote(rem.calories) });
  }

  // 每日 AI 次數（同食物估算共用）
  const limit = Math.max(1, Number(process.env.AI_DAILY_LIMIT) || DEFAULT_DAILY_LIMIT);
  const { data: used, error: usageErr } = await auth.supabase.rpc("increment_ai_usage", {
    p_day: today,
    p_max: limit,
  });
  if (usageErr) return json({ error: "server", message: "暫時用唔到，請稍後再試" }, 500);
  if (used === -1) {
    return json({ error: "limit", message: `今日 AI 次數用晒（上限 ${limit} 次）。`, limit }, 429);
  }

  try {
    const suggestions = await suggestMeals({ mode, meal, remaining: rem, preference });
    return json({
      suggestions,
      remaining: rem,
      note: suggestions.length === 0 ? "AI 今次冇建議到合適嘅選擇，請再試一次，或者改下偏好。" : null,
      used,
      limit,
    });
  } catch (e) {
    if (e instanceof AiError) {
      const map = {
        config: [503, "AI 未設定好，請睇設定"],
        rate: [429, "AI 服務太繁忙，等陣再試"],
        blocked: [422, "呢個要求未能處理，請改寫偏好"],
        upstream: [502, "AI 暫時用唔到，請稍後再試"],
        parse: [502, "AI 回傳格式有問題，請再試"],
        image: [400, "請求有問題"],
      } as const;
      const [status, message] = map[e.code];
      return json({ error: e.code, message }, status);
    }
    console.error("[ai] suggest unexpected error");
    return json({ error: "server", message: "暫時用唔到，請稍後再試" }, 500);
  }
}

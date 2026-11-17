import { NextResponse } from "next/server";
import { AiError } from "@/lib/ai";
import { fallbackNarrative, narrateBody } from "@/lib/ai/body";
import { buildFacts, suggestSettings, type BodyScan } from "@/lib/body";
import { computePlan } from "@/lib/calc";
import { nowInZone } from "@/lib/date";
import { authenticate } from "@/lib/server/auth";
import type { Profile } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEFAULT_DAILY_LIMIT = 20;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

const COLS =
  "id, measured_on, weight_kg, body_fat_pct, lean_kg, muscle_kg, skeletal_muscle_kg, water_pct, protein_pct, bone_kg, visceral_fat, bmr_kcal, body_age, bmi, heart_rate, source";

/**
 * 分析某次身體組成記錄。數字同設定建議全部由程式計（lib/body.ts），
 * AI 只負責寫解釋；AI 唔可用或者次數用晒，照樣回傳固定句子版本。
 */
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth) return json({ error: "unauthorized", message: "請重新登入" }, 401);

  let scanId: string | null = null;
  try {
    const b = (await req.json()) as { scanId?: unknown };
    scanId = typeof b.scanId === "string" && /^[0-9a-f-]{36}$/i.test(b.scanId) ? b.scanId : null;
  } catch {
    return json({ error: "bad_request", message: "請求格式唔啱" }, 400);
  }
  if (!scanId) return json({ error: "bad_request", message: "缺少記錄" }, 400);

  const [profileR, scansR] = await Promise.all([
    auth.supabase.from("profiles").select("*").maybeSingle(),
    auth.supabase.from("body_scans").select(COLS).order("measured_on", { ascending: false }).limit(12),
  ]);
  if (scansR.error) return json({ error: "server", message: "讀取身體組成記錄失敗（可能未執行 schema_body.sql）" }, 500);
  const profile = profileR.data as Profile | null;
  if (profileR.error || !profile) return json({ error: "no_plan", message: "請先設定個人資料。" }, 409);

  const scans = (scansR.data ?? []) as (BodyScan & { id: string })[];
  const idx = scans.findIndex((s) => s.id === scanId);
  if (idx < 0) return json({ error: "not_found", message: "搵唔到呢個記錄" }, 404);
  const scan = scans[idx];
  const prev = scans[idx + 1] ?? null; // 降序：下一個係較舊嘅
  const { date: today } = nowInZone();

  const planR = computePlan({ profile, weightKg: scan.weight_kg, today });
  const facts = buildFacts({ profile, scan, prev, today, scanCount: scans.length, appBmr: planR.ok ? planR.plan.bmr : null });
  const suggestions = suggestSettings({ profile, scan, prev, today });

  // AI 解釋：同食物估算共用每日次數；用晒／失敗就用固定句子
  let narrative = fallbackNarrative(facts);
  let note: string | null = null;
  const limit = Math.max(1, Number(process.env.AI_DAILY_LIMIT) || DEFAULT_DAILY_LIMIT);
  const { data: used, error: usageErr } = await auth.supabase.rpc("increment_ai_usage", { p_day: today, p_max: limit });
  if (usageErr) {
    note = "AI 暫時用唔到，以下係程式計出嚟嘅分析。";
  } else if (used === -1) {
    note = `今日 AI 次數用晒（上限 ${limit} 次），以下係程式計出嚟嘅分析。`;
  } else {
    try {
      narrative = await narrateBody(facts);
    } catch (e) {
      if (!(e instanceof AiError)) console.error("[ai] body-analysis unexpected error");
      note = "AI 暫時用唔到，以下係程式計出嚟嘅分析。";
    }
  }
  return json({ narrative, suggestions, facts, note });
}

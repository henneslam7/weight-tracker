import { NextResponse } from "next/server";
import { AiError, validateImage, type ImageInput } from "@/lib/ai";
import { extractScan } from "@/lib/ai/body";
import { nowInZone } from "@/lib/date";
import { authenticate } from "@/lib/server/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEFAULT_DAILY_LIMIT = 20;
const MAX_BODY_BYTES = 3_000_000;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** 由磅 app 截圖讀出身體組成數字（唔儲存截圖，唔 log 內容） */
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth) return json({ error: "unauthorized", message: "請重新登入" }, 401);

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return json({ error: "too_large", message: "截圖太大，請揀細啲嘅圖" }, 413);
  }
  let image: ImageInput;
  try {
    const body = (await req.json()) as { image?: unknown };
    image = validateImage(body.image);
  } catch {
    return json({ error: "image", message: "圖片格式或大細唔啱，請重新揀" }, 400);
  }

  const { date: today } = nowInZone();
  // 同食物估算共用每日 AI 次數
  const limit = Math.max(1, Number(process.env.AI_DAILY_LIMIT) || DEFAULT_DAILY_LIMIT);
  const { data: used, error: usageErr } = await auth.supabase.rpc("increment_ai_usage", { p_day: today, p_max: limit });
  if (usageErr) return json({ error: "server", message: "暫時用唔到，請稍後再試" }, 500);
  if (used === -1) return json({ error: "limit", message: `今日 AI 次數用晒（上限 ${limit} 次），可以手動輸入。`, limit }, 429);

  try {
    const out = await extractScan(image, today);
    if (!out.isReport) return json({ error: "not_report", message: "呢張唔似係體重磅報告，請揀有身體組成數字嘅截圖，或者手動輸入。" }, 422);
    return json({ ...out, used, limit });
  } catch (e) {
    if (e instanceof AiError) {
      const map = {
        config: [503, "AI 未設定好，請睇設定"],
        rate: [429, "AI 服務太繁忙，等陣再試"],
        blocked: [422, "呢張圖未能讀取，請揀第張或者手動輸入"],
        upstream: [502, "AI 暫時用唔到，可以手動輸入"],
        parse: [502, "AI 回傳格式有問題，請再試或手動輸入"],
        image: [400, "圖片格式或大細唔啱，請重新揀"],
      } as const;
      const [status, message] = map[e.code];
      return json({ error: e.code, message }, status);
    }
    console.error("[ai] body-scan unexpected error");
    return json({ error: "server", message: "暫時用唔到，請稍後再試" }, 500);
  }
}

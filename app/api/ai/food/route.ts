import { NextResponse } from "next/server";
import { AiError, estimateFood, MAX_INPUT_CHARS, validateImage, type ImageInput } from "@/lib/ai";
import { nowInZone } from "@/lib/date";
import { authenticate } from "@/lib/server/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEFAULT_DAILY_LIMIT = 30;
/** 相片 base64 後大約 2MB；Vercel function 上限 4.5MB */
const MAX_BODY_BYTES = 3_000_000;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  // 1. 驗證登入（RLS 會用呢個 token）
  const auth = await authenticate(req);
  if (!auth) return json({ error: "unauthorized", message: "請重新登入" }, 401);

  // 2. 驗證輸入（文字、相片，至少要有一樣）。驗證失敗唔會計入每日次數。
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return json({ error: "too_large", message: "相片太大，請揀細啲嘅相" }, 413);
  }
  let text = "";
  let image: ImageInput | undefined;
  try {
    const body = (await req.json()) as { text?: unknown; image?: unknown };
    text = typeof body.text === "string" ? body.text.trim() : "";
    if (body.image !== undefined && body.image !== null) image = validateImage(body.image);
  } catch (e) {
    if (e instanceof AiError) {
      return json({ error: e.code, message: "相片格式或大細唔啱，請重新揀" }, 400);
    }
    return json({ error: "bad_request", message: "請求格式唔啱" }, 400);
  }
  if (!text && !image) {
    return json({ error: "bad_request", message: "請輸入你食咗啲咩，或者上傳相片" }, 400);
  }
  if (text.length > MAX_INPUT_CHARS) {
    return json({ error: "too_long", message: `最多 ${MAX_INPUT_CHARS} 個字` }, 400);
  }

  // 3. 每日次數上限（database function，client 改唔到）
  const limit = Math.max(1, Number(process.env.AI_DAILY_LIMIT) || DEFAULT_DAILY_LIMIT);
  const { data: used, error: usageErr } = await auth.supabase.rpc("increment_ai_usage", {
    p_day: nowInZone().date,
    p_max: limit,
  });
  if (usageErr) {
    console.error("[ai] usage rpc failed");
    return json({ error: "server", message: "暫時用唔到，請稍後再試" }, 500);
  }
  if (used === -1) {
    return json(
      { error: "limit", message: `今日 AI 次數用晒（上限 ${limit} 次），可以手動輸入。`, limit },
      429,
    );
  }

  // 4. 估算
  try {
    const items = await estimateFood({ text, image });
    return json({ items, used, limit });
  } catch (e) {
    if (e instanceof AiError) {
      const map = {
        config: [503, "AI 未設定好，請睇設定"],
        rate: [429, "AI 服務太繁忙，等陣再試"],
        blocked: [422, "呢段文字未能估算，請改寫"],
        upstream: [502, "AI 暫時用唔到，可以手動輸入"],
        parse: [502, "AI 回傳格式有問題，請再試或手動輸入"],
        image: [400, "相片格式或大細唔啱，請重新揀"],
      } as const;
      const [status, message] = map[e.code];
      return json({ error: e.code, message }, status);
    }
    console.error("[ai] unexpected error");
    return json({ error: "server", message: "暫時用唔到，請稍後再試" }, 500);
  }
}

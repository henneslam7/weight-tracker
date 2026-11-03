// Gemini REST 呼叫。只用 fetch，冇 SDK，方便換 model / provider。
// 喺 server 用。GEMINI_API_KEY 永遠唔可以有 NEXT_PUBLIC_ 前綴。

import { AiError } from "./errors.ts";
import { SYSTEM_PROMPT, wrapUserText } from "./prompt.ts";
import { RESPONSE_SCHEMA } from "./schema.ts";

export interface GeminiConfig {
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function readConfig(env: NodeJS.ProcessEnv = process.env): GeminiConfig {
  const apiKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL;
  if (!apiKey || !model) throw new AiError("config", "AI 未設定（缺少 GEMINI_API_KEY 或 GEMINI_MODEL）");
  if (!/^[A-Za-z0-9._-]+$/.test(model)) throw new AiError("config", "GEMINI_MODEL 格式唔啱");
  return { apiKey, model };
}

export function buildRequestBody(text: string) {
  return {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: wrapUserText(text) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  };
}

function extractJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new AiError("parse", "AI 回傳唔係有效 JSON");
  }
}

interface GeminiResponse {
  promptFeedback?: { blockReason?: string };
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/** 回傳 model 嘅 JSON（未驗證）。唔會 log 用戶輸入。 */
export async function callGemini(
  cfg: GeminiConfig,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 25_000);
  let res: Response;
  try {
    res = await fetchImpl(`${BASE}/${cfg.model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
      body: JSON.stringify(buildRequestBody(text)),
      signal: controller.signal,
    });
  } catch {
    throw new AiError("upstream", "AI 連線失敗或逾時");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let reason = "";
    try {
      reason = String(((await res.json()) as { error?: { status?: string } }).error?.status ?? "");
    } catch {
      /* 忽略 */
    }
    console.error(`[ai] gemini http ${res.status} ${reason}`);
    if (res.status === 429) throw new AiError("rate", "AI 服務太繁忙");
    if ([400, 401, 403, 404].includes(res.status)) {
      throw new AiError("config", "AI 設定有問題（key 或 model 名）");
    }
    throw new AiError("upstream", "AI 服務暫時用唔到");
  }

  const json = (await res.json()) as GeminiResponse;
  if (json.promptFeedback?.blockReason) {
    throw new AiError("blocked", "呢段文字未能估算");
  }
  const out = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!out) throw new AiError("parse", "AI 冇回傳內容");
  return extractJson(out);
}

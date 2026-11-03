// Gemini REST 呼叫。只用 fetch，冇 SDK，方便換 model / provider。
// 喺 server 用。GEMINI_API_KEY 永遠唔可以有 NEXT_PUBLIC_ 前綴。

import { AiError } from "./errors.ts";
import type { EstimateInput } from "./image.ts";
import { DEFAULT_IMAGE_TEXT, IMAGE_RULES, SYSTEM_PROMPT, wrapUserText } from "./prompt.ts";
import { roastPrompt, withRoastSchema, type RoastRequest } from "./roastai.ts";
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

export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

export interface JsonRequest<S> {
  system: string;
  parts: Part[];
  schema: S;
  temperature?: number;
}

/** 組 generateContent 嘅 request body（structured JSON output） */
export function toBody<S>(req: JsonRequest<S>) {
  return {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: "user", parts: req.parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: req.schema,
      temperature: req.temperature ?? 0.2,
    },
  };
}

/** 食物估算（文字／相片）嘅 request */
export function buildRequestBody(input: string | EstimateInput, roast?: RoastRequest) {
  const { text, image } = typeof input === "string" ? { text: input, image: undefined } : input;
  const parts: Part[] = [];
  if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  parts.push({ text: wrapUserText(text.trim() || (image ? DEFAULT_IMAGE_TEXT : "")) });
  const system = (image ? SYSTEM_PROMPT + IMAGE_RULES : SYSTEM_PROMPT) + (roast ? roastPrompt(roast) : "");
  return toBody({
    system,
    parts,
    schema: roast ? withRoastSchema(RESPONSE_SCHEMA) : RESPONSE_SCHEMA,
  });
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

/**
 * 送出已組好嘅 body，回傳 model 嘅 JSON（未驗證）。
 * 唔會 log 用戶輸入或相片，只 log HTTP 狀態碼。
 */
export async function generateJson(
  cfg: GeminiConfig,
  body: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 25_000);
  let res: Response;
  try {
    res = await fetchImpl(`${BASE}/${cfg.model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
      body: JSON.stringify(body),
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

/** 食物估算：回傳 model 嘅 JSON（未驗證） */
export function callGemini(
  cfg: GeminiConfig,
  input: string | EstimateInput,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  return generateJson(cfg, buildRequestBody(input), fetchImpl);
}

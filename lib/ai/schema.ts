import { AiError } from "./errors.ts";

export type Confidence = "high" | "medium" | "low";

export interface FoodItem {
  name: string;
  quantity_text: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: Confidence;
}

export const MAX_ITEMS = 12;

/** 俾 Gemini 用嘅 response schema（structured output） */
export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          quantity_text: { type: "STRING" },
          calories: { type: "NUMBER" },
          protein_g: { type: "NUMBER" },
          carbs_g: { type: "NUMBER" },
          fat_g: { type: "NUMBER" },
          confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        },
        required: [
          "name",
          "quantity_text",
          "calories",
          "protein_g",
          "carbs_g",
          "fat_g",
          "confidence",
        ],
      },
    },
  },
  required: ["items"],
} as const;

function num(v: unknown, min: number, max: number, decimals: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const clamped = Math.min(max, Math.max(min, v));
  const f = 10 ** decimals;
  return Math.round(clamped * f) / f;
}

function str(v: unknown, maxLen: number): string {
  return typeof v === "string" ? v.trim().slice(0, maxLen) : "";
}

/**
 * 驗證 + 清理 model 回傳。唔信任 model：數字夾返合理範圍，壞咗嘅項目丟棄。
 * 回傳空陣列 = 認唔到食物（唔係錯誤）。結構完全唔啱先 throw。
 */
export function parseEstimate(raw: unknown): FoodItem[] {
  if (typeof raw !== "object" || raw === null) {
    throw new AiError("parse", "AI 回傳格式唔啱");
  }
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) throw new AiError("parse", "AI 回傳格式唔啱");

  const out: FoodItem[] = [];
  for (const it of items.slice(0, MAX_ITEMS)) {
    if (typeof it !== "object" || it === null) continue;
    const r = it as Record<string, unknown>;
    const name = str(r.name, 60);
    const calories = num(r.calories, 0, 3000, 0);
    if (!name || calories === null) continue;
    const confidence: Confidence =
      r.confidence === "high" || r.confidence === "medium" || r.confidence === "low"
        ? r.confidence
        : "low";
    out.push({
      name,
      quantity_text: str(r.quantity_text, 60),
      calories,
      protein_g: num(r.protein_g, 0, 300, 1) ?? 0,
      carbs_g: num(r.carbs_g, 0, 500, 1) ?? 0,
      fat_g: num(r.fat_g, 0, 300, 1) ?? 0,
      confidence,
    });
  }
  return out;
}

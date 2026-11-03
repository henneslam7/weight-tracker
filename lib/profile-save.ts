// 儲存 profile 嘅輔助（純函數）：新欄位未建立（未跑 schema_tdee.sql）時，後備只儲存舊欄位。

import type { ActivityLevel, FixedPaceLike, Pace, Profile, StepsRange } from "./types.ts";

/** 舊 schema 已有嘅欄位 */
export const LEGACY_KEYS = [
  "sex",
  "birth_date",
  "height_cm",
  "activity_level",
  "goal",
  "target_weight_kg",
  "weekly_rate_kg",
] as const;

/** PostgREST／Postgres 話欄位唔存在 */
export function isMissingColumn(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "PGRST204" || err.code === "42703") return true;
  return /could not find the '.*' column|column .* does not exist/i.test(err.message ?? "");
}

/** 檔位 → 舊版每週速度（kg）。custom 冇對應，用標準 */
export function rateFromPace(p: Pace | null | undefined): number {
  const m: Record<FixedPaceLike, number> = { gentle: 0.25, standard: 0.5, faster: 0.75 };
  return p && p !== "custom" ? m[p] : 0.5;
}

/** 步數範圍 → 最接近嘅舊活動級別（只用嚟維持舊欄位合理，新計算唔靠佢） */
export function legacyLevelFromSteps(r: StepsRange | null | undefined): ActivityLevel {
  switch (r) {
    case "lt3000":
    case "3000_4999":
      return "sedentary";
    case "5000_6999":
      return "light";
    case "7000_9999":
      return "moderate";
    case "gte10000":
      return "active";
    default:
      return "light";
  }
}

/** 抽出舊欄位 */
export function legacyRow(p: Profile): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of LEGACY_KEYS) out[k] = (p as unknown as Record<string, unknown>)[k] ?? null;
  return out;
}

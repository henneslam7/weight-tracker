// 體重趨勢校準（P2，純函數，只提供「建議」，唔會自動改動計劃）。
// 觀察 TDEE ≈ 平均每日攝取 − 每日體重變化 × 7700。
// ⚠ 食物記錄通常漏記、體重受水分影響，所以：要夠多資料先出結果；建議值只向觀察值移一半，
//   而且與公式估算相差超過 ±15% 時，只當「提示」，唔當結論。

import { weeklyTrendKg, KCAL_PER_KG } from "./calc.ts";
import type { WeightLog } from "./types.ts";

export interface IntakeDay {
  date: string;
  kcal: number;
}

export const CALIBRATION = {
  lookbackDays: 21,
  minSpanDays: 14,
  minIntakeDays: 12,
  minWeights: 6,
  /** 食物記錄好少過 800 kcal/日 → 當漏記，唔用 */
  minPlausibleDailyKcal: 800,
  maxShift: 0.15,
} as const;

export type CalibrationResult =
  | { status: "insufficient_data"; reason: string }
  | {
      status: "ok";
      observedTdee: number;
      /** 向觀察值移一半，並夾喺公式值 ±15% 內 */
      suggestedTdee: number;
      /** 觀察值同公式值差距超過 ±15% */
      outOfRange: boolean;
      avgIntake: number;
      weeklyTrendKg: number;
    };

export function calibrateTdee(args: {
  formulaTdee: number;
  weights: WeightLog[];
  intake: IntakeDay[];
}): CalibrationResult {
  const { formulaTdee, weights, intake } = args;
  const w = weights.filter((l) => Number.isFinite(l.weight_kg));
  if (w.length < CALIBRATION.minWeights) return { status: "insufficient_data", reason: "體重記錄唔夠（最少 6 次）。" };
  const trend = weeklyTrendKg(w, CALIBRATION.lookbackDays, CALIBRATION.minSpanDays);
  if (trend === null) return { status: "insufficient_data", reason: "體重記錄跨度唔夠（最少 14 日）。" };

  const latest = [...w].sort((a, b) => a.logged_on.localeCompare(b.logged_on)).at(-1)!.logged_on;
  const earliest = new Date(latest + "T00:00:00Z").getTime() - (CALIBRATION.lookbackDays - 1) * 86_400_000;
  const days = new Map<string, number>();
  for (const d of intake) {
    if (!(d.kcal >= CALIBRATION.minPlausibleDailyKcal)) continue;
    const t = new Date(d.date + "T00:00:00Z").getTime();
    if (t < earliest || d.date > latest) continue;
    days.set(d.date, d.kcal);
  }
  if (days.size < CALIBRATION.minIntakeDays) return { status: "insufficient_data", reason: "食物記錄唔夠（最少 12 日）。" };

  const avgIntake = [...days.values()].reduce((a, b) => a + b, 0) / days.size;
  const observedTdee = avgIntake - (trend * KCAL_PER_KG) / 7;
  const lo = formulaTdee * (1 - CALIBRATION.maxShift);
  const hi = formulaTdee * (1 + CALIBRATION.maxShift);
  const suggested = Math.min(hi, Math.max(lo, (formulaTdee + observedTdee) / 2));
  return {
    status: "ok",
    observedTdee: Math.round(observedTdee),
    suggestedTdee: Math.round(suggested),
    outOfRange: observedTdee < lo || observedTdee > hi,
    avgIntake: Math.round(avgIntake),
    weeklyTrendKg: trend,
  };
}

// 幾時到目標體重。純函數。
//
// 只係「估算」，唔係承諾（需求 §2 P1）：
//   - 靜態：剩餘 kg × 7,700 ÷ 每日赤字（最樂觀，假設消耗唔變）
//   - 動態：體重愈低，每日消耗都跌（約每公斤 22 kcal，產品假設，參考動態能量平衡概念，非 NIDDK Body Weight Planner 本身），所以愈減愈慢
//   - 近期趨勢：最近 2 星期實際速度
// 所以顯示「範圍」同約數月份，唔顯示確實日期。

import { addDays } from "./date.ts";
import { KCAL_PER_KG } from "./calc.ts";
import type { Goal } from "./types.ts";

export type EtaState =
  | "no_target" //       維持／體態重組／冇目標體重
  | "reached" //         已達標
  | "need_data" //       未有趨勢（仍有按計劃嘅估算）
  | "flat" //            趨勢企穩
  | "wrong_direction" // 趨勢同目標相反
  | "too_far" //         推算超過 2 年
  | "ok";

export interface Eta {
  state: EtaState;
  remainingKg: number;
  /** 按近期趨勢 */
  trendWeeks: number | null;
  /** 按今日目標：靜態（最快）同動態（較慢）；動態 null = 消耗追近攝取，目標前會停滯 */
  planStaticWeeks: number | null;
  planDynamicWeeks: number | null;
  plateau: boolean;
  fast: boolean;
}

export const ETA_MAX_WEEKS = 104;
/** 每減／加 1 kg，每日消耗跟住跌／升多少 kcal（產品假設，待校準） */
export const TDEE_KCAL_PER_KG = 22;
const FLAT_KG_PER_WEEK = 0.05;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** 動態模型：逐日模擬。回傳到達目標嘅星期數；永遠到唔到（消耗追近攝取）回傳 null */
export function simulateWeeks(a: {
  weightKg: number;
  targetKg: number;
  tdee: number;
  intakeKcal: number;
  maxDays?: number;
  kcalPerKg?: number;
}): number | null {
  const dir = a.targetKg < a.weightKg ? -1 : 1;
  const k = a.kcalPerKg ?? TDEE_KCAL_PER_KG;
  const max = a.maxDays ?? ETA_MAX_WEEKS * 7;
  let w = a.weightKg;
  for (let day = 1; day <= max; day++) {
    const tdeeNow = a.tdee + k * (w - a.weightKg);
    const net = a.intakeKcal - tdeeNow; // 負 = 赤字
    if (dir * net <= 0) return null; // 唔再向目標行（減脂 net 要 < 0；增肌 net 要 > 0）
    w += net / KCAL_PER_KG;
    if ((dir < 0 && w <= a.targetKg) || (dir > 0 && w >= a.targetKg)) return day / 7;
  }
  return null;
}

export function etaToTarget(a: {
  goal: Goal;
  weightKg: number;
  targetKg: number | null;
  trendKgPerWeek: number | null;
  /** 今日估算 TDEE 同目標攝取（用嚟計按計劃嘅靜態／動態估算） */
  tdee: number | null;
  intakeKcal: number | null;
  today: string;
}): Eta {
  const none = { trendWeeks: null, planStaticWeeks: null, planDynamicWeeks: null, plateau: false, fast: false };
  if ((a.goal !== "lose" && a.goal !== "gain") || a.targetKg === null) return { state: "no_target", remainingKg: 0, ...none };
  const dir = a.goal === "lose" ? -1 : 1;
  const remaining = (a.targetKg - a.weightKg) * dir;
  if (remaining <= 0) return { state: "reached", remainingKg: 0, ...none };
  const remainingKg = r1(remaining);

  // 按計劃
  let planStaticWeeks: number | null = null;
  let planDynamicWeeks: number | null = null;
  let plateau = false;
  if (a.tdee !== null && a.intakeKcal !== null && a.tdee > 0 && a.intakeKcal > 0) {
    const daily = (a.tdee - a.intakeKcal) * -dir; // 正數 = 向目標
    if (daily > 0) {
      const s = (remaining * KCAL_PER_KG) / daily / 7;
      planStaticWeeks = s <= ETA_MAX_WEEKS ? Math.max(1, Math.round(s)) : null;
      const d = simulateWeeks({ weightKg: a.weightKg, targetKg: a.targetKg, tdee: a.tdee, intakeKcal: a.intakeKcal });
      if (d === null) plateau = true;
      else planDynamicWeeks = Math.max(planStaticWeeks ?? 1, Math.round(d));
    }
  }
  const plan = { planStaticWeeks, planDynamicWeeks, plateau };

  if (a.trendKgPerWeek === null) return { state: "need_data", remainingKg, trendWeeks: null, fast: false, ...plan };
  const speed = a.trendKgPerWeek * dir;
  if (Math.abs(a.trendKgPerWeek) < FLAT_KG_PER_WEEK) return { state: "flat", remainingKg, trendWeeks: null, fast: false, ...plan };
  if (speed < 0) return { state: "wrong_direction", remainingKg, trendWeeks: null, fast: false, ...plan };

  const w = remaining / speed;
  const fast = a.goal === "lose" && speed > 1;
  if (w > ETA_MAX_WEEKS) return { state: "too_far", remainingKg, trendWeeks: null, fast, ...plan };
  return { state: "ok", remainingKg, trendWeeks: Math.max(1, Math.round(w)), fast, ...plan };
}

/** 約數月份：同一年只寫「1–2 月」，跨年加年份。唔顯示確實日子（估算冇咁準）。 */
export function monthRangeText(today: string, w1: number, w2: number): string {
  const [a, b] = [addDays(today, Math.round(w1 * 7)), addDays(today, Math.round(w2 * 7))].sort();
  const [y1, m1] = a.split("-").map(Number);
  const [y2, m2] = b.split("-").map(Number);
  const cy = Number(today.slice(0, 4));
  const yp = (y: number) => (y === cy ? "" : `${y} 年 `);
  if (y1 === y2 && m1 === m2) return `${yp(y1)}${m1} 月`;
  if (y1 === y2) return `${yp(y1)}${m1}–${m2} 月`;
  return `${y1} 年 ${m1} 月–${y2} 年 ${m2} 月`;
}

export function weeksText(weeks: number): string {
  if (weeks < 8) return `${weeks} 星期`;
  const months = Math.round((weeks / 4.345) * 10) / 10;
  return `${weeks} 星期（約 ${months} 個月）`;
}

const rangeWeeks = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);

/** 解釋文字（Calculator／今日頁共用） */
export function etaLines(e: Eta, today: string): string[] {
  if (e.state === "no_target") return [];
  if (e.state === "reached") return ["已經達到目標體重，繼續保持。"];

  const out: string[] = [];
  if (e.planStaticWeeks !== null) {
    const hi = e.planDynamicWeeks ?? e.planStaticWeeks;
    out.push(
      `按今日目標熱量，距離目標仲有 ${e.remainingKg} kg，大約 ${rangeWeeks(e.planStaticWeeks, hi)} 星期（約 ${monthRangeText(today, e.planStaticWeeks, hi)}）。體重愈低，消耗都會跟住跌，所以愈減愈慢。`,
    );
  } else if (e.plateau) {
    out.push("按今日目標熱量，消耗會隨體重下降而追近攝取，可能喺到達目標前就停滯；到時要再調整目標熱量。");
  }
  switch (e.state) {
    case "need_data":
      out.push("再記多幾日體重（跨度最少 5 日），就可以對照最近嘅實際速度。");
      break;
    case "flat":
      out.push("而家體重趨勢大致企穩，未能按趨勢推算。繼續記錄，睇下 1–2 星期。");
      break;
    case "wrong_direction":
      out.push("而家趨勢同目標方向相反，所以未能按趨勢推算。短期浮動好正常，睇多一兩個星期。");
      break;
    case "too_far":
      out.push("按最近趨勢要超過 2 年，推算唔可靠。可以檢查飲食記錄同每日目標。");
      break;
    case "ok":
      out.push(`按近 2 星期實際趨勢，大約 ${e.trendWeeks} 星期（約 ${monthRangeText(today, e.trendWeeks!, e.trendWeeks!)}）。`);
      if (e.fast) out.push("你近期減得比建議快，唔好再加快；食夠同瞓夠先係正經。");
      break;
  }
  out.push("只係估算，唔係承諾：水分、睡眠、經期同記錄誤差都會令數字浮動，要睇 2–3 星期趨勢。");
  return out;
}

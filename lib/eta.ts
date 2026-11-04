// 按體重趨勢推算幾耐到目標體重。純函數。
// 只係粗略估計：真實減重通常會愈來愈慢，而且一兩個星期嘅趨勢好易受水分影響。

import { addDays } from "./date.ts";
import type { Goal } from "./types.ts";

export type EtaState =
  | "no_target" //     維持／體態重組／冇目標體重
  | "reached" //       已達標
  | "need_data" //     記錄唔夠，未有趨勢
  | "flat" //          趨勢企穩（變化太細）
  | "wrong_direction" // 趨勢同目標相反
  | "too_far" //       推算超過 2 年，唔可信
  | "ok";

export interface Eta {
  state: EtaState;
  remainingKg: number;
  /** 按近期趨勢 */
  weeks: number | null;
  date: string | null;
  /** 按計劃速度（對照用） */
  planWeeks: number | null;
  planDate: string | null;
  /** 趨勢快過 1 kg／週（減脂） */
  fast: boolean;
}

export const ETA_MAX_WEEKS = 104;
const FLAT_KG_PER_WEEK = 0.05;

const r1 = (n: number) => Math.round(n * 10) / 10;

export function etaToTarget(a: {
  goal: Goal;
  weightKg: number;
  targetKg: number | null;
  trendKgPerWeek: number | null;
  /** 計劃每週變化（Plan.weeklyRateKg，負數 = 減） */
  planKgPerWeek: number | null;
  today: string;
}): Eta {
  const base = { weeks: null, date: null, planWeeks: null, planDate: null, fast: false };
  if ((a.goal !== "lose" && a.goal !== "gain") || a.targetKg === null) {
    return { state: "no_target", remainingKg: 0, ...base };
  }
  const dir = a.goal === "lose" ? -1 : 1;
  const remaining = (a.targetKg - a.weightKg) * dir; // 正數 = 仲未到
  if (remaining <= 0) return { state: "reached", remainingKg: 0, ...base };
  const remainingKg = r1(remaining);

  const plan = a.planKgPerWeek !== null && a.planKgPerWeek * dir > 0 ? remaining / Math.abs(a.planKgPerWeek) : null;
  const planWeeks = plan !== null && plan <= ETA_MAX_WEEKS ? Math.max(1, Math.round(plan)) : null;
  const planDate = planWeeks !== null ? addDays(a.today, planWeeks * 7) : null;
  const withPlan = { planWeeks, planDate };

  if (a.trendKgPerWeek === null) return { state: "need_data", remainingKg, weeks: null, date: null, fast: false, ...withPlan };
  const speed = a.trendKgPerWeek * dir; // 正數 = 向目標
  if (Math.abs(a.trendKgPerWeek) < FLAT_KG_PER_WEEK) return { state: "flat", remainingKg, weeks: null, date: null, fast: false, ...withPlan };
  if (speed < 0) return { state: "wrong_direction", remainingKg, weeks: null, date: null, fast: false, ...withPlan };

  const w = remaining / speed;
  const fast = a.goal === "lose" && speed > 1;
  if (w > ETA_MAX_WEEKS) return { state: "too_far", remainingKg, weeks: null, date: null, fast, ...withPlan };
  const weeks = Math.max(1, Math.round(w));
  return { state: "ok", remainingKg, weeks, date: addDays(a.today, weeks * 7), fast, ...withPlan };
}

/** 顯示用日期：同一年只寫 M月D日，跨年加年份 */
export function etaDateText(date: string, today: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return y === Number(today.slice(0, 4)) ? `${m}月${d}日` : `${y}年${m}月${d}日`;
}

export function weeksText(weeks: number): string {
  if (weeks < 8) return `${weeks} 星期`;
  const months = Math.round((weeks / 4.345) * 10) / 10;
  return `${weeks} 星期（約 ${months} 個月）`;
}

/** 解釋文字（Calculator／今日頁共用） */
export function etaLines(e: Eta, today: string): string[] {
  switch (e.state) {
    case "no_target":
      return [];
    case "reached":
      return ["已經達到目標體重，繼續保持。"];
    case "need_data":
      return ["再記多幾日體重（跨度最少 5 日），就可以按趨勢推算幾時到目標。"];
    case "flat":
      return ["而家體重趨勢大致企穩，未能推算幾時到目標。繼續記錄，睇下 1–2 星期。"];
    case "wrong_direction":
      return ["而家趨勢同目標方向相反，所以未能推算。短期浮動好正常，睇多一兩個星期。"];
    case "too_far":
      return ["按而家趨勢要超過 2 年，推算唔可靠。可以檢查飲食記錄同每日目標。"];
    case "ok": {
      const out = [
        `按近 2 星期趨勢，距離目標仲有 ${e.remainingKg} kg，大約 ${weeksText(e.weeks!)}，即 ${etaDateText(e.date!, today)} 前後。`,
      ];
      if (e.planWeeks !== null && e.planDate !== null && Math.abs(e.planWeeks - e.weeks!) >= 2) {
        out.push(`按每日目標嘅計劃速度，大約 ${weeksText(e.planWeeks)}（${etaDateText(e.planDate, today)}）。`);
      }
      if (e.fast) out.push("你近期減得比建議快，唔好再加快；食夠同瞓夠先係正經。");
      out.push("只係粗略推算：愈接近目標通常愈慢，水分亦會令數字浮動。");
      return out;
    }
  }
}

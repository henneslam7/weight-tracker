// 體重趨勢校準（需求 §7）。純函數；只產生「建議」，由用戶確認先會套用。
//
// 方法（產品啟發式，唔係臨床處方）：
//   - 用最近兩個「唔重疊嘅 7 日窗口」嘅平均體重比較（唔係單日），每個窗口至少 4 次磅重。
//   - 窗口內偏離中位數 > 1 kg 嘅單日當異常（水分、鹽分、排便…）排除。
//   - 14 日內最少 10 日有「完整記錄」（三餐齊）而且 ≥ 800 kcal，先可以由攝取反推 TDEE。
//   - 觀察 TDEE ＝ 平均攝取 − 每日體重變化 × 7,700。
//   - 調整係逐步嘅：每次最多 ±150 kcal，累計最多 ±300；兩次校準至少相隔 14 日。
// 食物記錄經常漏記，所以資料唔夠就老實講「無法可靠推算」，唔假精確。

import { diffDays, addDays } from "./date.ts";
import { KCAL_PER_KG, MAX_TDEE_ADJUST } from "./calc.ts";
import type { CalibrationStatus, WeightLog } from "./types.ts";

export interface IntakeDay {
  date: string;
  kcal: number;
  /** 當日記錄完整（早午晚三餐齊）；唔完整嘅日子唔用嚟反推 TDEE */
  complete: boolean;
}

export const CALIBRATION = {
  windowDays: 7,
  minWeighInsPerWindow: 4,
  /** 14 日入面最少幾多日完整食物記錄 */
  minCompleteIntakeDays: 10,
  /** 單日偏離窗口中位數多過呢個 kg 當異常 */
  outlierKg: 1.0,
  minPlausibleDailyKcal: 800,
  /** 差距細過呢個就唔調 */
  deadbandKcal: 75,
  maxStepKcal: 150,
  stepRounding: 25,
  /** 兩次校準最少相隔日數 */
  minDaysBetween: 14,
  /** 兩個窗口平均每週變化超過呢個 kg，當資料有問題（唔調） */
  implausibleWeeklyKg: 1.5,
} as const;

export type InsufficientReason = "weights_few" | "intake_incomplete" | "too_soon" | "implausible";

export type CalibrationResult =
  | { status: "insufficient_data"; reason: InsufficientReason; message: string }
  | {
      status: "ok";
      /** 由體重趨勢同攝取反推嘅每日消耗 */
      observedTdee: number;
      /** 今次建議加減幾多 kcal（已封頂、已取整；0 = 唔使調） */
      stepKcal: number;
      /** 套用後累計調整 */
      newAdjustKcal: number;
      avgWeightOld: number;
      avgWeightNew: number;
      weeklyChangeKg: number;
      avgIntake: number;
      outliersExcluded: number;
      message: string;
    };

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** 窗口平均（排除異常日）。唔夠 4 次回傳 null */
function windowAvg(w: WeightLog[]): { avg: number; used: number; excluded: number } | null {
  if (w.length < CALIBRATION.minWeighInsPerWindow) return null;
  const med = median(w.map((l) => l.weight_kg));
  const kept = w.filter((l) => Math.abs(l.weight_kg - med) <= CALIBRATION.outlierKg);
  if (kept.length < CALIBRATION.minWeighInsPerWindow) return null;
  return { avg: avg(kept.map((l) => l.weight_kg)), used: kept.length, excluded: w.length - kept.length };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** 每日有一次磅重就夠；同一日多次取最後一個 */
function perDay(weights: WeightLog[]): WeightLog[] {
  const m = new Map<string, WeightLog>();
  for (const l of [...weights].sort((a, b) => a.logged_on.localeCompare(b.logged_on))) m.set(l.logged_on, l);
  return [...m.values()].filter((l) => Number.isFinite(l.weight_kg));
}

export function calibrateTdee(a: {
  /** 而家用緊嘅 TDEE（公式估算 ＋ 已套用嘅調整） */
  currentTdee: number;
  currentAdjustKcal: number;
  weights: WeightLog[];
  intake: IntakeDay[];
  today: string;
  lastCalibratedAt?: string | null;
}): CalibrationResult {
  const w = perDay(a.weights);
  if (!w.length) return { status: "insufficient_data", reason: "weights_few", message: "未有體重記錄。" };
  const latest = w[w.length - 1].logged_on;

  if (a.lastCalibratedAt) {
    const since = diffDays(a.lastCalibratedAt.slice(0, 10), a.today);
    if (since < CALIBRATION.minDaysBetween) {
      return { status: "insufficient_data", reason: "too_soon", message: `上次校準喺 ${since} 日前。每 2–3 星期校準一次就夠，唔好太密。` };
    }
  }

  const inRange = (from: string, to: string) => w.filter((l) => l.logged_on >= from && l.logged_on <= to);
  const newWin = inRange(addDays(latest, -6), latest);
  const oldWin = inRange(addDays(latest, -13), addDays(latest, -7));
  const nw = windowAvg(newWin);
  const ow = windowAvg(oldWin);
  if (!nw || !ow) {
    return {
      status: "insufficient_data",
      reason: "weights_few",
      message: "每個 7 日窗口最少要 4 次體重記錄（連續 14 日），先可以按趨勢校準。",
    };
  }

  const from14 = addDays(latest, -13);
  const days = new Map<string, number>();
  for (const d of a.intake) {
    if (!d.complete || !(d.kcal >= CALIBRATION.minPlausibleDailyKcal)) continue;
    if (d.date < from14 || d.date > latest) continue;
    days.set(d.date, d.kcal);
  }
  if (days.size < CALIBRATION.minCompleteIntakeDays) {
    return {
      status: "insufficient_data",
      reason: "intake_incomplete",
      message: `14 日入面只有 ${days.size} 日有完整食物記錄（最少 ${CALIBRATION.minCompleteIntakeDays} 日），無法可靠反推 TDEE。體重趨勢已經有，但要記齊三餐先可以校準。`,
    };
  }

  const weeklyChangeKg = nw.avg - ow.avg; // 兩個窗口中心相隔 7 日
  if (Math.abs(weeklyChangeKg) > CALIBRATION.implausibleWeeklyKg) {
    return {
      status: "insufficient_data",
      reason: "implausible",
      message: "兩個星期嘅體重差距太大，可能係水分、鹽分、出差或記錄錯誤，暫時唔校準。",
    };
  }

  const avgIntake = avg([...days.values()]);
  const observedTdee = avgIntake - (weeklyChangeKg * KCAL_PER_KG) / 7;
  const diff = observedTdee - a.currentTdee;
  // 向觀察值行一半，封頂 ±150，取整；細差距唔調
  let step = 0;
  if (Math.abs(diff) >= CALIBRATION.deadbandKcal) {
    step = clamp(Math.round((diff / 2) / CALIBRATION.stepRounding) * CALIBRATION.stepRounding, -CALIBRATION.maxStepKcal, CALIBRATION.maxStepKcal);
  }
  const newAdjust = clamp(a.currentAdjustKcal + step, -MAX_TDEE_ADJUST, MAX_TDEE_ADJUST);
  step = newAdjust - a.currentAdjustKcal;

  return {
    status: "ok",
    observedTdee: Math.round(observedTdee),
    stepKcal: step,
    newAdjustKcal: newAdjust,
    avgWeightOld: Math.round(ow.avg * 10) / 10,
    avgWeightNew: Math.round(nw.avg * 10) / 10,
    weeklyChangeKg: Math.round(weeklyChangeKg * 100) / 100,
    avgIntake: Math.round(avgIntake),
    outliersExcluded: nw.excluded + ow.excluded,
    message:
      step === 0
        ? "按近 2 個星期嘅體重同食物記錄，而家嘅估算同實際差唔多，唔使調整。"
        : `按近 2 個星期嘅體重同食物記錄，建議將每日消耗估算${step > 0 ? "加" : "減"} ${Math.abs(step)} kcal（逐步調整，唔會一次過大改）。`,
  };
}

/** 體重／食物記錄概況 → 畀 computePlan 決定「已有體重趨勢」 */
export function weightSignals(weights: WeightLog[], today: string): { weightSpanDays: number; weightCount: number } {
  const w = perDay(weights).filter((l) => l.logged_on <= today);
  if (w.length < 2) return { weightSpanDays: 0, weightCount: w.length };
  return { weightSpanDays: diffDays(w[0].logged_on, w[w.length - 1].logged_on), weightCount: w.length };
}

export const STATUS_TEXT: Record<CalibrationStatus, { label: string; note: string }> = {
  uncalibrated: { label: "未校準", note: "初步估算，尚未用體重趨勢驗證" },
  trend_only: { label: "已有體重趨勢", note: "已有體重趨勢，仍需更完整攝取資料" },
  initially_calibrated: { label: "已初步校準", note: "已按近期紀錄作初步校準，仍存在誤差" },
};

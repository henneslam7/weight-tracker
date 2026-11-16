// 印花同放縱日（cheat day）。純函數。
//
// 蓋章條件：當日「今日三樣」做晒 ＋ 當日食量 ≤ 當日上限（基本目標 ＋ 運動加成）。
// 今日未過完，所以只顯示「暫定」；由第二日起先正式計。
// 每集齊 7 個印花 → 自動賺 1 張「放縱日券」，儲入庫存：冇數量上限、冇期限，幾時用都得。
// 用券：今日用，或者揀任何將來嘅日子預約（預約咗而仲未到，可以取消，券退返庫存）。
// 放縱日當日唔計印花（係獎勵日）。
//
// 放縱日上限：減脂／體態重組 = 基本目標 ＋ 最多 400 kcal，而且唔會高過維持量（TDEE），
// 即係頂多當日冇赤字，唔會變盈餘，一個星期少咗一日赤字，唔會影響減重太多。
// 其他目標 ＋300 kcal。（產品假設，待營養專業審核）

import { dayBudget } from "./budget.ts";
import type { Plan } from "./calc.ts";
import { addDays } from "./date.ts";
import { dayLogFor, tasksFor, type History } from "./gamify.ts";

export const STAMPS_FOR_CHEAT = 7;
/** 未換券嘅印花最多追溯幾多日（同 app 載入嘅記錄範圍一致）。換咗嘅券係永久儲起，冇期限 */
export const STAMP_WINDOW_DAYS = 120;
export const CHEAT_EXTRA_CAP = 400;
export const CHEAT_EXTRA_FLAT = 300;

/** 放縱日加幾多 kcal */
export function cheatExtraKcal(plan: Plan): number {
  if (plan.goal === "lose" || plan.goal === "recomp") {
    return Math.max(0, Math.min(CHEAT_EXTRA_CAP, plan.tdee - plan.targetCalories));
  }
  return CHEAT_EXTRA_FLAT;
}

/** 放縱日嘅計劃：基本目標加額外 kcal（額外嘅撥入碳水，同運動加成一樣） */
export function applyCheat(plan: Plan, extra: number): Plan {
  if (extra <= 0) return { ...plan, cheatExtraKcal: 0 };
  return {
    ...plan,
    targetCalories: plan.targetCalories + extra,
    macros: { ...plan.macros, carbsG: plan.macros.carbsG + Math.round(extra / 4) },
    cheatExtraKcal: extra,
  };
}

/**
 * 一張放縱日券（資料庫一行）：
 *  - cheat_on = null → 已賺到、儲起咗（冇限期，幾時用都得）
 *  - cheat_on = 日期 → 已經揀咗嗰日用（今日或將來；將來嘅可以取消，券退返庫存）
 */
export interface CheatRow {
  id?: string;
  cheat_on: string | null;
  /** 呢張券用咗嘅印花去到邊一日（包括）；用嚟防止同一批印花重複換券 */
  stamps_through: string | null;
}

/** 某日係咪夠資格蓋章（plan 要係基本計劃，唔係放縱日版本） */
export function dayQualifies(h: History, date: string, plan: Plan): boolean {
  if (!tasksFor(dayLogFor(h, date)).done) return false;
  const eaten = h.kcalByDate?.get(date);
  if (eaten === undefined) return false;
  return eaten <= dayBudget(plan, h.burnedByDate?.get(date) ?? 0).calories;
}

export interface TodayStamp {
  tasksDone: boolean;
  withinBudget: boolean;
  /** 而家嘅情況夠唔夠蓋章（夜晚過咗先正式計）*/
  onTrack: boolean;
  eaten: number;
  budget: number;
}

export interface StampState {
  /** 尚未換券嘅確認印花日（到尋日為止，未計今日） */
  stampDays: string[];
  /** 呢張卡而家有幾多個（0–6）：每集齊 7 個自動換 1 張放縱日券 */
  progress: number;
  /** 要新增嘅券：每張記低「用咗嘅印花去到邊日」（第 7、14… 個印花日）。App 會自動寫入資料庫 */
  toMint: string[];
  /** 庫存：已儲起、未用嘅券（資料庫入面） */
  banked: CheatRow[];
  /** 可以用嘅券總數 ＝ 庫存 ＋ 等緊寫入嘅新券 */
  credits: number;
  /** 已揀日子、仲未到（> 今日）嘅券，按日期排 */
  scheduled: CheatRow[];
  /** 已經用過（包括今日）幾多次 */
  used: number;
  today: TodayStamp;
  cheatToday: boolean;
  /** 最近一個預約日（> 今日） */
  cheatUpcoming: string | null;
  /** 歷來（近 120 日）確認印花總數，用嚟計街坊級數 */
  lifetime: number;
}

export function stampState(a: { history: History; plan: Plan; today: string; rows: readonly CheatRow[] }): StampState {
  const { history: h, plan, today, rows } = a;
  const cheatDates = new Set(rows.map((r) => r.cheat_on).filter((d): d is string => !!d));
  const yesterday = addDays(today, -1);

  // 已經換過券嘅印花唔再計（庫存券、已用券都算）
  const through = rows.map((r) => r.stamps_through).filter((d): d is string => !!d).sort().at(-1) ?? null;
  const windowStart = addDays(today, -STAMP_WINDOW_DAYS);
  const from = through && addDays(through, 1) > windowStart ? addDays(through, 1) : windowStart;

  const days = (start: string): string[] => {
    const out: string[] = [];
    for (let d = start; d <= yesterday; d = addDays(d, 1)) {
      if (!cheatDates.has(d) && dayQualifies(h, d, plan)) out.push(d);
    }
    return out;
  };

  const stampDays = days(from);
  const toMint: string[] = [];
  for (let i = STAMPS_FOR_CHEAT - 1; i < stampDays.length; i += STAMPS_FOR_CHEAT) toMint.push(stampDays[i]);

  const banked = rows.filter((r) => r.cheat_on === null);
  const scheduled = rows.filter((r): r is CheatRow & { cheat_on: string } => !!r.cheat_on && r.cheat_on > today).sort((x, y) => x.cheat_on.localeCompare(y.cheat_on));
  const t = tasksFor(dayLogFor(h, today)).done;
  const eaten = h.kcalByDate?.get(today) ?? 0;
  const budget = dayBudget(plan, h.burnedByDate?.get(today) ?? 0).calories;
  const within = eaten <= budget;

  return {
    stampDays,
    progress: stampDays.length % STAMPS_FOR_CHEAT,
    toMint,
    banked,
    credits: banked.length + toMint.length,
    scheduled,
    used: rows.filter((r) => !!r.cheat_on && r.cheat_on <= today).length,
    today: { tasksDone: t, withinBudget: within, onTrack: t && within && !cheatDates.has(today), eaten, budget },
    cheatToday: cheatDates.has(today),
    cheatUpcoming: scheduled[0]?.cheat_on ?? null,
    lifetime: days(addDays(today, -STAMP_WINDOW_DAYS)).length,
  };
}

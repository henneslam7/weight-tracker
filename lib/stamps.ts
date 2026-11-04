// 印花同放縱日（cheat day）。純函數。
//
// 蓋章條件：當日「今日三樣」做晒 ＋ 當日食量 ≤ 當日上限（基本目標 ＋ 運動加成）。
// 今日未過完，所以只顯示「暫定」；由第二日起先正式計。
// 集齊 7 個印花 → 可以領一個放縱日（今日或聽日用）。領咗之後，用咗嗰 7 個，多出嚟嘅照計落去。
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
/** 未用嘅印花最多追溯幾多日 */
export const STAMP_WINDOW_DAYS = 60;
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

export interface CheatRow {
  /** 放縱日嗰日 */
  cheat_on: string;
  /** 用咗嘅印花去到邊一日（包括） */
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
  /** 而家呢張卡已確認嘅印花日（到尋日為止，未計今日） */
  stampDays: string[];
  count: number;
  canRedeem: boolean;
  /** 領取時要記低：用咗嘅印花去到邊日 */
  stampsThrough: string | null;
  today: TodayStamp;
  cheatToday: boolean;
  /** 已領、日後先用嘅放縱日（最近一個） */
  cheatUpcoming: string | null;
  /** 已領過幾多次 */
  redeemed: number;
  /** 歷來（近 120 日）確認印花總數，用嚟計街坊級數 */
  lifetime: number;
}

export function stampState(a: { history: History; plan: Plan; today: string; rows: readonly CheatRow[] }): StampState {
  const { history: h, plan, today, rows } = a;
  const cheatDates = new Set(rows.map((r) => r.cheat_on));
  const yesterday = addDays(today, -1);

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
  const canRedeem = stampDays.length >= STAMPS_FOR_CHEAT;
  const t = tasksFor(dayLogFor(h, today)).done;
  const eaten = h.kcalByDate?.get(today) ?? 0;
  const budget = dayBudget(plan, h.burnedByDate?.get(today) ?? 0).calories;
  const within = eaten <= budget;
  const upcoming = [...cheatDates].filter((d) => d > today).sort()[0] ?? null;

  return {
    stampDays,
    count: stampDays.length,
    canRedeem,
    stampsThrough: canRedeem ? stampDays[STAMPS_FOR_CHEAT - 1] : null,
    today: { tasksDone: t, withinBudget: within, onTrack: t && within && !cheatDates.has(today), eaten, budget },
    cheatToday: cheatDates.has(today),
    cheatUpcoming: upcoming,
    redeemed: rows.length,
    lifetime: days(addDays(today, -120)).length,
  };
}

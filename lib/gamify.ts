// 今日三樣、印花卡、街坊級數。全部由你嘅記錄計出嚟，唔使額外儲存（除咗「休息日」記入運動記錄）。
//
// 只獎勵「有記錄」同「休息」，唔獎勵少食，亦唔獎勵運動得越多越好。

import { addDays, diffDays } from "./date.ts";
import type { MealType } from "./types.ts";

export const MEALS_NEEDED = 3;

export interface DayLog {
  weight: boolean;
  /** 今日記咗幾多款餐（早／午／晚／小食，各計一次） */
  meals: number;
  /** 有運動記錄，或者標記咗休息日 */
  move: boolean;
}

export interface Tasks {
  weight: boolean;
  meals: boolean;
  move: boolean;
  done: boolean;
}

export function tasksFor(d: DayLog): Tasks {
  const meals = d.meals >= MEALS_NEEDED;
  return { weight: d.weight, meals, move: d.move, done: d.weight && meals && d.move };
}

export interface History {
  weightDates: ReadonlySet<string>;
  mealsByDate: ReadonlyMap<string, ReadonlySet<MealType>>;
  /** 有運動記錄（包括休息日）嘅日子 */
  moveDates: ReadonlySet<string>;
}

export function dayLogFor(h: History, date: string): DayLog {
  return {
    weight: h.weightDates.has(date),
    meals: h.mealsByDate.get(date)?.size ?? 0,
    move: h.moveDates.has(date),
  };
}

/** from..to（包括）之間，三樣齊嘅日子 */
export function stampDates(h: History, from: string, to: string): string[] {
  const out: string[] = [];
  const n = Math.min(diffDays(from, to), 400);
  for (let i = 0; i <= n; i++) {
    const d = addDays(from, i);
    if (tasksFor(dayLogFor(h, d)).done) out.push(d);
  }
  return out;
}

export const LEVELS = [
  { min: 0, name: "新搬嚟" },
  { min: 7, name: "熟客" },
  { min: 21, name: "老街坊" },
  { min: 50, name: "街坊會長" },
  { min: 100, name: "街坊傳說" },
] as const;

export interface LevelInfo {
  index: number;
  name: string;
  next: { name: string; min: number } | null;
  /** 仲差幾多個印花升級 */
  toNext: number;
}

export function levelFor(totalStamps: number): LevelInfo {
  let index = 0;
  LEVELS.forEach((l, i) => {
    if (totalStamps >= l.min) index = i;
  });
  const next = LEVELS[index + 1] ?? null;
  return { index, name: LEVELS[index].name, next: next ? { name: next.name, min: next.min } : null, toNext: next ? next.min - totalStamps : 0 };
}

export const STAMPS_PER_CARD = 7;

/** 印花卡：每 7 個一張。filled = 呢張卡已經有幾多個（集齊就係 7） */
export function cardProgress(totalStamps: number): { filled: number; cardsDone: number } {
  if (totalStamps <= 0) return { filled: 0, cardsDone: 0 };
  return { filled: ((totalStamps - 1) % STAMPS_PER_CARD) + 1, cardsDone: Math.floor(totalStamps / STAMPS_PER_CARD) };
}

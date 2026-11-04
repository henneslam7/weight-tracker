// 「分享今日」圖卡嘅資料模型（純函數，唔依賴 canvas / DOM）。
// 私隱：圖卡唔會包含體重、身高、年齡、名；只有今日 calories、營養素、食物同運動。
// 食物名可以選擇唔顯示（showNames = false）。

import { dayBudget } from "./budget.ts";
import type { Plan } from "./calc.ts";
import { intakeMessage, WHO_NAME } from "./copy.ts";
import { formatShort } from "./date.ts";
import { MEAL_LABEL, MEAL_TYPES, sumFood } from "./food.ts";
import type { FoodLog, MealType, Who } from "./types.ts";

export const SHARE_MAX_ITEMS = 8;
const NAME_MAX = 12;

export interface ShareItem {
  name: string;
  kcal: number;
}
export interface ShareMeal {
  meal: MealType;
  label: string;
  kcal: number;
  items: ShareItem[];
}
export interface ShareMacro {
  label: string;
  value: number;
  target: number;
}
export interface ShareModel {
  dateText: string;
  mode: "remaining" | "over" | "empty";
  /** 大數字（絕對值）：剩餘或超出 */
  bigNumber: number;
  bigLabel: string;
  eaten: number;
  budget: number;
  /** 0–1（超標都 cap 喺 1，用顏色分） */
  progress: number;
  macros: ShareMacro[];
  meals: ShareMeal[];
  moreCount: number;
  exercise: number;
  caption: string;
  who: Who;
  whoName: string;
  showNames: boolean;
}

/** 去除控制字元、壓縮空白、截短 */
export function cleanName(s: string, max = NAME_MAX): string {
  const t = s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const chars = [...t];
  return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : t;
}

export function buildShareModel(args: {
  today: string;
  plan: Plan;
  foods: readonly FoodLog[];
  exerciseBurned: number;
  showNames?: boolean;
  maxItems?: number;
}): ShareModel {
  const { today, plan, foods, exerciseBurned } = args;
  const showNames = args.showNames ?? true;
  const maxItems = args.maxItems ?? SHARE_MAX_ITEMS;

  const b = dayBudget(plan, exerciseBurned);
  const totals = sumFood(foods);
  const eaten = totals.calories;
  const diff = b.calories - eaten;
  const mode: ShareModel["mode"] = foods.length === 0 ? "empty" : diff >= 0 ? "remaining" : "over";

  // 食物按餐分組；太多就保留 kcal 最高嘅 maxItems 項（保持原有次序）
  let keep: Set<FoodLog> | null = null;
  let moreCount = 0;
  if (showNames && foods.length > maxItems) {
    const top = [...foods].sort((a, c) => c.calories - a.calories).slice(0, maxItems);
    keep = new Set(top);
    moreCount = foods.length - maxItems;
  }
  const meals: ShareMeal[] = [];
  for (const m of MEAL_TYPES) {
    const inMeal = foods.filter((f) => f.meal_type === m);
    if (!inMeal.length) continue;
    const shown = showNames ? inMeal.filter((f) => !keep || keep.has(f)) : [];
    meals.push({
      meal: m,
      label: MEAL_LABEL[m],
      kcal: Math.round(inMeal.reduce((a, f) => a + f.calories, 0)),
      items: shown.map((f) => ({ name: cleanName(f.name), kcal: Math.round(f.calories) })),
    });
  }

  const who: Who = Number(today.slice(-2)) % 2 === 0 ? "foon" : "chan";
  return {
    dateText: formatShort(today),
    mode,
    bigNumber: Math.abs(Math.round(diff)),
    bigLabel: mode === "over" ? "kcal 今日多咗" : mode === "empty" ? "kcal 今日目標" : "kcal 仲剩",
    eaten,
    budget: b.calories,
    progress: b.calories > 0 ? Math.min(1, eaten / b.calories) : 0,
    macros: [
      { label: "蛋白質", value: Math.round(totals.protein_g), target: b.proteinG },
      { label: "碳水", value: Math.round(totals.carbs_g), target: b.carbsG },
      { label: "脂肪", value: Math.round(totals.fat_g), target: b.fatG },
    ],
    meals,
    moreCount,
    exercise: Math.round(exerciseBurned),
    caption: intakeMessage(eaten, b.calories),
    who,
    whoName: WHO_NAME[who],
    showNames,
  };
}

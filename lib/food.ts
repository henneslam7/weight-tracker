import type { FoodLog, MealType } from "./types.ts";

export const MEAL_TYPES: readonly MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "小食",
};

export interface Nutrition {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function sumFood(items: readonly Nutrition[]): Nutrition {
  const t = items.reduce(
    (a, i) => ({
      calories: a.calories + i.calories,
      protein_g: a.protein_g + i.protein_g,
      carbs_g: a.carbs_g + i.carbs_g,
      fat_g: a.fat_g + i.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
  return {
    calories: Math.round(t.calories),
    protein_g: round1(t.protein_g),
    carbs_g: round1(t.carbs_g),
    fat_g: round1(t.fat_g),
  };
}

/** 按而家幾點，預設揀邊餐 */
export function defaultMealType(hour: number): MealType {
  if (hour >= 5 && hour < 10) return "breakfast";
  if (hour >= 10 && hour < 15) return "lunch";
  if (hour >= 17 && hour < 22) return "dinner";
  return "snack";
}

export function isMealType(v: string | null): v is MealType {
  return v === "breakfast" || v === "lunch" || v === "dinner" || v === "snack";
}

// ───────────── 編輯食物記錄 ─────────────

export const FOOD_LIMITS = { name: 80, quantity: 80, calories: 5000, protein: 500, carbs: 800, fat: 500 } as const;

/** 編輯表單嘅輸入（全部係字串，直接對應 input） */
export interface FoodEditInput {
  name: string;
  quantity_text: string;
  meal_type: MealType;
  logged_on: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
}

const num = (v: string): number => (v.trim() === "" ? 0 : Number(v));

/** 回傳錯誤訊息；null = 通過。限制同資料庫 check 一致。 */
export function checkFoodEdit(i: FoodEditInput, today: string): string | null {
  const name = i.name.trim();
  if (!name) return "食物名唔可以空白。";
  if ([...name].length > FOOD_LIMITS.name) return `食物名最多 ${FOOD_LIMITS.name} 個字。`;
  if ([...i.quantity_text.trim()].length > FOOD_LIMITS.quantity) return `份量最多 ${FOOD_LIMITS.quantity} 個字。`;
  if (!isMealType(i.meal_type)) return "請揀餐別。";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.logged_on) || Number.isNaN(Date.parse(i.logged_on))) return "日期唔正確。";
  if (i.logged_on > today) return "日期唔可以係未來。";
  if (i.calories.trim() === "" || !Number.isFinite(Number(i.calories)) || Number(i.calories) < 0 || Number(i.calories) > FOOD_LIMITS.calories) {
    return `calories 請輸入 0–${FOOD_LIMITS.calories}。`;
  }
  for (const [k, max, text] of [
    ["protein_g", FOOD_LIMITS.protein, "蛋白質"],
    ["carbs_g", FOOD_LIMITS.carbs, "碳水"],
    ["fat_g", FOOD_LIMITS.fat, "脂肪"],
  ] as const) {
    const v = num(i[k]);
    if (!Number.isFinite(v) || v < 0 || v > max) return `${text}請輸入 0–${max} g。`;
  }
  return null;
}

/** 三大營養素換算 kcal 同填寫 kcal 嘅差（只用嚟提示，唔阻止儲存） */
export function macroGap(i: FoodEditInput): number {
  return Math.round(4 * num(i.protein_g) + 4 * num(i.carbs_g) + 9 * num(i.fat_g) - num(i.calories));
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 生成要 update 嘅欄位。營養數字有改過，就由 'ai' 變返 'manual'（唔再係 AI 估算值）；
 * ai_raw 原樣保留，方便對返。
 */
export function foodUpdateRow(i: FoodEditInput, original: { source: FoodLog["source"]; calories: number; protein_g: number; carbs_g: number; fat_g: number }) {
  const calories = Math.round(Number(i.calories));
  const protein_g = r1(num(i.protein_g));
  const carbs_g = r1(num(i.carbs_g));
  const fat_g = r1(num(i.fat_g));
  const nutritionChanged =
    calories !== original.calories || protein_g !== r1(original.protein_g) || carbs_g !== r1(original.carbs_g) || fat_g !== r1(original.fat_g);
  return {
    name: i.name.trim(),
    quantity_text: i.quantity_text.trim() || null,
    meal_type: i.meal_type,
    logged_on: i.logged_on,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    source: nutritionChanged && original.source === "ai" ? ("manual" as const) : original.source,
  };
}

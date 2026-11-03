import type { MealType } from "./types.ts";

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

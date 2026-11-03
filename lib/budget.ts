import type { Plan } from "./calc.ts";
import { creditFor } from "./exercise.ts";
import type { Nutrition } from "./food.ts";

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 當日預算 = 基本目標 + 運動加成 */
export interface DayBudget {
  baseCalories: number;
  exerciseBurned: number;
  /** 實際加返入上限嘅 kcal（已計比例同每日上限） */
  exerciseCredit: number;
  /** 當日 calories 上限 */
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** 運動加成嘅 calories 全數撥入碳水（蛋白質、脂肪目標唔變） */
export function dayBudget(plan: Plan, exerciseBurned: number): DayBudget {
  const credit = creditFor(exerciseBurned);
  return {
    baseCalories: plan.targetCalories,
    exerciseBurned,
    exerciseCredit: credit,
    calories: plan.targetCalories + credit,
    proteinG: plan.macros.proteinG,
    fatG: plan.macros.fatG,
    carbsG: plan.macros.carbsG + Math.round(credit / 4),
  };
}

/** 剩餘（可以係負數 = 已超過） */
export function remaining(budget: DayBudget, eaten: Nutrition): Nutrition {
  return {
    calories: budget.calories - eaten.calories,
    protein_g: round1(budget.proteinG - eaten.protein_g),
    carbs_g: round1(budget.carbsG - eaten.carbs_g),
    fat_g: round1(budget.fatG - eaten.fat_g),
  };
}

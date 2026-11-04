// 舊版（v1）計算：單一活動倍率 + 每週速度 → 赤字，靜靜雞 cap。
// 只用嚟「公式更新」時比較新舊數字，畀用戶睇到變咗乜，唔會用嚟實際計劃。

import {
  ACTIVITY_FACTORS,
  ageOn,
  calcBmr,
  calcTdee,
  clampRate,
  isSenior,
  KCAL_PER_KG,
  MIN_CALORIES,
  SENIOR,
} from "./calc.ts";
import type { Profile } from "./types.ts";

/** 舊版（v1）嘅硬上限 */
const LEGACY_MAX_DEFICIT_RATIO = 0.25;

export interface LegacyNumbers {
  tdee: number;
  targetCalories: number;
  dailyDeltaKcal: number;
  proteinG: number;
}

/** 冇舊活動量（null）就回傳 null */
export function legacyNumbers(profile: Profile, weightKg: number, today: string): LegacyNumbers | null {
  if (!profile.activity_level || !(profile.activity_level in ACTIVITY_FACTORS)) return null;
  const age = ageOn(profile.birth_date, today);
  const senior = isSenior(age);
  const tdee = calcTdee(calcBmr(profile.sex, weightKg, profile.height_cm, age), profile.activity_level);
  let target = tdee;
  if (profile.goal === "lose") {
    const rate = clampRate("lose", profile.weekly_rate_kg, age);
    const cap = tdee * (senior ? SENIOR.maxDeficitRatio : LEGACY_MAX_DEFICIT_RATIO);
    target = tdee - Math.min((rate * KCAL_PER_KG) / 7, cap);
  } else if (profile.goal === "gain") {
    target = tdee + (clampRate("gain", profile.weekly_rate_kg) * KCAL_PER_KG) / 7;
  }
  target = Math.max(target, Math.min(MIN_CALORIES[profile.sex], tdee));
  const targetCalories = Math.round(target);
  return {
    tdee: Math.round(tdee),
    targetCalories,
    dailyDeltaKcal: targetCalories - Math.round(tdee),
    proteinG: Math.round((senior ? SENIOR.proteinGPerKg : 1.8) * weightKg),
  };
}

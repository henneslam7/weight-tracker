// 運動消耗估算同「加返入每日上限」嘅規則。
//
// 估算方法：淨 calories = (MET − 1) × 體重(kg) × 時間(小時)
//   減 1 係因為靜止時本來都會燒，每日目標（TDEE）已經包含咗，唔重複計。
// MET 係概約值（參考 Compendium of Physical Activities 嘅常見數值，未逐項對照原表），
// 實際消耗會因人、強度而異，所以全部都係估算。

export interface ExerciseType {
  id: string;
  label: string;
  /** null = 要自己輸入 kcal */
  met: number | null;
}

export const EXERCISE_TYPES: readonly ExerciseType[] = [
  { id: "walk", label: "步行（普通）", met: 3.5 },
  { id: "brisk_walk", label: "快步行", met: 4.5 },
  { id: "jog", label: "慢跑", met: 7.0 },
  { id: "run", label: "跑步", met: 9.8 },
  { id: "hike", label: "行山", met: 6.0 },
  { id: "stairs", label: "行樓梯", met: 5.0 },
  { id: "cycle_easy", label: "單車（輕鬆）", met: 4.0 },
  { id: "cycle", label: "單車（中速）", met: 6.8 },
  { id: "cycle_fast", label: "單車（快）", met: 8.0 },
  { id: "swim", label: "游水", met: 6.0 },
  { id: "weights", label: "重量訓練", met: 3.5 },
  { id: "hiit", label: "HIIT／循環訓練", met: 8.0 },
  { id: "jump_rope", label: "跳繩", met: 10.0 },
  { id: "elliptical", label: "橢圓機", met: 5.0 },
  { id: "rowing", label: "划船機", met: 6.0 },
  { id: "yoga", label: "瑜伽", met: 2.5 },
  { id: "pilates", label: "普拉提", met: 3.0 },
  { id: "taichi", label: "太極", met: 3.0 },
  { id: "dance", label: "跳舞", met: 5.0 },
  { id: "badminton", label: "羽毛球", met: 5.5 },
  { id: "basketball", label: "籃球", met: 6.5 },
  { id: "football", label: "足球", met: 7.0 },
  { id: "tennis", label: "網球", met: 7.3 },
  { id: "other", label: "其他（自己輸入 kcal）", met: null },
];

export const MAX_MINUTES = 480;
export const MAX_ENTRY_KCAL = 2000;

/** 運動消耗加返入上限嘅比例（1 = 全數加返）。想保守啲可以調低，例如 0.75。 */
export const EXERCISE_CREDIT_RATIO = 1;
/** 每日最多加返幾多 kcal，防止估算偏高或者過量運動令上限無限放大 */
export const EXERCISE_CREDIT_CAP = 1000;

export function findType(id: string): ExerciseType | undefined {
  return EXERCISE_TYPES.find((t) => t.id === id);
}

/** 淨消耗 kcal（整數）。MET ≤ 1 或者資料唔合理就回傳 0。 */
export function netKcal(met: number, weightKg: number, minutes: number): number {
  if (!(met > 1) || !(weightKg > 0) || !(minutes > 0)) return 0;
  return Math.round(((met - 1) * weightKg * minutes) / 60);
}

export function sumBurned(logs: readonly { calories: number }[]): number {
  return logs.reduce((s, l) => s + l.calories, 0);
}

/** 今日運動消耗，有幾多加返入上限 */
export function creditFor(burnedKcal: number): number {
  return Math.min(EXERCISE_CREDIT_CAP, Math.max(0, Math.round(burnedKcal * EXERCISE_CREDIT_RATIO)));
}

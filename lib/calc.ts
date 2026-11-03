import { diffDays, isValidDateStr } from "./date.ts";
import type { ActivityLevel, Goal, Profile, Sex, WeightLog } from "./types.ts";

// ───────────── 常數（安全限制：唔好放寬）─────────────

export const KCAL_PER_KG = 7700;
export const MIN_AGE = 18;
/** 減脂每日赤字最多 TDEE 嘅 25% */
export const MAX_DEFICIT_RATIO = 0.25;
/** calories 下限 */
export const MIN_CALORIES: Record<Sex, number> = { male: 1500, female: 1200 };
export const RATE_LIMITS = {
  lose: { min: 0.25, max: 0.75 },
  gain: { min: 0.25, max: 0.5 },
} as const;
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};
export const PROTEIN_G_PER_KG = 1.8;
export const FAT_CALORIE_RATIO = 0.25;
/** 目標體重嘅 BMI 下限（減脂時用嚟擋極端目標） */
export const MIN_TARGET_BMI = 18.5;

/** 65 歲或以上較保守嘅設定（設計預設，唔係醫療標準，建議同醫生或註冊營養師確認） */
export const SENIOR_AGE = 65;
export const SENIOR = {
  maxDeficitRatio: 0.15,
  rateMax: 0.25,
  proteinGPerKg: 1.2,
  minTargetBmi: 22,
} as const;

export function isSenior(age: number): boolean {
  return age >= SENIOR_AGE;
}

// ───────────── 基本公式 ─────────────

export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/** Mifflin-St Jeor */
export function calcBmr(
  sex: Sex,
  weightKg: number,
  heightCm: number,
  age: number,
): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
}

export function calcTdee(bmr: number, level: ActivityLevel): number {
  return bmr * ACTIVITY_FACTORS[level];
}

export function calcBmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function clampRate(goal: Goal, rate: number | null, age?: number): number {
  if (goal === "maintain") return 0;
  const { min, max: baseMax } = RATE_LIMITS[goal];
  // 65 歲或以上，每週速度上限壓低（最少都係 min）
  const max = age !== undefined && isSenior(age) ? Math.max(min, Math.min(baseMax, SENIOR.rateMax)) : baseMax;
  const r = rate ?? 0.5;
  return Math.min(max, Math.max(min, r));
}

// ───────────── Calories / Macros 計劃 ─────────────

export interface Macros {
  proteinG: number;
  fatG: number;
  carbsG: number;
}

export interface Plan {
  age: number;
  bmr: number;
  tdee: number;
  targetCalories: number;
  /** 65 歲或以上：用較保守嘅赤字、速度同蛋白質 */
  senior: boolean;
  /** 每日相對 TDEE 嘅差額（負數 = 赤字） */
  dailyDeltaKcal: number;
  /** 實際採用嘅每週速度（kg，已計安全限制） */
  weeklyRateKg: number;
  macros: Macros;
  notes: string[];
}

export type PlanResult =
  | { ok: true; plan: Plan }
  | { ok: false; reason: string };

export interface PlanInput {
  profile: Profile;
  weightKg: number;
  today: string;
}

export function computePlan({ profile, weightKg, today }: PlanInput): PlanResult {
  const age = ageOn(profile.birth_date, today);
  if (age < MIN_AGE) {
    return { ok: false, reason: `呢個 app 只供 ${MIN_AGE} 歲或以上使用。` };
  }

  const bmr = calcBmr(profile.sex, weightKg, profile.height_cm, age);
  const tdee = calcTdee(bmr, profile.activity_level);
  const notes: string[] = [];
  let target = tdee;

  const senior = isSenior(age);
  if (senior && profile.goal !== "maintain") {
    notes.push("你屬 65 歲或以上，目標已用較保守嘅速度同赤字計算。減重前請先同醫生或註冊營養師傾。");
  }

  if (profile.goal === "lose") {
    const rate = clampRate("lose", profile.weekly_rate_kg, age);
    if (profile.weekly_rate_kg !== null && rate !== profile.weekly_rate_kg) {
      notes.push(`每週速度已調整至安全範圍（0.25–${senior ? SENIOR.rateMax : 0.75} kg）。`);
    }
    const requested = (rate * KCAL_PER_KG) / 7;
    const ratio = senior ? SENIOR.maxDeficitRatio : MAX_DEFICIT_RATIO;
    const cap = tdee * ratio;
    let deficit = requested;
    if (requested > cap) {
      deficit = cap;
      notes.push(`每日赤字已限制喺 TDEE 嘅 ${Math.round(ratio * 100)}% 以內。`);
    }
    target = tdee - deficit;
  } else if (profile.goal === "gain") {
    const rate = clampRate("gain", profile.weekly_rate_kg);
    if (profile.weekly_rate_kg !== null && rate !== profile.weekly_rate_kg) {
      notes.push("增肌速度已調整至安全範圍（0.25–0.5 kg）。");
    }
    target = tdee + (rate * KCAL_PER_KG) / 7;
  }

  // calories 下限（TDEE 本身低過下限時，最多食到維持量，唔會變成盈餘）
  const floor = Math.min(MIN_CALORIES[profile.sex], tdee);
  if (target < floor) {
    target = floor;
    notes.push(
      `每日 calories 唔可以低過 ${MIN_CALORIES[profile.sex]} kcal，已按下限調整。`,
    );
  }

  const targetCalories = Math.round(target);
  const dailyDeltaKcal = targetCalories - Math.round(tdee);
  const weeklyRateKg = Math.round(((dailyDeltaKcal * 7) / KCAL_PER_KG) * 100) / 100;

  const proteinG = Math.round((senior ? SENIOR.proteinGPerKg : PROTEIN_G_PER_KG) * weightKg);
  const fatG = Math.round((targetCalories * FAT_CALORIE_RATIO) / 9);
  const carbsG = Math.max(
    0,
    Math.round((targetCalories - proteinG * 4 - fatG * 9) / 4),
  );

  return {
    ok: true,
    plan: {
      age,
      senior,
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      targetCalories,
      dailyDeltaKcal,
      weeklyRateKg,
      macros: { proteinG, fatG, carbsG },
      notes,
    },
  };
}

// ───────────── Profile 驗證 ─────────────

export interface ProfileCheckInput {
  profile: Profile;
  /** 現時體重（如果已知） */
  currentWeightKg: number | null;
  today: string;
}

/** 回傳錯誤訊息；null = 通過 */
export function validateProfile({
  profile,
  currentWeightKg,
  today,
}: ProfileCheckInput): string | null {
  if (!isValidDateStr(profile.birth_date)) return "請輸入正確嘅出生日期。";
  if (diffDays(profile.birth_date, today) < 0) return "出生日期唔可以係未來。";
  if (ageOn(profile.birth_date, today) < MIN_AGE) {
    return `呢個 app 只供 ${MIN_AGE} 歲或以上使用。`;
  }
  if (!(profile.height_cm >= 120 && profile.height_cm <= 230)) {
    return "身高請輸入 120–230 厘米。";
  }
  if (
    currentWeightKg !== null &&
    !(currentWeightKg >= 30 && currentWeightKg <= 300)
  ) {
    return "體重請輸入 30–300 公斤。";
  }
  if (profile.goal === "maintain") return null;

  const t = profile.target_weight_kg;
  if (t === null || !(t >= 30 && t <= 300)) return "請輸入目標體重（30–300 公斤）。";
  if (profile.goal === "lose") {
    if (currentWeightKg !== null && t >= currentWeightKg) {
      return "減脂嘅目標體重要低過現時體重。";
    }
    const minBmi = isSenior(ageOn(profile.birth_date, today)) ? SENIOR.minTargetBmi : MIN_TARGET_BMI;
    if (calcBmi(t, profile.height_cm) < minBmi) {
      return `目標體重偏低（BMI 低過 ${minBmi}），唔建議以此為目標。如有疑問，請向醫生或註冊營養師查詢。`;
    }
  }
  if (profile.goal === "gain" && currentWeightKg !== null && t <= currentWeightKg) {
    return "增肌嘅目標體重要高過現時體重。";
  }
  return null;
}

// ───────────── 體重趨勢 ─────────────

export interface TrendPoint {
  date: string;
  weight: number;
  /** 7 日移動平均 */
  avg: number;
}

function sortedAsc(logs: WeightLog[]): WeightLog[] {
  return [...logs].sort((a, b) => a.logged_on.localeCompare(b.logged_on));
}

/** 7 日移動平均：每個點取「該日及之前 6 日」內嘅記錄平均 */
export function movingAverage(logs: WeightLog[], windowDays = 7): TrendPoint[] {
  const sorted = sortedAsc(logs);
  return sorted.map((p) => {
    const inWindow = sorted.filter((l) => {
      const d = diffDays(l.logged_on, p.logged_on);
      return d >= 0 && d < windowDays;
    });
    const avg = inWindow.reduce((s, l) => s + l.weight_kg, 0) / inWindow.length;
    return {
      date: p.logged_on,
      weight: p.weight_kg,
      avg: Math.round(avg * 100) / 100,
    };
  });
}

/**
 * 每週趨勢（kg/週，負數 = 下降）。
 * 取最近 lookbackDays 日嘅記錄做線性回歸；跨度少過 minSpanDays 就回傳 null。
 */
export function weeklyTrendKg(
  logs: WeightLog[],
  lookbackDays = 14,
  minSpanDays = 5,
): number | null {
  const sorted = sortedAsc(logs);
  if (sorted.length < 2) return null;
  const latest = sorted[sorted.length - 1].logged_on;
  const win = sorted.filter((l) => diffDays(l.logged_on, latest) < lookbackDays);
  if (win.length < 2) return null;
  const first = win[0].logged_on;
  const span = diffDays(first, latest);
  if (span < minSpanDays) return null;

  const xs = win.map((l) => diffDays(first, l.logged_on));
  const ys = win.map((l) => l.weight_kg);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  return Math.round((num / den) * 7 * 100) / 100;
}

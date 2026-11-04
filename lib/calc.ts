import { ACTIVITY_DESC, estimateActivity, type ActivitySource, type DataQuality } from "./activity.ts";
import { diffDays, isValidDateStr } from "./date.ts";
import { allocateMacros, macroKcal } from "./macros.ts";
import type { ActivityLevel, CalibrationStatus, Goal, Pace, Profile, Sex, WeightLog } from "./types.ts";

// ───────────── 常數（安全限制：唔好放寬）─────────────

/** 公式版本。改動計算邏輯就要升版本，profile.formula_version 同呢個唔同 → 顯示「公式已更新」 */
export const FORMULA_VERSION = "tdee-v3";

export const KCAL_PER_KG = 7700;
export const MIN_AGE = 18;
/**
 * 赤字分級（唔係硬性醫學上限）：
 *   ≤ 20% 一般；20–25% 較進取（要提醒）；> 25% 審慎區（要通過安全篩查、成年人先可以用，並有強提醒）。
 * 真正嘅硬性限制只有：calories 下限（男 1500／女 1200）、篩查未通過、65+ 嘅 15% 上限。
 */
export const CAUTION_DEFICIT_RATIO = 0.25;
/** 赤字超過 20% 要顯示額外提醒 */
export const FAST_WARN_RATIO = 0.2;
/** 一般成人蛋白質（g/kg）：篩查要專業評估嗰陣唔預設高蛋白 */
export const REVIEW_PROTEIN_G_PER_KG = 0.8;
/** TDEE 校準調整上限（kcal） */
export const MAX_TDEE_ADJUST = 300;
/** calories 下限 */
export const MIN_CALORIES: Record<Sex, number> = { male: 1500, female: 1200 };
export const RATE_LIMITS = {
  lose: { min: 0.25, max: 0.75 },
  gain: { min: 0.25, max: 0.5 },
} as const;

/** 舊版單一活動量倍率（只喺舊資料／冇問卷時後備，見 lib/activity.ts） */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** 減脂速度檔位 = TDEE 嘅赤字比例中位數（需求 §3.4：溫和 10–15%、標準 15–20%、進取 20–25%） */
export type FixedPace = Exclude<Pace, "custom">;
export const PACE_RATIO: Record<FixedPace, number> = { gentle: 0.125, standard: 0.175, faster: 0.225 };
export const PACE_ORDER: readonly FixedPace[] = ["gentle", "standard", "faster"];
export const PACE_LABEL: Record<Pace, string> = {
  gentle: "溫和",
  standard: "標準",
  faster: "較進取",
  custom: "自訂",
};

/** 蛋白質 g/kg（需求 §3.6：1.2–1.6）。默認／下限；65+ 一律 1.2 */
export const PROTEIN_RANGE: Record<Goal, { def: number; min: number }> = {
  lose: { def: 1.6, min: 1.2 },
  maintain: { def: 1.4, min: 1.2 },
  gain: { def: 1.6, min: 1.2 },
  recomp: { def: 1.6, min: 1.2 },
};
/** 體態重組：輕微赤字（TDEE 嘅 5%），產品假設，待營養專業審核 */
export const RECOMP_RATIO = 0.05;
/** 體態重組最少每週重訓次數（只作提醒，唔擋） */
export const RECOMP_MIN_SESSIONS = 2;
export const FAT_CALORIE_RATIO = 0.25;
/** 目標體重嘅 BMI 下限（減脂時用嚟擋極端目標） */
export const MIN_TARGET_BMI = 18.5;
/** 現時 BMI 低過呢個：唔提供減脂赤字 */
export const MIN_CURRENT_BMI_TO_LOSE = 18.5;

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

/** Mifflin-St Jeor（內部唔取整） */
export function calcBmr(
  sex: Sex,
  weightKg: number,
  heightCm: number,
  age: number,
): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
}

/** 舊版：BMR × 單一活動量倍率（只供舊資料比較同測試；新計算用 estimateActivity） */
export function calcTdee(bmr: number, level: ActivityLevel): number {
  return bmr * ACTIVITY_FACTORS[level];
}

export function calcBmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function clampRate(goal: Goal, rate: number | null, age?: number): number {
  if (goal === "maintain" || goal === "recomp") return 0;
  const { min, max: baseMax } = RATE_LIMITS[goal];
  // 65 歲或以上，每週速度上限壓低（最少都係 min）
  const max = age !== undefined && isSenior(age) ? Math.max(min, Math.min(baseMax, SENIOR.rateMax)) : baseMax;
  const r = rate ?? 0.5;
  return Math.min(max, Math.max(min, r));
}

/** 舊資料只有 weekly_rate_kg：0.25 / 0.5 / 0.75 對應 溫和 / 標準 / 進取 */
export function paceFromRate(rate: number | null | undefined): FixedPace {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return "standard";
  if (rate <= 0.375) return "gentle";
  if (rate <= 0.625) return "standard";
  return "faster";
}

// ───────────── Calories / Macros 計劃 ─────────────

export interface Macros {
  proteinG: number;
  fatG: number;
  carbsG: number;
}

/**
 * ok              = 照你揀嘅方案計
 * capped          = 方案被安全限制調整咗（會明確話你知原因，唔會靜靜雞改）
 * blocked         = 你自訂嘅 kcal 唔安全，冇採用；顯示嘅係後備方案
 * requires_review = 需要專業評估，唔提供減脂赤字（只顯示維持量）
 */
export type PlanStatus = "ok" | "capped" | "blocked" | "requires_review";

export interface Plan {
  goal: Goal;
  /** 放縱日加咗幾多 kcal（只喺放縱日由 applyCheat 設定） */
  cheatExtraKcal?: number;
  age: number;
  bmr: number;
  /** 每日總消耗（取整後嘅中位估算） */
  tdee: number;
  /** TDEE 合理範圍（取整） */
  tdeeLow: number;
  tdeeHigh: number;
  /** 活動資料完整度（唔係準確度） */
  dataQuality: DataQuality;
  /** 校準狀態：未校準／已有體重趨勢／已初步校準 */
  calibrationStatus: CalibrationStatus;
  /** 已套用嘅校準調整（kcal，已包含喺 tdee 內）同上次校準日期 */
  tdeeAdjustKcal: number;
  calibratedAt: string | null;
  /** 活動假設描述，例如「低至輕度活動（尚未校準）」 */
  scenarioDescription: string;
  /** 每週體重變化永遠只係估算 */
  estimated: true;
  weeklyEstimateMethod: "static_7700_heuristic";
  /** 三大營養素換算 kcal，同同目標熱量嘅取整差 */
  macroKcal: number;
  kcalRoundingDelta: number;
  /** 赤字分級：none（冇赤字）／normal（≤20%）／progressive（20–25%）／caution（>25%） */
  deficitTier: "none" | "normal" | "progressive" | "caution";
  activitySource: ActivitySource;
  /** 活動倍率（不含額外運動）同其範圍 */
  activityFactor: number;
  activityFactorLow: number;
  activityFactorHigh: number;
  /** 額外固定運動每日淨消耗 kcal（已包含喺 tdee 內） */
  exerciseKcal: number;
  /** 仲欠咩資料可以令估算更準 */
  missing: string[];
  /** 活動估算解釋 key（UI／explain 用） */
  activityKeys: string[];
  targetCalories: number;
  /** 65 歲或以上：用較保守嘅赤字、速度同蛋白質 */
  senior: boolean;
  /** 每日相對 TDEE 嘅差額（負數 = 赤字） */
  dailyDeltaKcal: number;
  /** 赤字佔 TDEE 比例（減脂時；其他 0） */
  deficitRatio: number;
  /** 預計每週體重變化（kg，負數 = 減）。由 差額×7÷7700 計，只係粗略估計 */
  weeklyRateKg: number;
  /** 若 TDEE 實際係低位／高位，每週變化範圍 [最少變化, 最多變化]（kg） */
  weeklyRateRangeKg: [number, number];
  /** 你揀嘅檔位 vs 實際採用嘅檔位（減脂先有） */
  paceRequested: Pace | null;
  pace: Pace | null;
  status: PlanStatus;
  macros: Macros;
  /** 蛋白質每 kg 同計算用嘅體重（記錄基準） */
  proteinPerKg: number;
  proteinBasisKg: number;
  proteinBasis: "current";
  /** 一般說明 */
  notes: string[];
  /** 需要留意／被調整／被擋嘅警告 */
  warnings: string[];
  formulaVersion: string;
}

export type PlanResult =
  | { ok: true; plan: Plan }
  | { ok: false; reason: string };

/** 體重／食物記錄概況（用嚟決定校準狀態「已有體重趨勢」） */
export interface CalibrationSignals {
  weightSpanDays: number;
  weightCount: number;
}

export interface PlanInput {
  profile: Profile;
  weightKg: number;
  today: string;
  signals?: CalibrationSignals;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const weeklyKg = (dailyDelta: number) => round2((dailyDelta * 7) / KCAL_PER_KG);

export type DeficitTier = "none" | "normal" | "progressive" | "caution";
export function tierOf(ratio: number): DeficitTier {
  if (!(ratio > 0)) return "none";
  if (ratio > CAUTION_DEFICIT_RATIO + 1e-9) return "caution";
  if (ratio > FAST_WARN_RATIO + 1e-9) return "progressive";
  return "normal";
}

/** 某個攝取量相對 TDEE 嘅赤字（用於檢查任何入口嘅自訂熱量／已記錄攝取） */
export function deficitFor(tdee: number, intakeKcal: number): { deficitKcal: number; ratio: number; tier: DeficitTier; caution: boolean } {
  const deficitKcal = tdee - intakeKcal;
  const ratio = tdee > 0 ? deficitKcal / tdee : 0;
  const tier = tierOf(ratio);
  return { deficitKcal, ratio, tier, caution: tier === "caution" };
}

export type EnergyPlanResult =
  | {
      ok: true;
      deficitKcal: number;
      /** 百分比（例如 23.23） */
      deficitPct: number;
      direction: "deficit" | "maintenance" | "surplus";
      /** 每週體重變化估算（kg）：正數 = 減，負數 = 增。只係 7,700 kcal/kg 粗略算法 */
      estimatedWeeklyChangeKg: number;
      estimated: true;
      method: "static_7700_heuristic";
      tier: DeficitTier;
    }
  | { ok: false; reason: string };

/** 需求 §9.1：由 TDEE 同目標攝取計赤字、百分比、每週估算。非法輸入拒絕計算。 */
export function calculateEnergyPlan(tdee: number, intakeKcal: number): EnergyPlanResult {
  if (!Number.isFinite(tdee) || tdee <= 0) return { ok: false, reason: "TDEE 唔合理，唔可以計算。" };
  if (!Number.isFinite(intakeKcal) || intakeKcal <= 0) return { ok: false, reason: "目標攝取唔合理，唔可以計算。" };
  const deficitKcal = tdee - intakeKcal;
  const ratio = deficitKcal / tdee;
  return {
    ok: true,
    deficitKcal,
    deficitPct: ratio * 100,
    direction: Math.abs(deficitKcal) < 1 ? "maintenance" : deficitKcal > 0 ? "deficit" : "surplus",
    estimatedWeeklyChangeKg: (deficitKcal * 7) / KCAL_PER_KG,
    estimated: true,
    method: "static_7700_heuristic",
    tier: tierOf(ratio),
  };
}

/** 想每週減 X kg，反推要食幾多 kcal（只係數學，未經安全檢查；要再過 computePlan 嘅 custom 路徑） */
export function kcalForWeeklyLoss(tdee: number, kgPerWeek: number): number {
  return tdee - (kgPerWeek * KCAL_PER_KG) / 7;
}

/**
 * 用戶要求「每週減 X kg」（例如 1 kg）：反推熱量，檢查安全，並永遠提醒估算唔係保證（需求 T25／B03）。
 */
export function weeklyGoalAdvice(a: {
  tdee: number;
  kgPerWeek: number;
  sex: Sex;
  senior: boolean;
  review: Profile["risk_review"];
}): { intakeKcal: number; deficitPct: number; allowed: boolean; messages: string[] } {
  const raw = kcalForWeeklyLoss(a.tdee, a.kgPerWeek);
  const ratio = (a.tdee - raw) / a.tdee;
  const floor = MIN_CALORIES[a.sex];
  const review = a.review ?? "not_assessed";
  const messages = [
    `每週 ${a.kgPerWeek} kg 只係按 7,700 kcal/kg 嘅粗略估算，唔係保證：水分、睡眠、經期同記錄誤差都會令實際數字唔同，要睇 2–3 星期趨勢。`,
  ];
  let allowed = true;
  if (review === "needs_review") {
    allowed = false;
    messages.push("你嘅安全篩查顯示應該先同醫生或註冊營養師傾，所以唔提供呢個目標。");
  }
  if (raw < floor) {
    allowed = false;
    messages.push(`要做到呢個速度，每日只可以食約 ${Math.round(raw)} kcal，低過安全下限 ${floor} kcal，所以唔採用。可以考慮較慢嘅速度，或者向醫生／註冊營養師查詢。`);
  }
  if (a.senior && ratio > SENIOR.maxDeficitRatio + 1e-9) {
    allowed = false;
    messages.push("你屬 65 歲或以上，赤字上限係 15%。");
  } else if (ratio > CAUTION_DEFICIT_RATIO + 1e-9 && review !== "clear") {
    allowed = false;
    messages.push("呢個赤字超過 25%，要先完成並通過安全小篩查。");
  }
  return { intakeKcal: Math.round(raw), deficitPct: Math.round(ratio * 1000) / 10, allowed, messages };
}

/** 某檔位係咪容許 */
export function allowedPaces(opts: { senior: boolean; review: Profile["risk_review"] }): FixedPace[] {
  if (opts.senior) return ["gentle"];
  const out: FixedPace[] = ["gentle", "standard"];
  if (opts.review === "clear") out.push("faster");
  return out;
}

export function computePlan({ profile, weightKg, today, signals }: PlanInput): PlanResult {
  const age = ageOn(profile.birth_date, today);
  if (!Number.isFinite(age) || !isValidDateStr(profile.birth_date)) {
    return { ok: false, reason: "出生日期唔正確，請重新輸入。" };
  }
  if (age < MIN_AGE) {
    return { ok: false, reason: `呢個 app 只供 ${MIN_AGE} 歲或以上使用。` };
  }

  if (!(Number.isFinite(weightKg) && weightKg >= 20 && weightKg <= 400)) {
    return { ok: false, reason: "體重數字唔合理，請重新輸入。" };
  }
  if (!(Number.isFinite(profile.height_cm) && profile.height_cm >= 100 && profile.height_cm <= 250)) {
    return { ok: false, reason: "身高數字唔合理，請重新輸入。" };
  }

  const bmr = calcBmr(profile.sex, weightKg, profile.height_cm, age);
  const act = estimateActivity(
    {
      stepsRange: profile.steps_range,
      meanSteps28d: profile.mean_steps_28d,
      stepSource: profile.step_source,
      stepCoverage: profile.step_coverage,
      workActivity: profile.work_activity,
      exerciseType: profile.exercise_type,
      sessionsPerWeek: profile.exercise_sessions_per_week,
      minutesPerSession: profile.exercise_minutes,
      intensity: profile.exercise_intensity,
      exerciseIncludedInSteps: profile.exercise_included_in_steps,
      legacyLevel: profile.activity_level,
    },
    weightKg,
  );
  if (act.status === "needs_user_input") {
    return { ok: false, reason: "請先填寫日常活動量（平均每日步數），先計到每日熱量。" };
  }

  // 體重趨勢校準調整（逐步、有上限；冇校準 = 0）
  const adjust = Math.max(-MAX_TDEE_ADJUST, Math.min(MAX_TDEE_ADJUST, Math.round(profile.tdee_adjust_kcal ?? 0)));
  const tdee = bmr * act.factor + act.exerciseKcal + adjust;
  const tdeeLow = bmr * act.factorLow + act.exerciseKcalLow + adjust;
  const tdeeHigh = bmr * act.factorHigh + act.exerciseKcalHigh + adjust;
  const tdeeR = Math.round(tdee);

  const notes: string[] = [];
  const warnings: string[] = [];
  const senior = isSenior(age);
  const bmi = calcBmi(weightKg, profile.height_cm);
  const review = profile.risk_review ?? "not_assessed";

  let status: PlanStatus = "ok";
  let target = tdee;
  let pace: Pace | null = null;
  let paceRequested: Pace | null = null;

  if (senior && profile.goal !== "maintain") {
    notes.push("你屬 65 歲或以上，目標已用較保守嘅速度同赤字計算。減重前請先同醫生或註冊營養師傾。");
  }

  if (profile.goal === "lose") {
    const floorRaw = MIN_CALORIES[profile.sex];
    paceRequested = profile.pace ?? paceFromRate(profile.weekly_rate_kg);

    if (review === "needs_review" || bmi < MIN_CURRENT_BMI_TO_LOSE) {
      // 需要專業評估：唔提供任何減脂赤字，只顯示維持量
      status = "requires_review";
      target = tdee;
      warnings.push(
        review === "needs_review"
          ? "你嘅安全篩查結果顯示應該先同醫生或註冊營養師傾，所以呢度唔提供減脂赤字，只顯示維持體重嘅熱量。"
          : `你現時 BMI 低過 ${MIN_CURRENT_BMI_TO_LOSE}，唔建議減脂，只顯示維持體重嘅熱量。`,
      );
    } else {
      // 唔設百分比硬上限（只有 65+ 15%）；真正嘅限制係 calories 下限、篩查、同 > 25% 要通過篩查
      const maxRatio = senior ? SENIOR.maxDeficitRatio : null;
      const allowed = allowedPaces({ senior, review });
      const best = (limit: FixedPace): FixedPace => {
        const idx = PACE_ORDER.indexOf(limit);
        for (let i = idx; i >= 0; i--) if (allowed.includes(PACE_ORDER[i])) return PACE_ORDER[i];
        return "gentle";
      };
      let ratio: number | null = null;
      let customTarget: number | null = null;

      if (paceRequested === "custom") {
        const c = profile.custom_kcal;
        const dr = typeof c === "number" && Number.isFinite(c) ? (tdeeR - c) / tdeeR : NaN;
        if (typeof c !== "number" || !Number.isFinite(c)) {
          status = "blocked";
          warnings.push("你揀咗自訂熱量，但未填數字，所以暫時用標準檔位。");
        } else if (c < floorRaw) {
          status = "blocked";
          warnings.push(`你自訂嘅 ${Math.round(c)} kcal 低過安全下限 ${floorRaw} kcal，冇被採用。`);
        } else if (!(dr > 0)) {
          status = "blocked";
          warnings.push(`你自訂嘅 ${Math.round(c)} kcal 唔低過每日消耗（約 ${tdeeR} kcal），唔係赤字，冇被採用。`);
        } else if (maxRatio !== null && dr > maxRatio + 1e-9) {
          status = "blocked";
          warnings.push(
            `你自訂嘅 ${Math.round(c)} kcal 會造成約 ${Math.round(dr * 1000) / 10}% 赤字，超過 65 歲或以上嘅上限 ${Math.round(maxRatio * 100)}%，冇被採用。`,
          );
        } else if (dr > CAUTION_DEFICIT_RATIO + 1e-9 && review !== "clear") {
          status = "blocked";
          warnings.push(
            `你自訂嘅 ${Math.round(c)} kcal 會造成約 ${Math.round(dr * 1000) / 10}% 赤字（超過 25%）。要先完成並通過安全小篩查，先可以用呢個幅度，所以冇被採用。`,
          );
        } else {
          customTarget = c;
          pace = "custom";
          ratio = dr;
        }
        if (customTarget === null) {
          pace = best("standard");
          ratio = PACE_RATIO[pace];
          warnings.push(
            `暫時改用「${PACE_LABEL[pace]}」檔位（約 ${Math.round(tdee * (1 - ratio))} kcal／日，赤字 ${Math.round(ratio * 1000) / 10}%）作後備，你可以重新揀。想要更大幅度，請同醫生或註冊營養師傾。`,
          );
        }
      } else {
        const req = paceRequested;
        const applied = best(req);
        if (applied !== req) {
          status = "capped";
          const why = senior ? "你屬 65 歲或以上，赤字上限係 15%" : "你未完成（或未通過）安全篩查";
          warnings.push(`你揀咗「${PACE_LABEL[req]}」，但因為${why}，改用「${PACE_LABEL[applied]}」。`);
        }
        pace = applied;
        ratio = PACE_RATIO[applied];
      }

      target = customTarget ?? tdee * (1 - (ratio ?? 0));

      // calories 下限（TDEE 本身低過下限時，最多食到維持量，唔會變成盈餘）
      const floor = Math.min(floorRaw, tdee);
      if (target < floor) {
        target = floor;
        if (status === "ok") status = "capped";
        warnings.push(`每日 calories 唔可以低過 ${floorRaw} kcal，已按下限調整（所以赤字細過你揀嘅檔位）。`);
      }
    }
  } else if (profile.goal === "recomp") {
    if (review === "needs_review" || bmi < MIN_CURRENT_BMI_TO_LOSE) {
      status = "requires_review";
      target = tdee;
      warnings.push(
        review === "needs_review"
          ? "你嘅安全篩查結果顯示應該先同醫生或註冊營養師傾，所以呢度唔提供赤字，只顯示維持體重嘅熱量。"
          : `你現時 BMI 低過 ${MIN_CURRENT_BMI_TO_LOSE}，唔建議再減脂，只顯示維持體重嘅熱量。`,
      );
    } else {
      target = tdee * (1 - RECOMP_RATIO);
      const floor = Math.min(MIN_CALORIES[profile.sex], tdee);
      if (target < floor) {
        target = floor;
        status = "capped";
        warnings.push(`每日 calories 唔可以低過 ${MIN_CALORIES[profile.sex]} kcal，已按下限調整。`);
      }
    }
    const trains =
      (profile.exercise_type === "resistance" || profile.exercise_type === "mixed") &&
      (profile.exercise_sessions_per_week ?? 0) >= RECOMP_MIN_SESSIONS &&
      (profile.exercise_minutes ?? 0) > 0;
    if (!trains) {
      warnings.push(
        `體態重組要配合重量訓練（每週最少 ${RECOMP_MIN_SESSIONS} 次）。你而家冇填呢個，效果會有限；如果唔打算重訓，建議揀「減脂」或「維持體重」。`,
      );
    }
    notes.push("體態重組：體重大致不變係正常，主要睇腰圍、相同力量有冇進步，唔好淨係睇磅。");
  } else if (profile.goal === "gain") {
    const rate = clampRate("gain", profile.weekly_rate_kg);
    if (profile.weekly_rate_kg !== null && rate !== profile.weekly_rate_kg) {
      notes.push("增肌速度已調整至安全範圍（0.25–0.5 kg）。");
    }
    target = tdee + (rate * KCAL_PER_KG) / 7;
  }

  if (review === "needs_review" && (profile.goal === "maintain" || profile.goal === "gain")) {
    warnings.push("你嘅安全篩查結果顯示應該先同醫生或註冊營養師傾，呢個計劃只供參考。");
  }

  const targetCalories = Math.round(target);
  const dailyDeltaKcal = targetCalories - tdeeR;
  const weeklyRateKg = weeklyKg(dailyDeltaKcal);
  // TDEE 實際係高位 → 差額最負（變化最多）；低位 → 最少
  const rangeA = weeklyKg(targetCalories - Math.round(tdeeHigh));
  const rangeB = weeklyKg(targetCalories - Math.round(tdeeLow));
  const weeklyRateRangeKg: [number, number] = [Math.min(rangeA, rangeB), Math.max(rangeA, rangeB)];
  const deficitRatio = (profile.goal === "lose" || profile.goal === "recomp") && dailyDeltaKcal < 0 ? Math.round((-dailyDeltaKcal / tdeeR) * 1000) / 1000 : 0;
  const deficitTier: Plan["deficitTier"] = tierOf(deficitRatio);

  // 赤字分級提醒（只係提醒，唔係診斷）
  if (profile.goal === "lose" && status !== "requires_review") {
    const pct = Math.round(deficitRatio * 1000) / 10;
    if (deficitTier === "progressive") {
      warnings.push(`赤字約 ${pct}%，屬於較進取。留意飢餓、疲倦、睡眠同訓練表現，並以 2–3 星期嘅體重趨勢為準；有不適就加返攝取。`);
    } else if (deficitTier === "caution") {
      warnings.push(
        `赤字約 ${pct}%，超過 25%，屬於審慎區：只適合短期、要監察精神、睡眠、飢餓同訓練表現。有頭暈、極度疲倦或飲食失控，請加返攝取並向醫生或註冊營養師查詢。`,
      );
    }
  }

  // 蛋白質：永遠按現時體重計並記錄基準；篩查要專業評估嗰陣唔預設高蛋白（例如腎病／限蛋白）
  const basisKg = weightKg;
  const reviewProtein = review === "needs_review";
  const prot = reviewProtein
    ? { def: REVIEW_PROTEIN_G_PER_KG, min: REVIEW_PROTEIN_G_PER_KG }
    : senior
      ? { def: SENIOR.proteinGPerKg, min: SENIOR.proteinGPerKg }
      : PROTEIN_RANGE[profile.goal];
  if (reviewProtein) {
    notes.push(`蛋白質暫時用一般成人 ${REVIEW_PROTEIN_G_PER_KG} g/kg，唔預設高蛋白；請由醫生或註冊營養師按你嘅情況決定。`);
  }
  const m = allocateMacros({
    targetKcal: targetCalories,
    basisWeightKg: basisKg,
    proteinPerKg: prot.def,
    minProteinPerKg: prot.min,
    fatRatio: FAT_CALORIE_RATIO,
  });
  for (const n of m.notes) notes.push(n);
  const mk = macroKcal(m.proteinG, m.carbsG, m.fatG);

  // 校準狀態：只由體重趨勢／記錄決定；單靠問卷永遠係「未校準」
  const calibrationStatus: CalibrationStatus = profile.calibrated_at
    ? "initially_calibrated"
    : signals && signals.weightSpanDays >= 13 && signals.weightCount >= 8
      ? "trend_only"
      : "uncalibrated";
  const calSuffix =
    calibrationStatus === "initially_calibrated"
      ? "（已按近期記錄初步校準）"
      : calibrationStatus === "trend_only"
        ? "（已有體重趨勢，仍未用食物記錄校準）"
        : "（尚未校準）";
  const scenarioDescription =
    (act.source === "legacy_level" ? "舊版單一活動級別" : act.stepsRange ? ACTIVITY_DESC[act.stepsRange] : ACTIVITY_DESC.unknown) + calSuffix;
  if (!m.ok) warnings.push("目標熱量太低，配唔到合理嘅營養素組合，請同專業人士傾。");

  return {
    ok: true,
    plan: {
      goal: profile.goal,
      age,
      senior,
      bmr: Math.round(bmr),
      tdee: tdeeR,
      tdeeLow: Math.round(tdeeLow),
      tdeeHigh: Math.round(tdeeHigh),
      dataQuality: act.dataQuality,
      calibrationStatus,
      tdeeAdjustKcal: adjust,
      calibratedAt: profile.calibrated_at ?? null,
      scenarioDescription,
      estimated: true,
      weeklyEstimateMethod: "static_7700_heuristic",
      macroKcal: mk,
      kcalRoundingDelta: mk - targetCalories,
      deficitTier,
      activitySource: adjust !== 0 || profile.calibrated_at ? "trend_calibrated" : act.source,
      activityFactor: act.factor,
      activityFactorLow: act.factorLow,
      activityFactorHigh: act.factorHigh,
      exerciseKcal: Math.round(act.exerciseKcal),
      missing: act.missing,
      activityKeys: act.keys,
      targetCalories,
      dailyDeltaKcal,
      deficitRatio,
      weeklyRateKg,
      weeklyRateRangeKg,
      paceRequested,
      pace,
      status,
      macros: { proteinG: m.proteinG, fatG: m.fatG, carbsG: m.carbsG },
      proteinPerKg: m.proteinPerKg,
      proteinBasisKg: basisKg,
      proteinBasis: "current",
      notes,
      warnings,
      formulaVersion: FORMULA_VERSION,
    },
  };
}

/** 預覽各檔位（UI 比較用）：每個檔位用同一個 computePlan，唔會有第二套邏輯 */
export interface PacePreview {
  pace: FixedPace;
  allowed: boolean;
  targetCalories: number;
  dailyDeltaKcal: number;
  deficitRatio: number;
  weeklyRateKg: number;
}

export function previewPaces(input: PlanInput): PacePreview[] | null {
  if (input.profile.goal !== "lose") return null;
  const base = computePlan(input);
  if (!base.ok) return null;
  const blocked = base.plan.status === "requires_review";
  const allowed = blocked
    ? []
    : allowedPaces({ senior: base.plan.senior, review: input.profile.risk_review ?? "not_assessed" });
  const out: PacePreview[] = [];
  for (const p of PACE_ORDER) {
    if (allowed.includes(p)) {
      const r = computePlan({ ...input, profile: { ...input.profile, pace: p } });
      if (!r.ok) return null;
      out.push({
        pace: p,
        allowed: true,
        targetCalories: r.plan.targetCalories,
        dailyDeltaKcal: r.plan.dailyDeltaKcal,
        deficitRatio: r.plan.deficitRatio,
        weeklyRateKg: r.plan.weeklyRateKg,
      });
    } else {
      // 唔容許嘅檔位：只顯示名義數字（唔會被採用）
      const delta = -Math.round(base.plan.tdee * PACE_RATIO[p]);
      out.push({
        pace: p,
        allowed: false,
        targetCalories: base.plan.tdee + delta,
        dailyDeltaKcal: delta,
        deficitRatio: PACE_RATIO[p],
        weeklyRateKg: weeklyKg(delta),
      });
    }
  }
  return out;
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
  if (profile.pace === "custom") {
    const c = profile.custom_kcal;
    if (typeof c !== "number" || !Number.isFinite(c)) return "請輸入自訂每日 kcal。";
    if (c < MIN_CALORIES[profile.sex]) {
      return `自訂熱量唔可以低過 ${MIN_CALORIES[profile.sex]} kcal（安全下限）。`;
    }
  }
  if (profile.goal === "maintain" || profile.goal === "recomp") return null;

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

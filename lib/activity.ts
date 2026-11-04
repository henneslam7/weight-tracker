// 活動量估算（TDEE 嘅活動調整）。純函數，唔依賴 UI。
//
// ⚠ 呢度所有係數都係「產品啟發式假設」，唔係已驗證嘅步數 → TDEE 醫學公式：
//   - 步數範圍表：見 STEP_TABLE（來自需求文件 §3.3）
//   - 工作性質偏移、運動 MET、重複計算折扣：我按需求文件原則寫嘅初版，未經營養專業審核
//   - 全部會喺結果標明「信心：低／中」，並預留 trend_calibrated（體重趨勢校準）
//
// TDEE = RMR × 活動倍率（已包含日常步行同非運動活動）＋ 額外固定運動消耗（淨值，已扣靜止部分）
// 唔會再將步數 kcal 或食物熱效應重複加落去（需求 B08）。

import type {
  ActivityLevel,
  ExerciseInSteps,
  ExerciseKind,
  Intensity,
  StepCoverage,
  StepSource,
  StepsRange,
  WorkActivity,
} from "./types.ts";

/** 舊版單一活動量倍率（只用嚟做「冇問卷資料」時嘅低信心後備） */
export const LEGACY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};
export const LEGACY_HALF_WIDTH = 0.075;

type KnownRange = Exclude<StepsRange, "unknown">;

/** 每日平均步數 → 初始倍率範圍（需求 §3.3；以坐為主、冇正式運動、步數可靠嘅 MVP 假設） */
export const STEP_TABLE: Record<KnownRange, readonly [number, number]> = {
  lt3000: [1.2, 1.25],
  "3000_4999": [1.2, 1.3],
  "5000_6999": [1.25, 1.35],
  "7000_9999": [1.3, 1.45],
  gte10000: [1.4, 1.6],
};

export const STEP_LABEL: Record<StepsRange, string> = {
  lt3000: "少過 3,000 步",
  "3000_4999": "3,000–4,999 步",
  "5000_6999": "5,000–6,999 步",
  "7000_9999": "7,000–9,999 步",
  gte10000: "10,000 步或以上",
  unknown: "唔清楚",
};

/** 工作性質令倍率範圍整體上移（產品假設，待校準） */
export const WORK_SHIFT: Record<WorkActivity, number> = {
  mostly_sitting: 0,
  mixed: 0.025,
  standing_walking: 0.05,
  manual_labor: 0.1,
  unknown: 0,
};
/** 工作性質唔明：倍率範圍上限加闊，反映「可能更活躍」嘅不確定性 */
export const UNKNOWN_WORK_EXTRA_HIGH = 0.05;

/** 起始活動假設嘅描述（需求 §6：只係引導，唔係硬規則） */
export const ACTIVITY_DESC: Record<StepsRange, string> = {
  lt3000: "很低活動",
  "3000_4999": "久坐至低活動",
  "5000_6999": "低至輕度活動",
  "7000_9999": "較多日常活動",
  gte10000: "較多步行",
  unknown: "活動量未明",
};

export function stepsRangeFromMean(n: number): KnownRange {
  if (n < 3000) return "lt3000";
  if (n < 5000) return "3000_4999";
  if (n < 7000) return "5000_6999";
  if (n < 10000) return "7000_9999";
  return "gte10000";
}

/** 運動 MET（概約值，未逐項對照 Compendium）。淨消耗 = (MET − 1) × 體重 × 小時 */
const MET: Record<Exclude<ExerciseKind, "none">, Record<Intensity, number>> = {
  resistance: { light: 3.5, moderate: 5, vigorous: 6 },
  cardio: { light: 4, moderate: 6, vigorous: 9 },
  mixed: { light: 3.75, moderate: 5.5, vigorous: 7.5 },
  other: { light: 4, moderate: 5, vigorous: 7 },
};
export function exerciseMet(kind: Exclude<ExerciseKind, "none">, intensity: Intensity): number {
  return MET[kind][intensity];
}

export interface ActivityInput {
  stepsRange?: StepsRange | null;
  /** 過去 4 星期平均步數（精確數字，優先過範圍） */
  meanSteps28d?: number | null;
  stepSource?: StepSource | null;
  stepCoverage?: StepCoverage | null;
  workActivity?: WorkActivity | null;
  exerciseType?: ExerciseKind | null;
  sessionsPerWeek?: number | null;
  minutesPerSession?: number | null;
  intensity?: Intensity | null;
  exerciseIncludedInSteps?: ExerciseInSteps | null;
  /** 舊版單一活動量（只喺冇步數資料時用） */
  legacyLevel?: ActivityLevel | null;
}

export type ActivitySource = "questionnaire_heuristic" | "device_assisted" | "legacy_level" | "user_override" | "trend_calibrated";
/**
 * 活動資料完整度（唔係 TDEE 準確度，亦唔係統計信心）：
 * limited = 資料有缺（舊級別、工作性質唔明、運動重疊唔肯定、裝置覆蓋低）；good = 問卷資料齊。
 * TDEE 嘅「校準狀態」另外由體重趨勢決定（見 lib/calibration.ts），單靠問卷永遠係「未校準」。
 */
export type DataQuality = "limited" | "good";

export interface ActivityEstimate {
  status: "ok" | "needs_user_input";
  /** 仲欠咩資料（用嚟顯示「補充資料」） */
  missing: string[];
  factor: number;
  factorLow: number;
  factorHigh: number;
  /** 額外固定運動嘅每日淨消耗（kcal） */
  exerciseKcal: number;
  exerciseKcalLow: number;
  exerciseKcalHigh: number;
  source: ActivitySource;
  dataQuality: DataQuality;
  /** 解釋用 key，UI 用 */
  keys: string[];
  stepsRange: StepsRange | null;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function estimateActivity(i: ActivityInput, weightKg: number): ActivityEstimate {
  const keys: string[] = [];
  const missing: string[] = [];
  const base = {
    exerciseKcal: 0,
    exerciseKcalLow: 0,
    exerciseKcalHigh: 0,
  };

  const exact = typeof i.meanSteps28d === "number" && Number.isFinite(i.meanSteps28d) && i.meanSteps28d > 0;
  const range: KnownRange | null = exact
    ? stepsRangeFromMean(i.meanSteps28d as number)
    : i.stepsRange && i.stepsRange !== "unknown"
      ? i.stepsRange
      : null;

  // ── 冇步數資料：用舊版單一活動量做低信心後備，否則要求補充 ──
  if (!range) {
    if (i.legacyLevel) {
      const f = LEGACY_FACTORS[i.legacyLevel];
      return {
        ...base,
        status: "ok",
        missing: ["steps_range", "work_activity"],
        factor: f,
        factorLow: r3(f - LEGACY_HALF_WIDTH),
        factorHigh: r3(f + LEGACY_HALF_WIDTH),
        source: "legacy_level",
        dataQuality: "limited",
        keys: ["legacy_level"],
        stepsRange: null,
      };
    }
    return { ...base, status: "needs_user_input", missing: ["steps_range"], factor: 0, factorLow: 0, factorHigh: 0, source: "questionnaire_heuristic", dataQuality: "limited", keys: [], stepsRange: null };
  }

  // ── 步數範圍 ＋ 工作性質 ──
  const work: WorkActivity = i.workActivity ?? "unknown";
  const [lo, hi] = STEP_TABLE[range];
  const shift = WORK_SHIFT[work];
  const factor = r3((lo + hi) / 2 + shift);
  let factorLow = r3(lo + shift);
  let factorHigh = r3(hi + shift);
  if (work === "unknown") {
    factorHigh = r3(factorHigh + UNKNOWN_WORK_EXTRA_HIGH);
    missing.push("work_activity");
    keys.push("work_unknown");
  }
  if (range === "gte10000" && work === "unknown") keys.push("high_steps_need_work");   // 唔可以單靠步數定級

  const deviceExact = exact && i.stepSource === "device" && i.stepCoverage === "high";

  // ── 額外固定運動（淨值）──
  let exerciseKcal = 0;
  let exerciseLow = 0;
  let exerciseHigh = 0;
  let exerciseUncertain = false;
  const kind = i.exerciseType ?? "none";
  const sessions = clamp(Math.round(i.sessionsPerWeek ?? 0), 0, 14);
  const minutes = clamp(Math.round(i.minutesPerSession ?? 0), 0, 300);
  if (kind !== "none" && sessions > 0 && minutes > 0 && weightKg > 0) {
    const intensity: Intensity = i.intensity ?? "moderate";
    if (!i.intensity) {
      missing.push("exercise_intensity");
      keys.push("intensity_assumed_moderate");
    }
    const perDay = (sessions / 7) * minutes * ((exerciseMet(kind, intensity) - 1) * weightKg) / 60;
    // 步行類運動（帶氧）如果已經計入每日步數，就唔再加（避免重複計算）
    const inSteps = i.exerciseIncludedInSteps ?? "unknown";
    const walkLike = kind === "cardio" || kind === "mixed";
    let share = 1;
    if (walkLike) {
      const full = kind === "cardio" ? 1 : 0.5;     // 混合運動只有一半係步行類
      if (inSteps === "yes") share = 1 - full;
      else if (inSteps === "no") share = 1;
      else {
        share = 1 - full / 2;
        exerciseUncertain = true;
        missing.push("exercise_included_in_steps");
        keys.push("exercise_steps_overlap_unknown");
      }
    }
    exerciseKcal = perDay * share;
    exerciseLow = exerciseUncertain ? perDay * (1 - (walkLike ? (kind === "cardio" ? 1 : 0.5) : 0)) * 0.75 : exerciseKcal * 0.75;
    exerciseHigh = exerciseUncertain ? perDay * 1.25 : exerciseKcal * 1.25;
    keys.push("exercise_added");
  }

  const dataQuality: DataQuality =
    work !== "unknown" && !exerciseUncertain && i.stepCoverage !== "low" && i.stepSource !== "estimate" ? "good" : "limited";

  return {
    status: "ok",
    missing,
    factor,
    factorLow,
    factorHigh,
    exerciseKcal,
    exerciseKcalLow: exerciseLow,
    exerciseKcalHigh: exerciseHigh,
    source: deviceExact ? "device_assisted" : "questionnaire_heuristic",
    dataQuality,
    keys,
    stepsRange: range,
  };
}

export type Sex = "male" | "female";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";
/** recomp = 體態重組（減脂＋增肌）：接近維持量、輕微赤字、高蛋白、要重訓 */
export type Goal = "lose" | "maintain" | "gain" | "recomp";

export type StepsRange = "lt3000" | "3000_4999" | "5000_6999" | "7000_9999" | "gte10000" | "unknown";
export type WorkActivity = "mostly_sitting" | "mixed" | "standing_walking" | "manual_labor" | "unknown";
export type ExerciseKind = "none" | "resistance" | "cardio" | "mixed" | "other";
export type Intensity = "light" | "moderate" | "vigorous";
export type ExerciseInSteps = "yes" | "no" | "unknown";
export type StepSource = "device" | "manual" | "estimate";
export type StepCoverage = "high" | "medium" | "low";
export type Pace = "gentle" | "standard" | "faster" | "custom";
export type FixedPaceLike = Exclude<Pace, "custom">;
/** TDEE 校準狀態：只由體重趨勢／食物記錄決定，單靠問卷永遠係 uncalibrated */
export type CalibrationStatus = "uncalibrated" | "trend_only" | "initially_calibrated";
/** 安全篩查結果：clear = 已答、冇風險；needs_review = 有風險，要專業評估；not_assessed = 未答／唔想答（唔當安全） */
export type RiskReview = "clear" | "needs_review" | "not_assessed";

export interface Profile {
  sex: Sex;
  birth_date: string; // YYYY-MM-DD（本地日期）
  height_cm: number;
  /** 舊版單一活動量。新版用問卷；冇問卷資料時先用呢個做低信心估算 */
  activity_level: ActivityLevel | null;
  goal: Goal;
  target_weight_kg: number | null;
  weekly_rate_kg: number | null;
  // ── TDEE v2（全部可選：未跑 schema_tdee.sql 之前唔存在）──
  steps_range?: StepsRange | null;
  mean_steps_28d?: number | null;
  step_source?: StepSource | null;
  step_coverage?: StepCoverage | null;
  work_activity?: WorkActivity | null;
  exercise_type?: ExerciseKind | null;
  exercise_sessions_per_week?: number | null;
  exercise_minutes?: number | null;
  exercise_intensity?: Intensity | null;
  exercise_included_in_steps?: ExerciseInSteps | null;
  pace?: Pace | null;
  custom_kcal?: number | null;
  risk_review?: RiskReview | null;
  formula_version?: string | null;
  /** 按體重趨勢校準而加減嘅每日 kcal（−300…+300），冇校準 = 0／null */
  tdee_adjust_kcal?: number | null;
  calibrated_at?: string | null;
}

export interface WeightLog {
  id: string;
  logged_on: string; // YYYY-MM-DD（本地日期）
  weight_kg: number;
}

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type FoodSource = "manual" | "ai" | "saved";

export interface FoodLog {
  id: string;
  logged_on: string; // YYYY-MM-DD（本地日期）
  meal_type: MealType;
  name: string;
  quantity_text: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: FoodSource;
}

export interface SavedMeal {
  id: string;
  name: string;
  quantity_text: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export type ExerciseSource = "met" | "manual";

export interface ExerciseLog {
  id: string;
  logged_on: string; // YYYY-MM-DD（本地日期）
  exercise_type: string;
  name: string;
  duration_min: number | null;
  /** 淨消耗 kcal */
  calories: number;
  source: ExerciseSource;
}

/** 語氣強度：溫柔 / 街坊（預設）/ 毒舌 */
export type Tone = "soft" | "neighbour" | "spicy";
/** 兩個街坊：陳伯、歡嬸 */
export type Who = "chan" | "foon";

export interface UserPrefs {
  tone: Tone;
  /** 係咪容許針對食物嘅 roast */
  food_roast: boolean;
  /** 長者模式：大字、較少 tab */
  elder_mode: boolean;
}

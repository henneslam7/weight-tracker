export type Sex = "male" | "female";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";
export type Goal = "lose" | "maintain" | "gain";

export interface Profile {
  sex: Sex;
  birth_date: string; // YYYY-MM-DD（本地日期）
  height_cm: number;
  activity_level: ActivityLevel;
  goal: Goal;
  target_weight_kg: number | null;
  weekly_rate_kg: number | null;
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

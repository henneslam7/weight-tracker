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

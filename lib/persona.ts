// 語氣設定同「敏感時刻」判斷。敏感時刻一律變溫柔，唔 roast。

import type { Kind } from "./copy.ts";
import { SENIOR_AGE } from "./calc.ts";
import type { Goal, Tone, UserPrefs } from "./types.ts";

export { SENIOR_AGE };

/** 預設設定：長者用溫柔、關咗食物 roast、開長者模式 */
export function defaultPrefs(age: number | null): UserPrefs {
  if (age !== null && age >= SENIOR_AGE) return { tone: "soft", food_roast: false, elder_mode: true };
  return { tone: "neighbour", food_roast: true, elder_mode: false };
}

export function normalizePrefs(raw: Partial<UserPrefs> | null | undefined, age: number | null): UserPrefs {
  const d = defaultPrefs(age);
  if (!raw) return d;
  const tone: Tone = raw.tone === "soft" || raw.tone === "neighbour" || raw.tone === "spicy" ? raw.tone : d.tone;
  return {
    tone,
    food_roast: typeof raw.food_roast === "boolean" ? raw.food_roast : d.food_roast,
    elder_mode: typeof raw.elder_mode === "boolean" ? raw.elder_mode : d.elder_mode,
  };
}

export type SensitiveReason = "cheat" | "senior" | "fast" | "over" | "low" | "returning";

export interface SensitiveInput {
  age: number | null;
  goal: Goal;
  /** 本地小時 0–23 */
  hour: number;
  eatenKcal: number;
  /** 今日上限（已計運動加成） */
  budgetKcal: number;
  /** 每週趨勢 kg/週（負數 = 下降） */
  trendKgPerWeek: number | null;
  /** 距離上一次有記錄嘅日數（唔計今日）；冇記錄 = null */
  daysSinceLastLog: number | null;
  /** 今日係放縱日：兩個街坊好好人，唔 roast */
  cheatToday?: boolean;
}

/**
 * 呢啲情況唔係玩嘢嘅時候：
 *  65 歲或以上、減得太快、超標、傍晚都食得好少、隔咗幾日先返嚟。
 */
export function sensitiveReason(i: SensitiveInput): SensitiveReason | null {
  if (i.cheatToday) return "cheat";
  if (i.age !== null && i.age >= SENIOR_AGE) return "senior";
  if (i.goal === "lose" && i.trendKgPerWeek !== null && i.trendKgPerWeek < -1) return "fast";
  if (i.budgetKcal > 0 && i.eatenKcal > i.budgetKcal) return "over";
  if (i.budgetKcal > 0 && i.hour >= 18 && i.eatenKcal < i.budgetKcal * 0.4) return "low";
  if (i.daysSinceLastLog !== null && i.daysSinceLastLog >= 3) return "returning";
  return null;
}

export function effectiveTone(prefs: UserPrefs, reason: SensitiveReason | null): Tone {
  return reason ? "soft" : prefs.tone;
}

export function roastAllowed(prefs: UserPrefs, reason: SensitiveReason | null): boolean {
  return prefs.food_roast && prefs.tone !== "soft" && reason === null;
}

/** 敏感時刻對應嘅溫柔對白（senior 冇專屬對白，用一般提示） */
export function sensitiveKind(reason: SensitiveReason | null): Kind | null {
  switch (reason) {
    case "cheat": return "cheat";
    case "over": return "over";
    case "low": return "low";
    case "fast": return "fast";
    case "returning": return "welcomeBack";
    default: return null;
  }
}

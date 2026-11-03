// 提醒邏輯（純函數，可測試）。server cron 同測試都用呢度。
//
// 規則：
//  - 每個提醒喺設定時間起 windowMinutes 分鐘內有效（cron 每 5 分鐘行一次，容許延遲）
//  - 同一日同一種提醒只發一次（由 reminder_log 保證，sentToday 傳入）
//  - 智能：已經記咗就唔提醒
//  - 靜音時段內唔發
//  - 夜晚補記：未記體重，或者今日記錄少過 2 餐 → 提醒；連續 N 日冇任何記錄 → 改發「好耐冇見」
//  - 提醒可以提 calories 赤字，但唔責備、唔鼓勵食少過目標

import { APP_NAME, pick, REMINDERS } from "./copy.ts";
import { diffDays } from "./date.ts";
import type { MealType } from "./types.ts";

export type ReminderKind = "weight" | MealType | "evening";

export interface ReminderSettings {
  weight_enabled: boolean;
  weight_time: string;
  breakfast_enabled: boolean;
  breakfast_time: string;
  lunch_enabled: boolean;
  lunch_time: string;
  dinner_enabled: boolean;
  dinner_time: string;
  snack_enabled: boolean;
  snack_time: string;
  evening_enabled: boolean;
  evening_time: string;
  inactive_enabled: boolean;
  inactive_days: number;
  quiet_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
}

export const DEFAULT_SETTINGS: ReminderSettings = {
  weight_enabled: true,
  weight_time: "07:30",
  breakfast_enabled: true,
  breakfast_time: "08:30",
  lunch_enabled: true,
  lunch_time: "12:30",
  dinner_enabled: true,
  dinner_time: "19:00",
  snack_enabled: false,
  snack_time: "16:00",
  evening_enabled: true,
  evening_time: "21:00",
  inactive_enabled: true,
  inactive_days: 3,
  quiet_enabled: true,
  quiet_start: "23:00",
  quiet_end: "07:00",
};

export interface DecideInput {
  nowDate: string; // YYYY-MM-DD（香港）
  nowTime: string; // HH:MM（香港）
  settings: ReminderSettings;
  weightLoggedToday: boolean;
  mealsLoggedToday: ReadonlySet<MealType>;
  /** 最近一次記錄（體重或食物）嘅日期 */
  lastLogDate: string | null;
  sentToday: ReadonlySet<string>;
  windowMinutes?: number;
}

export interface DueReminder {
  kind: ReminderKind;
  title: string;
  body: string;
  url: string;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** 靜音時段（可跨午夜，例如 23:00–07:00） */
export function isQuiet(now: string, start: string, end: string): boolean {
  const n = toMinutes(now);
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === e) return false;
  return s < e ? n >= s && n < e : n >= s || n < e;
}

function isDue(now: string, scheduled: string, windowMinutes: number): boolean {
  const n = toMinutes(now);
  const s = toMinutes(scheduled);
  return n >= s && n < s + windowMinutes;
}

export function decideReminders(input: DecideInput): DueReminder[] {
  const {
    nowDate,
    nowTime,
    settings: s,
    weightLoggedToday,
    mealsLoggedToday,
    lastLogDate,
    sentToday,
    windowMinutes = 60,
  } = input;

  if (s.quiet_enabled && isQuiet(nowTime, s.quiet_start, s.quiet_end)) return [];

  const out: DueReminder[] = [];
  const make = (
    kind: ReminderKind,
    url: string,
    list: readonly string[],
  ): DueReminder => ({
    kind,
    title: APP_NAME,
    body: pick(list, `${nowDate}:${kind}`),
    url,
  });

  // 體重
  if (
    s.weight_enabled &&
    !sentToday.has("weight") &&
    !weightLoggedToday &&
    isDue(nowTime, s.weight_time, windowMinutes)
  ) {
    out.push(make("weight", "/?tab=weight", REMINDERS.weight));
  }

  // 餐單
  const meals: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
  for (const meal of meals) {
    if (
      s[`${meal}_enabled`] &&
      !sentToday.has(meal) &&
      !mealsLoggedToday.has(meal) &&
      isDue(nowTime, s[`${meal}_time`], windowMinutes)
    ) {
      out.push(make(meal, `/?tab=food&meal=${meal}`, REMINDERS.meal[meal]));
    }
  }

  // 夜晚補記 / 好耐冇記
  if (
    s.evening_enabled &&
    !sentToday.has("evening") &&
    isDue(nowTime, s.evening_time, windowMinutes)
  ) {
    const inactive =
      s.inactive_enabled &&
      (lastLogDate === null || diffDays(lastLogDate, nowDate) >= s.inactive_days);
    const missing = !weightLoggedToday || mealsLoggedToday.size < 2;
    if (inactive) {
      out.push(make("evening", "/?tab=today", REMINDERS.inactive));
    } else if (missing) {
      out.push(make("evening", "/?tab=today", REMINDERS.eveningCatchUp));
    }
  }

  return out;
}

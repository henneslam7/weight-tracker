// 所有「林峯風格」鼓勵文案集中喺呢度。
// 規則：
//  1. 只鼓勵習慣同進度，唔羞辱體型。可以提 calories 赤字（減脂核心），但唔鼓勵食少過目標。
//  2. 減得太快（> 1 kg／週）會轉為認真提醒，唔再打氣。
//  3. 安全限制、免責聲明用認真語氣，唔玩嘢（見 components/ui.ts DISCLAIMER）。

import type { Goal, MealType } from "./types.ts";

export const APP_NAME = "Fit 過林峯";
export const APP_SHORT_NAME = "Fit過林峯";
export const TAGLINE = "同林峯一樣靚仔，仲要 fit 過佢";
export const LOADING_TEXT = "林峯熱身中…";

export function greeting(hour: number): string {
  if (hour < 5) return "夜深喇，靚仔要瞓夠先會靚";
  if (hour < 12) return "早晨靚仔";
  if (hour < 18) return "午安靚仔";
  return "晚安靚仔";
}

// ───────────── 體重 ─────────────

export const WEIGHT_NOT_LOGGED = {
  title: "今日未上磅",
  sub: "林峯靠自律，你都得！撳呢度記錄 →",
};

export const WEIGHT_EMPTY = "未有記錄，今日就係 fit 過林峯嘅第一日。";
export const WEIGHT_NEED_MORE = "多記幾日體重，就睇到你幾時追過林峯。";

const SAVED_MESSAGES = [
  "已記錄！又靚仔咗一啲。",
  "記低咗！自律嘅人最靚仔。",
  "搞掂！離 fit 過林峯又近一步。",
] as const;

/** 用日期做種子揀一句，同一日顯示一致 */
export function pick<T>(list: readonly T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

export function savedMessage(seed: string): string {
  return pick(SAVED_MESSAGES, seed);
}

/** 每週趨勢（kg/週）對應嘅一句話 */
export function trendMessage(goal: Goal, trend: number | null): string {
  if (trend === null) return WEIGHT_NEED_MORE;

  // 減得太快：唔打氣，改為提醒
  if (goal === "lose" && trend < -1) {
    return "跌得有啲快喎。靚仔都要食夠、瞓夠，有需要請同醫生或註冊營養師傾下。";
  }

  if (goal === "lose") {
    if (trend <= -0.1) return "趨勢跌緊，啱晒靚仔路線！";
    if (trend < 0.1) return "體重企穩，繼續保持習慣，靚仔唔急一時。";
    return "今個星期上咗少少，唔緊要，繼續記錄，唔好放棄。";
  }
  if (goal === "gain") {
    if (trend >= 0.1) return "肌肉儲緊，趨勢正確！";
    return "增肌要耐性：食夠、練夠、瞓夠。";
  }
  if (Math.abs(trend) <= 0.2) return "穩定如林峯，keep 住！";
  return "有少少浮動，留意飲食同作息就得。";
}

/** 距離目標 */
export function goalMessage(
  goal: Goal,
  weightKg: number,
  targetKg: number | null,
): string | null {
  if (targetKg === null || goal === "maintain") return null;
  const reached = goal === "lose" ? weightKg <= targetKg : weightKg >= targetKg;
  if (reached) return "達標！你而家 fit 過林峯！";
  const dist = Math.round(Math.abs(weightKg - targetKg) * 10) / 10;
  return `距離目標仲有 ${dist} kg，fit 過林峯指日可待`;
}

// ───────────── 食物 ─────────────

export const FOOD_EMPTY = "今日未記錄食物。記低第一餐，離 fit 過林峯又近一步。";

/** 今日攝取 vs 目標。超標只講事實同鼓勵，唔責備、唔叫人少食。 */
export function intakeMessage(eaten: number, target: number): string {
  if (eaten <= 0) return "未記錄任何食物";
  if (eaten <= target) return `仲有 ${Math.round(target - eaten)} kcal 可以食`;
  return `今日多咗 ${Math.round(eaten - target)} kcal，唔緊要，聽日繼續記錄就得`;
}

export const AI_ESTIMATE_NOTE =
  "AI 估算，份量同 calories 可能有出入。請逐項檢查，改啱先儲存。";

// ───────────── 提醒 ─────────────

export const REMINDERS = {
  weight: [
    "早晨！起身上磅記錄，睇下赤字有冇做到，靚仔由數據開始。",
    "上咗磅未？數據唔會呃人，赤字有冇效一睇便知。",
  ],
  meal: {
    breakfast: [
      "早餐記低先，每日 calories 赤字要記錄先控制得到。",
      "記錄早餐，一日之計喺於晨。",
    ],
    lunch: [
      "午餐食咩？記低佢，赤字控制得好，離 fit 過林峯又近一步。",
      "午餐時間！記一記，赤字靠記錄先睇得清。",
    ],
    dinner: [
      "晚餐記低未？今日赤字夠唔夠，記完就知。",
      "晚餐食咗未？記低佢，今日就圓滿。",
    ],
    snack: [
      "小食都記低，記得越齊，計得越準。",
      "有食小食？記一筆，唔使有壓力。",
    ],
  } satisfies Record<MealType, readonly string[]>,
  eveningCatchUp: [
    "夜晚喇，今日有冇漏記？補返先瞓，有記錄先計得準赤字。",
  ],
  inactive: [
    "好耐冇見你喎。返嚟記一筆，由今日再起步，唔緊要，重新開始就得。",
  ],
} as const;

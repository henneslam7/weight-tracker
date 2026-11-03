// 安全篩查：只算「結果」，唔儲存任何具體病史（私隱）。
// 任何一題答「有」或者「唔想答」→ needs_review（唔提供減脂速度，建議先同專業人士傾）。
// ⚠ 題目清單係產品初版，需要醫護／註冊營養師審核先算完整。

import type { RiskReview, Sex } from "./types.ts";

export type Answer = "no" | "yes" | "prefer_not";

export interface ScreenQuestion {
  id: string;
  text: string;
  /** 只對某性別顯示（冇寫 = 全部） */
  only?: Sex;
}

export const SCREEN_QUESTIONS: readonly ScreenQuestion[] = [
  { id: "pregnancy", text: "你而家有冇懷孕、懷疑懷孕或者餵母乳？", only: "female" },
  { id: "medical", text: "你有冇醫生診斷嘅腎病、糖尿病、心臟病或其他需要控制飲食嘅長期病？" },
  { id: "meds", text: "你有冇用緊會影響食慾或體重嘅藥物（例如 GLP-1 類減重／糖尿藥、類固醇）？" },
  { id: "eating_disorder", text: "你以前或者而家有冇飲食失調（厭食、暴食、催吐等）嘅經歷？" },
  { id: "rapid_loss", text: "最近 3 個月有冇無意中急速減重（例如超過 5% 體重）？" },
] as const;

/** 呢位用戶要答嘅題目 */
export function questionsFor(sex: Sex): readonly ScreenQuestion[] {
  return SCREEN_QUESTIONS.filter((q) => !q.only || q.only === sex);
}

/**
 * 由答案計出結果。
 * - 有題目未答 → not_assessed（唔當安全）
 * - 任何「有」或「唔想答」→ needs_review
 * - 全部答「冇」→ clear
 */
export function screenRisk(sex: Sex, answers: Record<string, Answer | undefined>): RiskReview {
  const qs = questionsFor(sex);
  let unanswered = false;
  for (const q of qs) {
    const a = answers[q.id];
    if (a === undefined) unanswered = true;
    else if (a === "yes" || a === "prefer_not") return "needs_review";
  }
  return unanswered ? "not_assessed" : "clear";
}

// 「點解係呢個數」：由 Plan 產生廣東話解釋行，UI 直接顯示。純函數。
// 用語：TDEE 只係「估算」；範圍係「唔同活動假設下嘅估算情境」，唔係統計信賴區間。

import { STEP_LABEL } from "./activity.ts";
import { PACE_LABEL, type Plan } from "./calc.ts";
import { STATUS_TEXT } from "./calibration.ts";
import type { Profile } from "./types.ts";

const MISSING_TEXT: Record<string, string> = {
  steps_range: "平均每日步數",
  work_activity: "工作性質（坐定／企／體力）",
  exercise_intensity: "運動強度",
  exercise_included_in_steps: "運動有冇已計入步數",
};

export const missingText = (keys: string[]) => keys.map((k) => MISSING_TEXT[k] ?? k);

export function weeklyText(kg: number): string {
  if (Math.abs(kg) < 0.025) return "體重大致不變";
  const a = Math.abs(Math.round(kg * 20) / 20); // 約至 0.05 kg
  return `${kg < 0 ? "約減" : "約增"} ${a.toFixed(2)} kg／週（粗略估算）`;
}

/** 校準狀態文字 */
export function calibrationText(plan: Plan): { label: string; note: string } {
  return STATUS_TEXT[plan.calibrationStatus];
}

export function explainPlan(plan: Plan, profile: Profile): string[] {
  const out: string[] = [];
  const sexNote = profile.sex === "male" ? "+5" : "−161";
  out.push(
    `基礎代謝 ${plan.bmr} kcal：Mifflin-St Jeor ＝ 10×體重 ＋ 6.25×身高 − 5×年齡 ${sexNote}（呢個係公式參數，唔係性別認同；公式有適用限制）。`,
  );

  if (plan.activitySource === "legacy_level") {
    out.push(`活動量用咗你舊設定嘅單一級別（倍率 ${plan.activityFactor}），好粗略。填返步數同工作性質，估算會合理啲。`);
  } else {
    const steps = profile.mean_steps_28d
      ? `約 ${Math.round(profile.mean_steps_28d).toLocaleString()} 步`
      : profile.steps_range
        ? STEP_LABEL[profile.steps_range]
        : "";
    out.push(
      `起始活動假設：${steps}${steps ? " ＋ " : ""}工作性質 → 倍率約 ${plan.activityFactor}（情境 ${plan.activityFactorLow}–${plan.activityFactorHigh}）。呢啲係產品起始假設，步數唔可以精準推算消耗。`,
    );
  }
  if (plan.exerciseKcal > 0) {
    out.push(`每日額外運動消耗約 ${plan.exerciseKcal} kcal（已扣走靜止部分；步行類運動如已計入步數，唔會重複計）。`);
  }
  if (plan.tdeeAdjustKcal !== 0) {
    out.push(`已按體重趨勢校準調整 ${plan.tdeeAdjustKcal > 0 ? "+" : ""}${plan.tdeeAdjustKcal} kcal${plan.calibratedAt ? `（${plan.calibratedAt.slice(0, 10)}）` : ""}。`);
  }
  out.push(
    `每日總消耗（TDEE）約 ${plan.tdee} kcal；唔同活動假設下嘅估算情境 ${plan.tdeeLow}–${plan.tdeeHigh} kcal。呢個唔係統計信賴區間，亦唔係實測值。`,
  );

  if (plan.status === "requires_review") {
    out.push("需要先經專業人士評估，所以唔設赤字，目標熱量 ＝ 維持量。");
  } else if (profile.goal === "recomp") {
    out.push(
      `體態重組：每日少食約 ${-plan.dailyDeltaKcal} kcal（約 ${Math.round(plan.deficitRatio * 1000) / 10}%，輕微赤字），加高蛋白同重量訓練，目標係脂肪減、肌肉增，體重大致不變。`,
    );
  } else if (plan.dailyDeltaKcal < 0) {
    out.push(
      `赤字 ＝ TDEE − 目標攝取 ＝ ${plan.tdee} − ${plan.targetCalories} ＝ ${-plan.dailyDeltaKcal} kcal（相對 TDEE 約 ${Math.round(plan.deficitRatio * 1000) / 10}%）${plan.pace ? `，檔位「${PACE_LABEL[plan.pace]}」` : ""}。`,
    );
    out.push(`每週體重變化 ≈ 赤字 × 7 ÷ 7,700 → ${weeklyText(plan.weeklyRateKg)}。呢個只係靜態粗略算法，唔係保證，亦唔係長期線性預測。`);
  } else if (plan.dailyDeltaKcal > 0) {
    out.push(`熱量盈餘 ${plan.dailyDeltaKcal} kcal（目標高過 TDEE）→ ${weeklyText(plan.weeklyRateKg)}。`);
  }
  const [a, b] = plan.weeklyRateRangeKg;
  if (plan.dailyDeltaKcal !== 0 && Math.abs(b - a) >= 0.1) {
    out.push(`因為消耗有不確定性，實際每週變化可以喺 ${Math.abs(a).toFixed(2)} 至 ${Math.abs(b).toFixed(2)} kg 之間（${a < 0 || b < 0 ? "減" : "增"}）。`);
  }
  out.push(
    `蛋白質 ${plan.macros.proteinG} g ＝ ${plan.proteinPerKg} g/kg × ${plan.proteinBasisKg} kg（現時體重）；脂肪約 25% 熱量，其餘係碳水。三大營養素加埋 ${plan.macroKcal} kcal${plan.kcalRoundingDelta !== 0 ? `，同目標差 ${plan.kcalRoundingDelta > 0 ? "+" : ""}${plan.kcalRoundingDelta} kcal（克數取整）` : ""}。`,
  );
  const cs = calibrationText(plan);
  out.push(`校準狀態：${cs.label} — ${cs.note}。${plan.calibratedAt ? `上次校準：${plan.calibratedAt.slice(0, 10)}。` : ""}資料完整度：${plan.dataQuality === "good" ? "問卷資料齊" : "有資料欠缺，見上面「補充資料」"}。`);
  out.push("連續記錄 2–3 星期後，可以按體重趨勢同食物記錄校準；所有倍率同運動係數都係產品估算，唔係醫學診斷。");
  return out;
}

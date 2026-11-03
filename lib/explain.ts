// 「點解係呢個數」：由 Plan 產生廣東話解釋行，UI 直接顯示。純函數。

import { STEP_LABEL } from "./activity.ts";
import { PACE_LABEL, type Plan } from "./calc.ts";
import type { Profile } from "./types.ts";

const CONF: Record<Plan["confidence"], string> = {
  low: "低",
  medium: "中",
  higher: "較高",
};
export const confidenceText = (c: Plan["confidence"]) => CONF[c];

const MISSING_TEXT: Record<string, string> = {
  steps_range: "平均每日步數",
  work_activity: "工作性質（坐定／企／體力）",
  exercise_intensity: "運動強度",
  exercise_included_in_steps: "運動有冇已計入步數",
};

export const missingText = (keys: string[]) => keys.map((k) => MISSING_TEXT[k] ?? k);

export function weeklyText(kg: number): string {
  if (kg === 0) return "體重大致不變";
  const a = Math.abs(Math.round(kg * 20) / 20); // 約至 0.05 kg
  return `${kg < 0 ? "約減" : "約增"} ${a.toFixed(2)} kg／週（粗略估計）`;
}

export function explainPlan(plan: Plan, profile: Profile): string[] {
  const out: string[] = [];
  out.push(`基礎代謝 ${plan.bmr} kcal（Mifflin-St Jeor：按你嘅性別、年齡、身高、體重計）。`);

  if (plan.activitySource === "legacy_level") {
    out.push(
      `活動量用咗你舊設定嘅單一級別（倍率 ${plan.activityFactor}），好粗略。填返步數同工作性質，估算會準啲。`,
    );
  } else {
    const steps = profile.mean_steps_28d
      ? `約 ${Math.round(profile.mean_steps_28d).toLocaleString()} 步`
      : profile.steps_range
        ? STEP_LABEL[profile.steps_range]
        : "";
    out.push(`日常活動：${steps}${steps ? " ＋ " : ""}工作性質 → 活動倍率約 ${plan.activityFactor}（範圍 ${plan.activityFactorLow}–${plan.activityFactorHigh}）。`);
  }
  if (plan.exerciseKcal > 0) {
    out.push(`每日額外運動消耗約 ${plan.exerciseKcal} kcal（已扣走靜止部分；步行類運動如已計入步數，唔會重複計）。`);
  }
  out.push(`每日總消耗約 ${plan.tdee} kcal，合理範圍 ${plan.tdeeLow}–${plan.tdeeHigh} kcal。信心：${CONF[plan.confidence]}。`);

  if (plan.status === "requires_review") {
    out.push("需要先經專業人士評估，所以唔設赤字，目標熱量 = 維持量。");
  } else if (plan.dailyDeltaKcal < 0) {
    out.push(
      `${plan.pace ? `「${PACE_LABEL[plan.pace]}」` : ""}每日少食約 ${-plan.dailyDeltaKcal} kcal（約 ${Math.round(plan.deficitRatio * 1000) / 10}% 赤字）→ ${weeklyText(plan.weeklyRateKg)}。`,
    );
  } else if (plan.dailyDeltaKcal > 0) {
    out.push(`每日多食約 ${plan.dailyDeltaKcal} kcal → ${weeklyText(plan.weeklyRateKg)}。`);
  }
  const [a, b] = plan.weeklyRateRangeKg;
  if (plan.dailyDeltaKcal !== 0 && Math.abs(b - a) >= 0.1) {
    out.push(`因為消耗有不確定性，實際每週變化可以喺 ${a.toFixed(2)} 至 ${b.toFixed(2)} kg 之間。`);
  }
  out.push(
    `蛋白質 ${plan.macros.proteinG} g ＝ ${plan.proteinPerKg} g/kg × ${plan.proteinBasisKg} kg（${plan.proteinBasis === "target" ? "按目標體重" : "按現時體重"}）；脂肪約 25% 熱量，其餘係碳水。`,
  );
  out.push("所有倍率同運動係數都係產品估算，唔係醫學診斷；用 2–4 星期嘅體重趨勢校準最準。");
  return out;
}

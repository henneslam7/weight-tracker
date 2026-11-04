// npm run test:tdee3 — 對應 TDEE_App_Improvement_Plan_Claude_Handover_2026-11-04.md §10 嘅 T01–T25
import assert from "node:assert/strict";
import { calibrateTdee, type IntakeDay } from "../lib/calibration.ts";
import {
  calcBmr,
  calculateEnergyPlan,
  computePlan,
  KCAL_PER_KG,
  MIN_CALORIES,
  weeklyGoalAdvice,
} from "../lib/calc.ts";
import { explainPlan } from "../lib/explain.ts";
import { macroKcal, MACRO_TOLERANCE_KCAL, rebalanceMacros } from "../lib/macros.ts";
import { weightSignals } from "../lib/calibration.ts";
import type { Profile, WeightLog } from "../lib/types.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    throw e;
  }
}
const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

const TODAY = "2026-11-04";
// 文件案例：男 31 歲、175cm、96kg、5,000–7,000 步、冇額外運動
const base: Profile = {
  sex: "male", birth_date: "1995-06-01", height_cm: 175, activity_level: null, goal: "lose", target_weight_kg: 85, weekly_rate_kg: null,
  steps_range: "5000_6999", work_activity: "mostly_sitting", exercise_type: "none", pace: "custom", custom_kcal: 1900, risk_review: "clear",
};
const W = 96;
const plan = (p: Partial<Profile> = {}, w = W, signals?: { weightSpanDays: number; weightCount: number }) => {
  const r = computePlan({ profile: { ...base, ...p }, weightKg: w, today: TODAY, signals });
  assert.ok(r.ok, r.ok ? "" : r.reason);
  return r.plan;
};

console.log("文件 §10 T01–T25");
test("T01 BMR raw 1903.75；display 1904", () => {
  near(calcBmr("male", 96, 175, 31), 1903.75);
  assert.equal(plan().bmr, 1904);
});
test("T02/T03 BMR × 1.375 = 2618；× 1.30 = 2475", () => {
  assert.equal(Math.round(1903.75 * 1.375), 2618);
  assert.equal(Math.round(1903.75 * 1.3), 2475);
  assert.equal(plan().tdee, 2475);
});
test("T04–T07 赤字：588.66／445.88／574.88；23.23%", () => {
  const a = calculateEnergyPlan(2617.65625, 2029);
  const b = calculateEnergyPlan(2474.875, 2029);
  const c = calculateEnergyPlan(2474.875, 1900);
  assert.ok(a.ok && b.ok && c.ok);
  if (!a.ok || !b.ok || !c.ok) return;
  near(a.deficitKcal, 588.66, 0.01);
  assert.equal(Math.round(a.deficitKcal), 589);
  near(b.deficitKcal, 445.875, 0.001);
  assert.equal(Math.round(b.deficitKcal), 446);
  near(c.deficitKcal, 574.875, 0.001);
  assert.equal(Math.round(c.deficitKcal), 575);
  near(c.deficitPct, 23.23, 0.01);
  assert.equal(c.method, "static_7700_heuristic");
  assert.equal(c.estimated, true);
});
test("T08–T11 宏量：1901／1900／1850／1800 kcal；1 kcal 取整差唔係 bug（≤ 10）", () => {
  assert.equal(macroKcal(150, 170, 69), 1901);
  assert.equal(macroKcal(150, 190, 60), 1900);
  assert.equal(macroKcal(150, 155, 70), 1850);
  assert.equal(macroKcal(150, 165, 60), 1800);
  const p = plan();
  assert.ok(Math.abs(p.kcalRoundingDelta) <= 2);
  assert.equal(p.macroKcal, macroKcal(p.macros.proteinG, p.macros.carbsG, p.macros.fatG));
  assert.ok(Math.abs(p.macroKcal - 1900) <= MACRO_TOLERANCE_KCAL);
});
test("T12 5,000–7,000 步 ＋ 冇運動：唔強制 1.375；解釋起始假設", () => {
  const p = plan();
  assert.equal(p.activityFactor, 1.3);
  assert.notEqual(p.activityFactor, 1.375);
  const ex = explainPlan(p, { ...base }).join("\n");
  assert.ok(ex.includes("起始活動假設") && ex.includes("產品起始假設") && ex.includes("唔可以精準推算"));
  assert.equal(p.scenarioDescription, "低至輕度活動（尚未校準）");
});
test("T13 切換攝取 2029 → 1900：赤字、%、每週估算、宏量全部同步", () => {
  const a = plan({ custom_kcal: 2029 });
  const b = plan({ custom_kcal: 1900 });
  assert.equal(a.targetCalories, 2029);
  assert.equal(b.targetCalories, 1900);
  assert.equal(a.dailyDeltaKcal, -446);
  assert.equal(b.dailyDeltaKcal, -575);
  near(a.deficitRatio * 100, 18.0, 0.1);
  near(b.deficitRatio * 100, 23.2, 0.1);
  near(a.weeklyRateKg, -0.4, 0.01);
  near(b.weeklyRateKg, -0.52, 0.01);
  for (const p of [a, b]) assert.ok(Math.abs(p.macroKcal - p.targetCalories) <= MACRO_TOLERANCE_KCAL);
  assert.ok(a.macros.carbsG !== b.macros.carbsG);
});
test("T14 只有 3 日體重 → 保持「未校準」，唔標高信心", () => {
  const w: WeightLog[] = [0, 1, 2].map((i) => ({ id: String(i), logged_on: `2026-11-0${2 + i}`, weight_kg: 96 }));
  const p = plan({}, W, weightSignals(w, TODAY));
  assert.equal(p.calibrationStatus, "uncalibrated");
});
test("T15 體重 21 日完整、飲食大部分漏記 → 狀態「已有體重趨勢」，但唔當可靠 TDEE 校準", () => {
  const days = Array.from({ length: 21 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 9, 14 + i));
    return d.toISOString().slice(0, 10);
  });
  const w: WeightLog[] = days.map((d, i) => ({ id: String(i), logged_on: d, weight_kg: 96 - i * 0.03 }));
  const p = plan({}, W, weightSignals(w, TODAY));
  assert.equal(p.calibrationStatus, "trend_only");
  // 21 日只有 5 日完整
  const intake: IntakeDay[] = days.map((d, i) => ({ date: d, kcal: 1900, complete: i % 4 === 0 }));
  const r = calibrateTdee({ currentTdee: p.tdee, currentAdjustKcal: 0, weights: w, intake, today: TODAY });
  assert.equal(r.status, "insufficient_data");
  assert.equal(r.status === "insufficient_data" && r.reason, "intake_incomplete");
});
test("T16 一日異常增重 1.5 kg → 唔會即刻減 300 kcal（排除異常、逐步、≤ 150）", () => {
  const d = (off: number) => new Date(Date.UTC(2026, 9, 31 + off)).toISOString().slice(0, 10);
  const wl = (off: number, kg: number): WeightLog => ({ id: String(off), logged_on: d(off), weight_kg: kg });
  const weights = [
    ...Array.from({ length: 7 }, (_, i) => wl(-13 + i, 96.0)),
    ...Array.from({ length: 6 }, (_, i) => wl(-6 + i, 95.5)),
    wl(0, 97.5), // +2 kg 單日
  ];
  const intake: IntakeDay[] = Array.from({ length: 14 }, (_, i) => ({ date: d(-13 + i), kcal: 1900, complete: true }));
  const r = calibrateTdee({ currentTdee: 2475, currentAdjustKcal: 0, weights, intake, today: "2026-11-01" });
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.ok(r.outliersExcluded >= 1);
  assert.equal(r.stepKcal, 0);
  assert.ok(Math.abs(r.stepKcal) <= 150);
});
test("T17 已計入步數嘅跑步 ＋ 跑步運動記錄 → 唔重複計算", () => {
  const none = plan();
  const run = plan({ exercise_type: "cardio", exercise_sessions_per_week: 3, exercise_minutes: 40, exercise_intensity: "moderate", exercise_included_in_steps: "yes" });
  assert.equal(run.tdee, none.tdee);
  assert.equal(run.exerciseKcal, 0);
});
test("T18 目標攝取高過 TDEE → 正確顯示熱量盈餘，唔寫「負減脂」", () => {
  const r = calculateEnergyPlan(2475, 2800);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.direction, "surplus");
  assert.ok(r.deficitKcal < 0 && r.estimatedWeeklyChangeKg < 0);
  const p = plan({ goal: "gain", pace: null, custom_kcal: null, weekly_rate_kg: 0.5, target_weight_kg: 100 });
  assert.ok(p.dailyDeltaKcal > 0 && p.weeklyRateKg > 0);
  assert.ok(explainPlan(p, { ...base, goal: "gain" }).join("").includes("熱量盈餘"));
  assert.equal(calculateEnergyPlan(2475, 2475).ok && (calculateEnergyPlan(2475, 2475) as { direction: string }).direction, "maintenance");
});
test("T19 非常低熱量目標 → 擋住、解釋、提供替代方案／專業建議", () => {
  const p = plan({ custom_kcal: 1000 });
  assert.equal(p.status, "blocked");
  assert.ok(p.targetCalories >= MIN_CALORIES.male);
  const w = p.warnings.join("");
  assert.ok(w.includes("下限") && w.includes("後備") && w.includes("醫生"));
});
test("T20 腎病／要專業評估 → 唔預設高蛋白；提示專業評估", () => {
  const p = plan({ risk_review: "needs_review" });
  assert.equal(p.status, "requires_review");
  assert.ok(p.proteinPerKg <= 0.85, String(p.proteinPerKg));
  assert.ok(p.macros.proteinG <= Math.round(0.8 * W) + 1);
  assert.ok(p.notes.some((n) => n.includes("唔預設高蛋白")) && p.warnings.some((n) => n.includes("醫生")));
  assert.ok(plan().proteinPerKg >= 1.5); // 正常成人先係 ~1.6 g/kg
});
test("T21 改體重／年齡 → BMR、TDEE、赤字、宏量全部同步", () => {
  const a = plan();
  const b = plan({}, 90);
  const c = plan({ birth_date: "1985-06-01" });
  for (const x of [b, c]) {
    assert.notEqual(x.bmr, a.bmr);
    assert.notEqual(x.tdee, a.tdee);
    assert.ok(Math.abs(x.macroKcal - x.targetCalories) <= MACRO_TOLERANCE_KCAL);
  }
  assert.notEqual(b.dailyDeltaKcal, a.dailyDeltaKcal); // 目標 kcal 固定，TDEE 變咗，赤字跟住變
});
test("T22 非法值（負體重、0cm、NaN、壞日期）→ 拒絕，唔生成數值", () => {
  for (const w of [-5, 0, NaN]) assert.equal(computePlan({ profile: base, weightKg: w, today: TODAY }).ok, false, String(w));
  assert.equal(computePlan({ profile: { ...base, height_cm: 0 }, weightKg: W, today: TODAY }).ok, false);
  assert.equal(computePlan({ profile: { ...base, birth_date: "abc" }, weightKg: W, today: TODAY }).ok, false);
  assert.equal(calculateEnergyPlan(0, 1900).ok, false);
  assert.equal(calculateEnergyPlan(NaN, 1900).ok, false);
  assert.equal(calculateEnergyPlan(2475, -1).ok, false);
});
test("T23 四捨五入差 1 kcal → 顯示合理，不出假錯誤", () => {
  const p = plan();
  assert.ok(Math.abs(p.kcalRoundingDelta) <= MACRO_TOLERANCE_KCAL);
  assert.equal(p.warnings.some((w) => /宏量|營養素.*差/.test(w)), false);
  assert.equal(macroKcal(120, 261, 56) - 2029, -1); // 舊 App：差 1 kcal
});
test("T24 冇運動記錄但有體力勞動工作 → 同純久坐者唔同", () => {
  const sit = plan({ work_activity: "mostly_sitting" });
  const man = plan({ work_activity: "manual_labor" });
  assert.ok(man.tdee > sit.tdee + 150);
});
test("T25 要求「必定每週瘦 1 kg」→ 提醒估算唔可保證、安全優先", () => {
  const a = weeklyGoalAdvice({ tdee: 2475, kgPerWeek: 1, sex: "male", senior: false, review: "clear" });
  assert.equal(a.allowed, false);
  assert.ok(a.messages.some((m) => m.includes("唔係保證")));
  assert.ok(a.messages.some((m) => m.includes("下限")));
  assert.equal(a.intakeKcal, Math.round(2475 - (1 * KCAL_PER_KG) / 7));
  const ok = weeklyGoalAdvice({ tdee: 2475, kgPerWeek: 0.5, sex: "male", senior: false, review: "clear" });
  assert.equal(ok.allowed, true);
  assert.ok(ok.messages[0].includes("唔係保證"));
  assert.equal(weeklyGoalAdvice({ tdee: 2475, kgPerWeek: 0.5, sex: "male", senior: false, review: "needs_review" }).allowed, false);
});

console.log("文件 §4 / §3 其他");
test("§4：TDEE 2,475：1,900 = 23.2%、1,850 = 25.3%、1,800 = 27.3%；2,029 = 18.0%", () => {
  const pct = (i: number) => (calculateEnergyPlan(2475, i) as { deficitPct: number }).deficitPct;
  near(pct(2029), 18.0, 0.05);
  near(pct(1900), 23.2, 0.05);
  near(pct(1850), 25.3, 0.05);
  near(pct(1800), 27.3, 0.05);
  const tiers = [2029, 1900, 1850, 1800].map((i) => (calculateEnergyPlan(2475, i) as { tier: string }).tier);
  assert.deepEqual(tiers, ["normal", "progressive", "caution", "caution"]);
});
test("§3.2：情境表 1.20 / 1.25 / 1.30 / 1.35 / 1.375 → 2285／2380／2475／2570／2618", () => {
  const e = [1.2, 1.25, 1.3, 1.35, 1.375].map((f) => Math.round(1903.75 * f));
  assert.deepEqual(e, [2285, 2380, 2475, 2570, 2618]);
  const p = plan();
  assert.equal(p.tdeeLow, 2380);
  assert.equal(p.tdeeHigh, 2570);
});
test("§8：範圍字眼唔係「合理範圍／信賴區間」；狀態用未校準／已有體重趨勢／已初步校準", () => {
  const src = explainPlan(plan(), base).join("\n");
  assert.ok(!src.includes("合理範圍") && !src.includes("信心：") && !/[0-9]%\s*信心/.test(src));
  assert.ok(src.includes("唔同活動假設下嘅估算情境"));
});
test("§4.4 鎖定營養素後配平：鎖蛋白質 150、脂肪 60 → 碳水 190（= 1,900 kcal）", () => {
  const r = rebalanceMacros({ targetKcal: 1900, protein: 150, carbs: 0, fat: 60, locked: ["protein", "fat"] });
  assert.ok(r.ok);
  assert.equal(r.carbs, 190);
  assert.equal(r.kcal, 1900);
  const f = rebalanceMacros({ targetKcal: 1900, protein: 150, carbs: 170, fat: 0, locked: ["protein", "carbs"] });
  assert.ok(f.ok && Math.abs(f.kcal - 1900) <= 5);
  // 配唔平：明確講，唔暗中改鎖定嘅克數
  const bad = rebalanceMacros({ targetKcal: 1500, protein: 300, carbs: 0, fat: 100, locked: ["protein", "fat"] });
  assert.equal(bad.ok, false);
  assert.equal(bad.protein, 300);
  assert.equal(bad.fat, 100);
  assert.ok(bad.reason);
  assert.equal(rebalanceMacros({ targetKcal: 1900, protein: 150, carbs: 190, fat: 60, locked: ["protein", "carbs", "fat"] }).ok, true);
  assert.equal(rebalanceMacros({ targetKcal: 1900, protein: 150, carbs: 300, fat: 60, locked: ["protein", "carbs", "fat"] }).ok, false);
});

console.log(`\n${passed} 項測試全部通過`);

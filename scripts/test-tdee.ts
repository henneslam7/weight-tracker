// npm run test:tdee（Node >= 22.6）
// TDEE v2 驗收測試：對應需求文件 §10 嘅 A01–A13、B01–B12 同邊界測試。
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { estimateActivity, STEP_TABLE } from "../lib/activity.ts";
import { calibrateTdee, type IntakeDay } from "../lib/calibration.ts";
import {
  allowedPaces,
  calcBmr,
  computePlan,
  deficitFor,
  FORMULA_VERSION,
  kcalForWeeklyLoss,
  calculateEnergyPlan,
  CAUTION_DEFICIT_RATIO,
  tierOf,
  weeklyGoalAdvice,
  MIN_CALORIES,
  paceFromRate,
  previewPaces,
  validateProfile,
} from "../lib/calc.ts";
import { explainPlan } from "../lib/explain.ts";
import { legacyNumbers } from "../lib/legacy.ts";
import { allocateMacros, checkMacros, macroKcal, MACRO_TOLERANCE_KCAL, rebalanceMacros } from "../lib/macros.ts";
import { questionsFor, screenRisk } from "../lib/screening.ts";
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

const TODAY = "2026-11-03";
// 需求文件嘅例子：男、31 歲、175cm、96kg
const base: Profile = {
  sex: "male",
  birth_date: "1995-06-01",
  height_cm: 175,
  activity_level: null,
  goal: "lose",
  target_weight_kg: 85,
  weekly_rate_kg: null,
  steps_range: "5000_6999",
  work_activity: "mostly_sitting",
  exercise_type: "none",
  pace: "standard",
  risk_review: "clear",
};
const W = 96;
const plan = (p: Partial<Profile> = {}, w = W) => {
  const r = computePlan({ profile: { ...base, ...p }, weightKg: w, today: TODAY });
  assert.ok(r.ok, r.ok ? "" : r.reason);
  return r.plan;
};

console.log("A：數值驗算");
test("A01 RMR = 1903.75（UI 1904）", () => {
  near(calcBmr("male", 96, 175, 31), 1903.75);
  assert.equal(plan().bmr, 1904);
});
test("A02 舊 1.375 倍率 = 2617.65625（UI 2618）", () => {
  near(1903.75 * 1.375, 2617.65625);
  assert.equal(Math.round(1903.75 * 1.375), 2618);
});
test("A03 新 1.30 倍率 = 2474.875（UI 2475）：步數 5,000–6,999 ＋ 坐為主", () => {
  const e = estimateActivity({ stepsRange: "5000_6999", workActivity: "mostly_sitting" }, W);
  near(e.factor, 1.3);
  near(1903.75 * e.factor, 2474.875);
  assert.equal(plan().tdee, 2475);
});
test("A04 / A05 範圍 1.25 → 2380、1.35 → 2570", () => {
  const e = estimateActivity({ stepsRange: "5000_6999", workActivity: "mostly_sitting" }, W);
  near(e.factorLow, 1.25);
  near(e.factorHigh, 1.35);
  const p = plan();
  assert.equal(p.tdeeLow, 2380);
  assert.equal(p.tdeeHigh, 2570);
});
test("A06–A09 宏量 kcal 總和（含原 App 173/194/55 = 1963）", () => {
  assert.equal(macroKcal(173, 194, 55), 1963);
  assert.equal(macroKcal(160, 195, 70), 2050);
  assert.equal(macroKcal(160, 180, 60), 1900);
  assert.equal(macroKcal(160, 155, 60), 1800);
});
test("A10 TDEE 2475、攝取 1900 → 赤字 575 ≈ 23.2%，未超 25%", () => {
  const d = deficitFor(2475, 1900);
  assert.equal(d.deficitKcal, 575);
  near(d.ratio, 0.2323, 0.0005);
  assert.equal(d.caution, false);
  assert.equal(d.tier, "progressive");
});
test("A11 攝取 1800 → 赤字 675 ≈ 27.3%，屬審慎區（> 25%）", () => {
  const d = deficitFor(2475, 1800);
  assert.equal(d.deficitKcal, 675);
  near(d.ratio, 0.2727, 0.0005);
  assert.equal(d.caution, true);
  assert.equal(d.tier, "caution");
});
test("A12 / A13 週預測：575 → 約 0.52；舊 655 → 約 0.60 kg/週", () => {
  near((575 * 7) / 7700, 0.5227, 0.001);
  near((655 * 7) / 7700, 0.5955, 0.001);
});
test("A13b 舊 App 數字：同一個人用舊邏輯 → TDEE 2618、赤字 655（25% cap）、蛋白質 173", () => {
  const l = legacyNumbers({ ...base, activity_level: "light", weekly_rate_kg: 0.75 }, W, TODAY);
  assert.ok(l);
  assert.equal(l.tdee, 2618);
  assert.equal(l.dailyDeltaKcal, -655);
  assert.equal(l.targetCalories, 1963);
  assert.equal(l.proteinG, 173);
});

console.log("B：行為");
test("B01 由冇運動 → 每週重訓 3 次：TDEE 上升，並重新評估", () => {
  const a = plan({ exercise_type: "none" });
  const b = plan({
    exercise_type: "resistance",
    exercise_sessions_per_week: 3,
    exercise_minutes: 60,
    exercise_intensity: "moderate",
  });
  assert.ok(b.tdee > a.tdee + 50, `${a.tdee} → ${b.tdee}`);
  assert.ok(b.exerciseKcal > 0 && a.exerciseKcal === 0);
});
test("B02 步數 6,000 ＋ 工作不明 → 未校準、資料有缺、情境範圍闊過已知工作；唔稱精確", () => {
  const known = plan({ work_activity: "mostly_sitting" });
  const p = plan({ work_activity: "unknown" });
  assert.equal(p.calibrationStatus, "uncalibrated");
  assert.equal(p.dataQuality, "limited");
  assert.ok(p.missing.includes("work_activity"));
  assert.ok(p.tdeeHigh - p.tdeeLow > known.tdeeHigh - known.tdeeLow);
  const ex = explainPlan(p, { ...base, work_activity: "unknown" }).join("\n");
  assert.ok(ex.includes("未校準") && ex.includes("唔係統計信賴區間"));
});
test("B03 想每週減 1 kg → 反推熱量低過下限 → 自訂被擋、有警告、改用後備檔位", () => {
  const tdee = plan().tdee;
  const kcal = kcalForWeeklyLoss(tdee, 1);
  assert.ok(kcal < MIN_CALORIES.male || deficitFor(tdee, kcal).caution);
  const p = plan({ pace: "custom", custom_kcal: Math.round(kcal) });
  assert.equal(p.status, "blocked");
  assert.ok(p.warnings.some((w) => w.includes("冇被採用")));
  assert.ok(p.targetCalories >= MIN_CALORIES.male);
  assert.ok(p.deficitRatio <= CAUTION_DEFICIT_RATIO);
  assert.notEqual(p.targetCalories, Math.round(kcal));
});
test("B04 蛋白質 ＋ 脂肪超過總熱量 → 拒絕", () => {
  assert.ok(checkMacros({ targetKcal: 1500, proteinG: 250, carbsG: 0, fatG: 100 }));
  assert.ok(checkMacros({ targetKcal: 1900, proteinG: 160, carbsG: 180, fatG: 60 }) === null);
  assert.ok(checkMacros({ targetKcal: 1900, proteinG: 160, carbsG: 300, fatG: 60 }));
  assert.ok(checkMacros({ targetKcal: 1900, proteinG: -1, carbsG: 300, fatG: 60 }));
});
test("B05 性別切換：+5 / −161", () => {
  near(calcBmr("male", 70, 170, 30) - calcBmr("female", 70, 170, 30), 166);
  assert.ok(plan({ sex: "male" }).bmr - plan({ sex: "female" }).bmr === 166);
});
test("B06 改體重／年齡／身高 → 重新計算；公式版本跟住", () => {
  const a = plan();
  assert.notEqual(plan({}, 90).bmr, a.bmr);
  assert.notEqual(plan({ birth_date: "1985-06-01" }).bmr, a.bmr);
  assert.notEqual(plan({ height_cm: 185 }).bmr, a.bmr);
  assert.equal(a.formulaVersion, FORMULA_VERSION);
});
const dstr = (off: number) => {
  const d = new Date(Date.UTC(2026, 9, 31)); // 2026-10-31 為最後一日
  d.setUTCDate(d.getUTCDate() + off);
  return d.toISOString().slice(0, 10);
};
const wlog = (off: number, kg: number): WeightLog => ({ id: String(off), logged_on: dstr(off), weight_kg: kg });
const idays = (from: number, to: number, kcal: number, complete = true): IntakeDay[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ date: dstr(from + i), kcal, complete }));
const CAL_TODAY = "2026-11-01";
test("B07 記錄不足（只有 3 日體重／窗口唔夠 4 次）→ 唔出校準結果", () => {
  const r = calibrateTdee({ currentTdee: 2475, currentAdjustKcal: 0, weights: [wlog(-2, 96), wlog(-1, 95.9), wlog(0, 95.8)], intake: idays(-2, 0, 1900), today: CAL_TODAY });
  assert.equal(r.status, "insufficient_data");
  assert.equal(r.status === "insufficient_data" && r.reason, "weights_few");
});
test("B07b 資料足夠 → 出建議：逐步（≤ 150）、取整；兩個 7 日窗口平均", () => {
  // 舊窗口 96.0，新窗口 95.5（每週 −0.5 kg），14 日完整攝取 1900 → 反推 TDEE ≈ 2450
  const weights = [...Array.from({ length: 7 }, (_, i) => wlog(-13 + i, 96.0)), ...Array.from({ length: 7 }, (_, i) => wlog(-6 + i, 95.5))];
  const r = calibrateTdee({ currentTdee: 2475, currentAdjustKcal: 0, weights, intake: idays(-13, 0, 1900), today: CAL_TODAY });
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  near(r.weeklyChangeKg, -0.5, 0.01);
  assert.ok(Math.abs(r.observedTdee - 2450) <= 2);
  assert.equal(r.stepKcal, 0); // 差距 < 75 kcal：唔調
  // 實際消耗遠低於估算：食 1900、體重冇跌 → 反推 1900，建議減，但每次最多 150
  const flat = [...Array.from({ length: 7 }, (_, i) => wlog(-13 + i, 96.0)), ...Array.from({ length: 7 }, (_, i) => wlog(-6 + i, 96.0))];
  const r2 = calibrateTdee({ currentTdee: 2475, currentAdjustKcal: 0, weights: flat, intake: idays(-13, 0, 1900), today: CAL_TODAY });
  assert.equal(r2.status, "ok");
  if (r2.status !== "ok") return;
  assert.equal(r2.stepKcal, -150);
  assert.equal(r2.newAdjustKcal, -150);
  // 累計最多 ±300
  const r3 = calibrateTdee({ currentTdee: 2475 - 250, currentAdjustKcal: -250, weights: flat, intake: idays(-13, 0, 1400), today: CAL_TODAY });
  assert.equal(r3.status === "ok" && r3.newAdjustKcal, -300);
});
test("B07c 太密（< 14 日）／兩個星期差距離譜 → 唔校準", () => {
  const w = [...Array.from({ length: 7 }, (_, i) => wlog(-13 + i, 96.0)), ...Array.from({ length: 7 }, (_, i) => wlog(-6 + i, 96.0))];
  const soon = calibrateTdee({ currentTdee: 2475, currentAdjustKcal: 0, weights: w, intake: idays(-13, 0, 1900), today: CAL_TODAY, lastCalibratedAt: "2026-10-25T00:00:00Z" });
  assert.equal(soon.status === "insufficient_data" && soon.reason, "too_soon");
  const jump = [...Array.from({ length: 7 }, (_, i) => wlog(-13 + i, 96.0)), ...Array.from({ length: 7 }, (_, i) => wlog(-6 + i, 93.0))];
  const r = calibrateTdee({ currentTdee: 2475, currentAdjustKcal: 0, weights: jump, intake: idays(-13, 0, 1900), today: CAL_TODAY });
  assert.equal(r.status === "insufficient_data" && r.reason, "implausible");
});
test("已套用校準：tdee 加減調整；狀態 initially_calibrated；調整夾喺 ±300", () => {
  const a = plan({ tdee_adjust_kcal: -100, calibrated_at: "2026-10-20T00:00:00Z" });
  assert.equal(a.tdee, 2475 - 100);
  assert.equal(a.calibrationStatus, "initially_calibrated");
  assert.equal(a.activitySource, "trend_calibrated");
  assert.equal(a.tdeeLow, 2380 - 100);
  assert.equal(plan({ tdee_adjust_kcal: 999, calibrated_at: "2026-10-20T00:00:00Z" }).tdeeAdjustKcal, 300);
  assert.equal(plan().calibrationStatus, "uncalibrated");
  assert.equal(plan().tdeeAdjustKcal, 0);
});
test("B08 步行類運動已計入步數 → 唔重複加；重訓照加", () => {
  const none = plan();
  const cardioIn = plan({ exercise_type: "cardio", exercise_sessions_per_week: 4, exercise_minutes: 45, exercise_intensity: "moderate", exercise_included_in_steps: "yes" });
  const cardioOut = plan({ exercise_type: "cardio", exercise_sessions_per_week: 4, exercise_minutes: 45, exercise_intensity: "moderate", exercise_included_in_steps: "no" });
  const cardioUnk = plan({ exercise_type: "cardio", exercise_sessions_per_week: 4, exercise_minutes: 45, exercise_intensity: "moderate", exercise_included_in_steps: "unknown" });
  const weights = plan({ exercise_type: "resistance", exercise_sessions_per_week: 4, exercise_minutes: 45, exercise_intensity: "moderate", exercise_included_in_steps: "yes" });
  assert.equal(cardioIn.tdee, none.tdee);
  assert.ok(cardioOut.exerciseKcal > 0);
  assert.ok(cardioUnk.exerciseKcal > 0 && cardioUnk.exerciseKcal < cardioOut.exerciseKcal);
  assert.equal(cardioUnk.dataQuality, "limited");
  assert.ok(weights.exerciseKcal > 0);
});
test("B09 唯一入口：目標熱量只由 lib/calc.ts 產生（UI／API 共用 computePlan）", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const n of readdirSync(dir)) {
      if (["node_modules", ".next", ".git", "scripts"].includes(n)) continue;
      const f = join(dir, n);
      if (statSync(f).isDirectory()) walk(f);
      else if (/\.(ts|tsx)$/.test(n)) {
        const src = readFileSync(f, "utf8");
        const own = /lib\/(calc|legacy|activity)\.ts$/.test(f);
        if (!own && /\b(calcTdee|calcBmr|estimateActivity|PACE_RATIO)\b/.test(src.replace(/import[^;]*;/g, ""))) offenders.push(f);
      }
    }
  };
  walk(new URL("..", import.meta.url).pathname);
  // components/lib 入面除咗 explain／calc 系列，唔應該自己計 BMR／TDEE
  assert.deepEqual(offenders.filter((f) => !/lib\/(explain|calibration)\.ts$/.test(f)), []);
});
test("B09b 任何輸入（fuzz）：目標 ≥ 下限（或 TDEE）、65+ ≤ 15%、未通過篩查 ≤ 25%、宏量 ≤ 10 kcal", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  for (let n = 0; n < 4000; n++) {
    const sex = pick(["male", "female"] as const);
    const year = 1935 + Math.floor(rnd() * 80);
    const w = 35 + rnd() * 140;
    const p: Profile = {
      sex,
      birth_date: `${year}-0${1 + Math.floor(rnd() * 9)}-15`,
      height_cm: 140 + Math.floor(rnd() * 60),
      activity_level: pick([null, "sedentary", "light", "moderate", "active", "very_active"] as const),
      goal: pick(["lose", "maintain", "gain", "recomp"] as const),
      target_weight_kg: w - 5,
      weekly_rate_kg: pick([null, 0.25, 0.5, 0.75, 1, 2] as const),
      steps_range: pick(["lt3000", "3000_4999", "5000_6999", "7000_9999", "gte10000", "unknown", null] as const),
      work_activity: pick(["mostly_sitting", "mixed", "standing_walking", "manual_labor", "unknown", null] as const),
      exercise_type: pick(["none", "resistance", "cardio", "mixed", "other", null] as const),
      exercise_sessions_per_week: Math.floor(rnd() * 8),
      exercise_minutes: Math.floor(rnd() * 120),
      exercise_intensity: pick(["light", "moderate", "vigorous", null] as const),
      exercise_included_in_steps: pick(["yes", "no", "unknown", null] as const),
      pace: pick(["gentle", "standard", "faster", "custom", null] as const),
      custom_kcal: pick([null, 500, 900, 1199, 1200, 1500, 1800, 2500, 4000] as const),
      risk_review: pick(["clear", "needs_review", "not_assessed", null] as const),
    };
    const r = computePlan({ profile: p, weightKg: w, today: TODAY });
    if (!r.ok) continue;
    const x = r.plan;
    assert.ok(x.targetCalories >= Math.min(MIN_CALORIES[sex], x.tdee) - 1, JSON.stringify({ p, x }));
    if (p.goal === "lose") {
      // 唔設百分比硬上限：65+ ≤ 15%；未通過篩查 ≤ 25%；其餘只受 calories 下限限制
      if (x.senior) assert.ok(x.deficitRatio <= 0.15 + 0.002, `ratio ${x.deficitRatio} ${JSON.stringify(p)}`);
      else if (p.risk_review !== "clear") assert.ok(x.deficitRatio <= CAUTION_DEFICIT_RATIO + 0.002, `ratio ${x.deficitRatio} ${JSON.stringify(p)}`);
      if (x.status === "requires_review") assert.equal(x.dailyDeltaKcal, 0);
    }
    if (p.goal === "recomp") {
      assert.ok(x.deficitRatio <= 0.051, `recomp ratio ${x.deficitRatio}`);
      assert.ok(x.dailyDeltaKcal <= 0);
      if (x.status === "requires_review") assert.equal(x.dailyDeltaKcal, 0);
    }
    const e = Math.abs(macroKcal(x.macros.proteinG, x.macros.carbsG, x.macros.fatG) - x.targetCalories);
    assert.ok(e <= MACRO_TOLERANCE_KCAL, `macro err ${e} ${JSON.stringify({ p, x })}`);
    assert.ok(x.macros.carbsG >= 0 && x.macros.proteinG > 0 && x.macros.fatG > 0);
  }
});
test("B10 未成年／孕哺／疾病／飲食失調 → 唔出減脂處方", () => {
  const minor = computePlan({ profile: { ...base, birth_date: "2012-01-01" }, weightKg: 60, today: TODAY });
  assert.equal(minor.ok, false);
  const ans = (o: Record<string, "no" | "yes" | "prefer_not">) => ({ pregnancy: "no", medical: "no", meds: "no", eating_disorder: "no", rapid_loss: "no", ...o }) as Record<string, "no" | "yes" | "prefer_not">;
  assert.equal(screenRisk("female", ans({})), "clear");
  for (const k of ["pregnancy", "medical", "meds", "eating_disorder", "rapid_loss"]) {
    assert.equal(screenRisk("female", ans({ [k]: "yes" })), "needs_review", k);
  }
  assert.equal(screenRisk("female", ans({ medical: "prefer_not" })), "needs_review");
  assert.equal(screenRisk("male", { medical: "no", meds: "no", eating_disorder: "no", rapid_loss: "no" }), "clear");
  assert.ok(!questionsFor("male").some((q) => q.id === "pregnancy"));
  assert.equal(screenRisk("male", { medical: "no" }), "not_assessed");
  const p = plan({ risk_review: "needs_review", pace: "faster" });
  assert.equal(p.status, "requires_review");
  assert.equal(p.dailyDeltaKcal, 0);
  assert.equal(p.targetCalories, p.tdee);
  assert.ok(p.warnings.length > 0);
});
test("B11 切換檔位／自訂 kcal 後，宏量加埋 = 目標熱量", () => {
  for (const pace of ["gentle", "standard", "faster"] as const) {
    const p = plan({ pace, risk_review: "clear" });
    assert.ok(Math.abs(macroKcal(p.macros.proteinG, p.macros.carbsG, p.macros.fatG) - p.targetCalories) <= MACRO_TOLERANCE_KCAL);
    assert.equal(checkMacros({ targetKcal: p.targetCalories, ...p.macros }), null);
  }
  const c = plan({ pace: "custom", custom_kcal: 1900 });
  assert.equal(c.targetCalories, 1900);
  assert.equal(c.status, "ok");
  assert.ok(Math.abs(macroKcal(c.macros.proteinG, c.macros.carbsG, c.macros.fatG) - 1900) <= MACRO_TOLERANCE_KCAL);
});
test("B12 未知步數及運動：有舊級別 → 低信心暫定值；全部欠 → 要求補充（唔扮高信心）", () => {
  const legacy = plan({ steps_range: null, work_activity: null, activity_level: "light" });
  assert.equal(legacy.calibrationStatus, "uncalibrated");
  assert.equal(legacy.dataQuality, "limited");
  assert.equal(legacy.activitySource, "legacy_level");
  assert.ok(legacy.missing.includes("steps_range"));
  const r = computePlan({ profile: { ...base, steps_range: "unknown", activity_level: null }, weightKg: W, today: TODAY });
  assert.equal(r.ok, false);
});

console.log("政策／透明度");
test("較進取（22.5%）：已通過篩查先容許；未通過／65+ 就明確降級（唔靜靜雞）；BMI 唔再係門檻", () => {
  assert.equal(plan({ pace: "faster", risk_review: "clear" }).pace, "faster");
  const na = plan({ pace: "faster", risk_review: "not_assessed" });
  assert.equal(na.pace, "standard");
  assert.equal(na.status, "capped");
  assert.equal(na.paceRequested, "faster");
  assert.ok(na.warnings.some((w) => w.includes("改用")));
  const senior = plan({ pace: "standard", birth_date: "1955-01-01" });
  assert.equal(senior.pace, "gentle");
  assert.ok(senior.deficitRatio <= 0.15);
  assert.equal(plan({ pace: "faster" }, 62).pace, "faster");
  assert.ok(plan({ pace: "faster" }).warnings.some((w) => w.includes("較進取")));
});
test("審慎區（赤字 > 25%）：通過篩查嘅成年人可以用自訂 kcal（1,850 / 1,800），有強提醒、唔係預設", () => {
  for (const [kcal, pct] of [[1850, 25.3], [1800, 27.3]] as const) {
    const p = plan({ pace: "custom", custom_kcal: kcal, risk_review: "clear" });
    assert.equal(p.status, "ok", String(kcal));
    assert.equal(p.targetCalories, kcal);
    assert.equal(p.deficitTier, "caution");
    near(p.deficitRatio * 100, pct, 0.1);
    assert.ok(p.warnings.some((w) => w.includes("審慎區")));
  }
  // 預設（standard）唔會去到審慎區
  assert.notEqual(plan({ risk_review: "clear" }).deficitTier, "caution");
  // 未完成／未通過篩查：> 25% 擋，並解釋
  const na = plan({ pace: "custom", custom_kcal: 1800, risk_review: "not_assessed" });
  assert.equal(na.status, "blocked");
  assert.ok(na.warnings.some((w) => w.includes("安全小篩查")));
  assert.notEqual(na.targetCalories, 1800);
  // 65+：15% 上限仍然生效
  const sr = plan({ pace: "custom", custom_kcal: 1700, birth_date: "1955-01-01", risk_review: "clear" });
  assert.equal(sr.status, "blocked");
  // calories 下限永遠生效（唔受篩查影響）
  assert.equal(plan({ pace: "custom", custom_kcal: 1499, risk_review: "clear" }).status, "blocked");
  assert.equal(plan({ pace: "custom", custom_kcal: 1500, risk_review: "clear" }).status, "ok");
  assert.equal(tierOf(0.2), "normal");
  assert.equal(tierOf(0.2501), "caution");
});
test("自訂 kcal：低過下限 / 唔低過 TDEE / 缺失 → 擋，並解釋", () => {
  for (const c of [1000, 1499, 2475, 3000, null]) {
    const p = plan({ pace: "custom", custom_kcal: c });
    assert.equal(p.status, "blocked", String(c));
    assert.ok(p.warnings.length >= 2);
  }
  assert.equal(plan({ pace: "custom", custom_kcal: 1900 }).status, "ok");
});
test("每週變化係粗略估計：附範圍；解釋文字用「約」", () => {
  const p = plan({ work_activity: "unknown" });
  assert.ok(p.weeklyRateRangeKg[0] <= p.weeklyRateKg && p.weeklyRateKg <= p.weeklyRateRangeKg[1]);
  assert.ok(explainPlan(p, { ...base, work_activity: "unknown" }).join("").includes("約"));
});
test("previewPaces 同 computePlan 一致；唔容許嘅檔位標示 allowed=false", () => {
  const input = { profile: { ...base, risk_review: "not_assessed" as const }, weightKg: W, today: TODAY };
  const pv = previewPaces(input);
  assert.ok(pv);
  assert.deepEqual(pv.map((x) => x.allowed), [true, true, false]);
  const std = pv.find((x) => x.pace === "standard")!;
  assert.equal(std.targetCalories, plan({ pace: "standard", risk_review: "not_assessed" }).targetCalories);
  assert.deepEqual(previewPaces({ ...input, profile: { ...input.profile, goal: "maintain" } }), null);
});
test("舊資料 weekly_rate_kg → 檔位對應；allowedPaces", () => {
  assert.equal(paceFromRate(0.25), "gentle");
  assert.equal(paceFromRate(0.5), "standard");
  assert.equal(paceFromRate(0.75), "faster");
  assert.equal(paceFromRate(null), "standard");
  assert.deepEqual(allowedPaces({ senior: true, review: "clear" }), ["gentle"]);
  assert.deepEqual(allowedPaces({ senior: false, review: "not_assessed" }), ["gentle", "standard"]);
  assert.deepEqual(allowedPaces({ senior: false, review: "clear" }), ["gentle", "standard", "faster"]);
});
test("遷移：只有舊欄位嘅 profile 都計到（低信心），有舊 vs 新比較", () => {
  const old: Profile = { sex: "male", birth_date: "1995-06-01", height_cm: 175, activity_level: "light", goal: "lose", target_weight_kg: 85, weekly_rate_kg: 0.75 };
  const r = computePlan({ profile: old, weightKg: W, today: TODAY });
  assert.ok(r.ok);
  assert.equal(r.plan.calibrationStatus, "uncalibrated");
  assert.equal(r.plan.activitySource, "legacy_level");
  assert.equal(r.plan.tdee, 2618); // 倍率仍然 1.375，同舊 app 一致
  assert.equal(r.plan.pace, "standard"); // faster 被降級：未完成篩查
  assert.equal(r.plan.status, "capped");
  const l = legacyNumbers(old, W, TODAY)!;
  assert.ok(l.targetCalories < r.plan.tdee);
});
test("活動估算：精確 28 日步數優先過範圍；步數表邊界", () => {
  const e = estimateActivity({ meanSteps28d: 7000, stepsRange: "lt3000", workActivity: "mostly_sitting", stepSource: "device", stepCoverage: "high" }, W);
  near(e.factor, (STEP_TABLE["7000_9999"][0] + STEP_TABLE["7000_9999"][1]) / 2);
  assert.equal(e.dataQuality, "good");
  assert.equal(e.source, "device_assisted");
  assert.equal(estimateActivity({ meanSteps28d: 6999, workActivity: "mostly_sitting" }, W).stepsRange, "5000_6999");
  assert.equal(estimateActivity({ meanSteps28d: 4999.9, workActivity: "mostly_sitting" }, W).stepsRange, "3000_4999");
  // 高步數但工作不明 → 唔可以單靠步數定級
  const hi = estimateActivity({ stepsRange: "gte10000", workActivity: "unknown" }, W);
  assert.ok(hi.keys.includes("high_steps_need_work"));
  assert.equal(hi.dataQuality, "limited");
  // 覆蓋率低 → 唔會 medium
  assert.equal(estimateActivity({ meanSteps28d: 8000, workActivity: "mixed", stepSource: "device", stepCoverage: "low" }, W).dataQuality, "limited");
});
test("宏量：蛋白質永遠按現時體重並記錄基準；碳水過低先調整蛋白質／脂肪", () => {
  const q = plan({}, 80);
  assert.equal(q.proteinBasis, "current");
  assert.equal(q.proteinBasisKg, 80);
  const obese = plan(); // 96kg：按現時體重（約 150 g），唔再用目標體重
  assert.equal(obese.proteinBasis, "current");
  assert.equal(obese.proteinBasisKg, 96);
  assert.ok(obese.macros.proteinG >= 145 && obese.macros.proteinG <= 156, String(obese.macros.proteinG));
  near(q.proteinPerKg, 1.6, 0.02);
  const m = allocateMacros({ targetKcal: 1200, basisWeightKg: 80, proteinPerKg: 1.6, minProteinPerKg: 1.2, fatRatio: 0.25 });
  assert.ok(m.ok);
  assert.ok(m.carbsG >= 0);
  assert.ok(m.proteinPerKg >= 1.2 - 0.02);
  assert.ok(m.notes.length > 0);
  assert.equal(allocateMacros({ targetKcal: 500, basisWeightKg: 80, proteinPerKg: 1.6, minProteinPerKg: 1.2, fatRatio: 0.25 }).ok, false);
});
test("邊界：體重 0／負、身高 0／負、未來生日、極端步數", () => {
  for (const w of [0, -5, NaN, 5, 1000]) {
    assert.equal(computePlan({ profile: base, weightKg: w, today: TODAY }).ok, false, String(w));
  }
  for (const h of [0, -170, 20, 400]) {
    assert.equal(computePlan({ profile: { ...base, height_cm: h }, weightKg: W, today: TODAY }).ok, false, String(h));
  }
  assert.equal(computePlan({ profile: { ...base, birth_date: "2030-01-01" }, weightKg: W, today: TODAY }).ok, false);
  const huge = plan({ steps_range: null, mean_steps_28d: 500000, work_activity: "manual_labor" });
  assert.ok(huge.tdee < 4 * huge.bmr, "極端步數不應令 TDEE 爆升");
  assert.ok(validateProfile({ profile: { ...base, pace: "custom", custom_kcal: 900 }, currentWeightKg: W, today: TODAY }));
  assert.equal(validateProfile({ profile: { ...base, pace: "custom", custom_kcal: 1900 }, currentWeightKg: W, today: TODAY }), null);
});
test("取整：目標熱量以 5/10/50 取整，宏量仍 ≤ 10 kcal", () => {
  for (const r of [5, 10, 50]) {
    const p = plan();
    const t = Math.round(p.targetCalories / r) * r;
    const m = allocateMacros({ targetKcal: t, basisWeightKg: W, proteinPerKg: 1.6, minProteinPerKg: 1.2, fatRatio: 0.25 });
    assert.ok(Math.abs(m.kcal - t) <= MACRO_TOLERANCE_KCAL);
  }
});

console.log("體態重組（減脂＋增肌）");
const recomp = (p: Partial<Profile> = {}, w = W) =>
  plan({ goal: "recomp", target_weight_kg: null, weekly_rate_kg: null, pace: null, exercise_type: "resistance", exercise_sessions_per_week: 3, exercise_minutes: 60, exercise_intensity: "moderate", ...p }, w);
test("目標熱量 ≈ TDEE 嘅 95%（輕微赤字），蛋白質 1.6 g/kg，宏量一致", () => {
  const p = recomp({}, 80);
  near(p.deficitRatio, 0.05, 0.002);
  assert.equal(p.status, "ok");
  assert.equal(p.proteinPerKg >= 1.55 && p.proteinPerKg <= 1.62, true);
  assert.ok(Math.abs(macroKcal(p.macros.proteinG, p.macros.carbsG, p.macros.fatG) - p.targetCalories) <= MACRO_TOLERANCE_KCAL);
  assert.equal(p.pace, null);
});
test("有重訓（≥2 次）→ 冇提醒；冇重訓 → 有明確提醒但照樣計", () => {
  assert.ok(!recomp({}, 80).warnings.some((w) => w.includes("重量訓練")));
  const none = recomp({ exercise_type: "none", exercise_sessions_per_week: 0 }, 80);
  assert.ok(none.warnings.some((w) => w.includes("重量訓練")));
  assert.ok(none.targetCalories < none.tdee);
  const once = recomp({ exercise_sessions_per_week: 1 }, 80);
  assert.ok(once.warnings.some((w) => w.includes("重量訓練")));
  const cardio = recomp({ exercise_type: "cardio" }, 80);
  assert.ok(cardio.warnings.some((w) => w.includes("重量訓練")));
});
test("篩查要評估／現時 BMI < 18.5 → 唔出赤字；65+ 蛋白質 1.2", () => {
  const r = recomp({ risk_review: "needs_review" }, 80);
  assert.equal(r.status, "requires_review");
  assert.equal(r.dailyDeltaKcal, 0);
  assert.equal(recomp({}, 50).status, "requires_review");
  const s = recomp({ birth_date: "1955-01-01" }, 80);
  assert.ok(s.proteinPerKg <= 1.25);
});
test("calories 下限仍然生效；唔需要目標體重；解釋同提示用語", () => {
  const f = recomp({ sex: "female", height_cm: 150 }, 45);
  assert.ok(f.targetCalories >= Math.min(1200, f.tdee));
  assert.equal(validateProfile({ profile: { ...base, goal: "recomp", target_weight_kg: null, pace: null }, currentWeightKg: 80, today: TODAY }), null);
  const prof = { ...base, goal: "recomp" as const, target_weight_kg: null, pace: null, exercise_type: "resistance" as const, exercise_sessions_per_week: 3, exercise_minutes: 60 };
  assert.ok(explainPlan(recomp({}, 80), prof).some((l) => l.includes("體態重組")));
  assert.equal(previewPaces({ profile: prof, weightKg: 80, today: TODAY }), null);
});

console.log(`\n${passed} 項測試全部通過`);

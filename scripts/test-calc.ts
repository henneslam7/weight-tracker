// npm run test:calc（Node >= 22.6）
import assert from "node:assert/strict";
import {
  ageOn,
  calcBmr,
  calcTdee,
  clampRate,
  computePlan,
  movingAverage,
  validateProfile,
  weeklyTrendKg,
} from "../lib/calc.ts";
import {
  goalMessage,
  pick,
  trendMessage,
  WEIGHT_NEED_MORE,
} from "../lib/copy.ts";
import { addDays, diffDays, isValidDateStr, toDateStr } from "../lib/date.ts";
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

const TODAY = "2026-11-02";
const base: Profile = {
  sex: "male",
  birth_date: "1996-05-10",
  height_cm: 175,
  activity_level: "moderate",
  goal: "maintain",
  target_weight_kg: null,
  weekly_rate_kg: null,
};
const logs = (pairs: [string, number][]): WeightLog[] =>
  pairs.map(([d, w], i) => ({ id: String(i), logged_on: d, weight_kg: w }));

console.log("date");
test("toDateStr 用本地日期", () => {
  assert.equal(toDateStr(new Date(2026, 0, 5, 0, 30)), "2026-01-05");
});
test("diffDays / addDays", () => {
  assert.equal(diffDays("2026-10-30", "2026-11-02"), 3);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
test("isValidDateStr", () => {
  assert.equal(isValidDateStr("2026-02-30"), false);
  assert.equal(isValidDateStr("2026-02-28"), true);
});

console.log("formulas");
test("ageOn：生日未到先少一歲", () => {
  assert.equal(ageOn("1996-05-10", "2026-05-09"), 29);
  assert.equal(ageOn("1996-05-10", "2026-05-10"), 30);
});
test("BMR 男：80kg 175cm 30歲 = 1748.75", () => {
  assert.equal(calcBmr("male", 80, 175, 30), 1748.75);
});
test("BMR 女：60kg 165cm 30歲 = 1320.25", () => {
  assert.equal(calcBmr("female", 60, 165, 30), 1320.25);
});
test("TDEE 活動係數", () => {
  assert.equal(calcTdee(1000, "sedentary"), 1200);
  assert.equal(calcTdee(1000, "very_active"), 1900);
});
test("clampRate 範圍", () => {
  assert.equal(clampRate("lose", 1.5), 0.75);
  assert.equal(clampRate("lose", 0.1), 0.25);
  assert.equal(clampRate("gain", 0.75), 0.5);
  assert.equal(clampRate("maintain", 0.5), 0);
});

console.log("plan");
test("維持：target = TDEE", () => {
  const r = computePlan({ profile: base, weightKg: 80, today: TODAY });
  assert.ok(r.ok);
  assert.equal(r.plan.targetCalories, r.plan.tdee);
  assert.equal(r.plan.dailyDeltaKcal, 0);
});
test("減脂 0.5kg/週 ≈ 550 kcal 赤字", () => {
  const r = computePlan({
    profile: { ...base, goal: "lose", target_weight_kg: 70, weekly_rate_kg: 0.5 },
    weightKg: 80,
    today: TODAY,
  });
  assert.ok(r.ok);
  assert.equal(r.plan.dailyDeltaKcal, -550);
});
test("減脂赤字不超過 TDEE 25%", () => {
  // 女、細隻、少活動：0.75kg/週 ≈ 825 kcal 會超過 25%
  const r = computePlan({
    profile: {
      ...base,
      sex: "female",
      height_cm: 155,
      activity_level: "sedentary",
      goal: "lose",
      target_weight_kg: 50,
      weekly_rate_kg: 0.75,
    },
    weightKg: 65,
    today: TODAY,
  });
  assert.ok(r.ok);
  assert.ok(-r.plan.dailyDeltaKcal <= r.plan.tdee * 0.25 + 1);
});
test("calories 下限：男 1500", () => {
  const r = computePlan({
    profile: {
      ...base,
      height_cm: 160,
      activity_level: "sedentary",
      goal: "lose",
      target_weight_kg: 50,
      weekly_rate_kg: 0.75,
    },
    weightKg: 55,
    today: TODAY,
  });
  assert.ok(r.ok);
  assert.ok(r.plan.targetCalories >= Math.min(1500, r.plan.tdee));
});
test("calories 下限：女 1200", () => {
  const r = computePlan({
    profile: {
      ...base,
      sex: "female",
      height_cm: 150,
      activity_level: "sedentary",
      goal: "lose",
      target_weight_kg: 45,
      weekly_rate_kg: 0.75,
    },
    weightKg: 50,
    today: TODAY,
  });
  assert.ok(r.ok);
  assert.ok(r.plan.targetCalories >= Math.min(1200, r.plan.tdee));
});
test("TDEE 低過下限時減脂唔會變盈餘", () => {
  const r = computePlan({
    profile: {
      ...base,
      sex: "female",
      height_cm: 140,
      activity_level: "sedentary",
      goal: "lose",
      target_weight_kg: 38,
      weekly_rate_kg: 0.5,
    },
    weightKg: 40,
    today: TODAY,
  });
  assert.ok(r.ok);
  assert.ok(r.plan.targetCalories <= r.plan.tdee);
});
test("增肌盈餘最多 0.5kg/週 ≈ 550 kcal", () => {
  const r = computePlan({
    profile: { ...base, goal: "gain", target_weight_kg: 85, weekly_rate_kg: 0.75 },
    weightKg: 75,
    today: TODAY,
  });
  assert.ok(r.ok);
  assert.equal(r.plan.dailyDeltaKcal, 550);
});
test("Macros：蛋白質 1.8g/kg、脂肪 25%", () => {
  const r = computePlan({ profile: base, weightKg: 80, today: TODAY });
  assert.ok(r.ok);
  assert.equal(r.plan.macros.proteinG, 144);
  assert.equal(r.plan.macros.fatG, Math.round((r.plan.targetCalories * 0.25) / 9));
  const total =
    r.plan.macros.proteinG * 4 + r.plan.macros.fatG * 9 + r.plan.macros.carbsG * 4;
  assert.ok(Math.abs(total - r.plan.targetCalories) <= 6);
});
test("未滿 18 歲拒絕", () => {
  const r = computePlan({
    profile: { ...base, birth_date: "2010-01-01" },
    weightKg: 60,
    today: TODAY,
  });
  assert.equal(r.ok, false);
});

console.log("validate");
test("通過正常 profile", () => {
  assert.equal(
    validateProfile({
      profile: { ...base, goal: "lose", target_weight_kg: 72, weekly_rate_kg: 0.5 },
      currentWeightKg: 80,
      today: TODAY,
    }),
    null,
  );
});
test("擋未成年", () => {
  assert.ok(
    validateProfile({
      profile: { ...base, birth_date: "2012-01-01" },
      currentWeightKg: 60,
      today: TODAY,
    }),
  );
});
test("擋極端目標體重（BMI < 18.5）", () => {
  assert.ok(
    validateProfile({
      profile: { ...base, goal: "lose", target_weight_kg: 50, weekly_rate_kg: 0.5 },
      currentWeightKg: 80,
      today: TODAY,
    }),
  );
});
test("減脂目標要低過現時體重", () => {
  assert.ok(
    validateProfile({
      profile: { ...base, goal: "lose", target_weight_kg: 85, weekly_rate_kg: 0.5 },
      currentWeightKg: 80,
      today: TODAY,
    }),
  );
});

console.log("trend");
test("7 日移動平均", () => {
  const pts = movingAverage(
    logs([
      ["2026-10-26", 80],
      ["2026-10-27", 79],
      ["2026-10-28", 78],
    ]),
  );
  assert.equal(pts[2].avg, 79);
});
test("移動平均只包含 7 日內", () => {
  const pts = movingAverage(
    logs([
      ["2026-10-20", 90],
      ["2026-10-30", 80],
    ]),
  );
  assert.equal(pts[1].avg, 80);
});
test("跨度不足 5 日 → 冇每週趨勢", () => {
  assert.equal(
    weeklyTrendKg(logs([["2026-10-30", 80], ["2026-11-02", 79.5]])),
    null,
  );
});
test("每週趨勢：每日跌 0.1kg → -0.7kg/週", () => {
  const data: [string, number][] = [];
  for (let i = 0; i < 8; i++) {
    data.push([addDays("2026-10-25", i), Math.round((80 - 0.1 * i) * 10) / 10]);
  }
  assert.equal(weeklyTrendKg(logs(data)), -0.7);
});

console.log("copy");
test("減得太快 → 認真提醒，唔打氣", () => {
  const m = trendMessage("lose", -1.5);
  assert.ok(m.includes("醫生"));
  assert.ok(!m.includes("啱晒靚仔路線"));
});
test("減脂趨勢向下 → 打氣", () => {
  assert.ok(trendMessage("lose", -0.5).includes("進步"));
});
test("冇趨勢 → 提示多記", () => {
  assert.equal(trendMessage("gain", null), WEIGHT_NEED_MORE);
});
test("goalMessage：達標 / 未達標 / 維持", () => {
  assert.ok(goalMessage("lose", 70, 70)?.includes("達成"));
  assert.ok(goalMessage("lose", 75.04, 70)?.includes("5 kg"));
  assert.equal(goalMessage("maintain", 70, null), null);
});
test("pick 同一種子結果一致", () => {
  assert.equal(pick(["a", "b", "c"], "2026-11-03"), pick(["a", "b", "c"], "2026-11-03"));
});

console.log(`\n${passed} 項測試全部通過`);

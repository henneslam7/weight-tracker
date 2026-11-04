// npm run test:stamps（Node >= 22.6）— 幾時到目標（ETA）、印花（三樣＋食量）、放縱日
import assert from "node:assert/strict";
import { dayBudget } from "../lib/budget.ts";
import { computePlan } from "../lib/calc.ts";
import { say } from "../lib/copy.ts";
import { addDays } from "../lib/date.ts";
import { etaLines, etaToTarget, weeksText } from "../lib/eta.ts";
import type { History } from "../lib/gamify.ts";
import { macroKcal, MACRO_TOLERANCE_KCAL } from "../lib/macros.ts";
import { effectiveTone, roastAllowed, sensitiveKind, sensitiveReason } from "../lib/persona.ts";
import { applyCheat, cheatExtraKcal, dayQualifies, stampState, STAMPS_FOR_CHEAT } from "../lib/stamps.ts";
import type { MealType, Profile } from "../lib/types.ts";

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

const TODAY = "2026-11-10";

console.log("ETA（幾時到目標）");
const E = (o: Partial<Parameters<typeof etaToTarget>[0]> = {}) =>
  etaToTarget({ goal: "lose", weightKg: 80, targetKg: 75, trendKgPerWeek: -0.5, planKgPerWeek: -0.45, today: TODAY, ...o });
test("減脂：5 kg ÷ 0.5 = 10 星期；另外顯示計劃速度 11 星期", () => {
  const e = E();
  assert.equal(e.state, "ok");
  assert.equal(e.remainingKg, 5);
  assert.equal(e.weeks, 10);
  assert.equal(e.date, addDays(TODAY, 70));
  assert.equal(e.planWeeks, 11);
  const l = etaLines(e, TODAY).join("");
  assert.ok(l.includes("10 星期") && l.includes("粗略"));
});
test("已達標／冇目標／維持／體態重組", () => {
  assert.equal(E({ weightKg: 74.5 }).state, "reached");
  assert.equal(E({ targetKg: null }).state, "no_target");
  assert.equal(E({ goal: "maintain" }).state, "no_target");
  assert.equal(E({ goal: "recomp" }).state, "no_target");
  assert.deepEqual(etaLines(E({ goal: "maintain" }), TODAY), []);
});
test("趨勢唔夠／企穩／方向相反／太遠：唔扮有答案", () => {
  assert.equal(E({ trendKgPerWeek: null }).state, "need_data");
  assert.equal(E({ trendKgPerWeek: -0.02 }).state, "flat");
  assert.equal(E({ trendKgPerWeek: 0.4 }).state, "wrong_direction");
  const far = E({ weightKg: 110, trendKgPerWeek: -0.1 });
  assert.equal(far.state, "too_far");
  assert.equal(far.weeks, null);
  for (const s of [E({ trendKgPerWeek: null }), E({ trendKgPerWeek: 0.4 }), far]) assert.ok(etaLines(s, TODAY).length > 0);
});
test("減得太快（> 1 kg/週）：標記 fast，提醒唔好再加快", () => {
  const e = E({ trendKgPerWeek: -1.4 });
  assert.equal(e.fast, true);
  assert.ok(etaLines(e, TODAY).join("").includes("唔好再加快"));
});
test("增肌方向相反；跨年日期顯示年份；weeksText", () => {
  assert.equal(E({ goal: "gain", weightKg: 70, targetKg: 75, trendKgPerWeek: 0.25, planKgPerWeek: 0.4 }).weeks, 20);
  assert.equal(E({ goal: "gain", weightKg: 70, targetKg: 75, trendKgPerWeek: -0.25 }).state, "wrong_direction");
  const e = E({ weightKg: 90, targetKg: 75, trendKgPerWeek: -0.4 });
  assert.ok(etaLines(e, TODAY).join("").includes("年"));
  assert.equal(weeksText(6), "6 星期");
  assert.ok(weeksText(26).includes("個月"));
});

console.log("印花（三樣齊 ＋ 食量唔超上限）");
const profile: Profile = {
  sex: "male", birth_date: "1995-06-01", height_cm: 175, activity_level: null, goal: "lose", target_weight_kg: 75,
  weekly_rate_kg: null, steps_range: "5000_6999", work_activity: "mostly_sitting", exercise_type: "none", pace: "standard", risk_review: "clear",
};
const r = computePlan({ profile, weightKg: 82, today: TODAY });
assert.ok(r.ok);
const plan = r.plan;
const BUDGET = plan.targetCalories;

interface Day { date: string; kcal: number; tasks?: boolean; burned?: number }
function hist(days: Day[]): History {
  const weightDates = new Set<string>();
  const mealsByDate = new Map<string, Set<MealType>>();
  const moveDates = new Set<string>();
  const kcalByDate = new Map<string, number>();
  const burnedByDate = new Map<string, number>();
  for (const d of days) {
    kcalByDate.set(d.date, d.kcal);
    burnedByDate.set(d.date, d.burned ?? 0);
    if (d.tasks !== false) {
      weightDates.add(d.date);
      moveDates.add(d.date);
      mealsByDate.set(d.date, new Set<MealType>(["breakfast", "lunch", "dinner"]));
    }
  }
  return { weightDates, mealsByDate, moveDates, kcalByDate, burnedByDate };
}
const good = (n: number, endAgo = 1): Day[] =>
  Array.from({ length: n }, (_, i) => ({ date: addDays(TODAY, -(endAgo + n - 1 - i)), kcal: BUDGET - 100 }));

test("夠資格：三樣齊 ＋ 食量 ≤ 上限（剛好等於都得）", () => {
  const h = hist([{ date: "2026-11-05", kcal: BUDGET }]);
  assert.equal(dayQualifies(h, "2026-11-05", plan), true);
});
test("唔夠資格：超標 1 kcal／三樣唔齊／冇食量資料", () => {
  assert.equal(dayQualifies(hist([{ date: "2026-11-05", kcal: BUDGET + 1 }]), "2026-11-05", plan), false);
  assert.equal(dayQualifies(hist([{ date: "2026-11-05", kcal: 1500, tasks: false }]), "2026-11-05", plan), false);
  const h = hist([{ date: "2026-11-05", kcal: 1500 }]);
  assert.equal(dayQualifies({ ...h, kcalByDate: undefined }, "2026-11-05", plan), false);
});
test("運動加成：當日上限加返，所以超基本目標但喺加成內都夠資格", () => {
  const h = hist([{ date: "2026-11-05", kcal: BUDGET + 200, burned: 300 }]);
  assert.ok(dayBudget(plan, 300).calories >= BUDGET + 200);
  assert.equal(dayQualifies(h, "2026-11-05", plan), true);
});
test("連續 7 日合資格 → 可以領；用咗嘅印花去到第 7 日；今日唔計入", () => {
  const h = hist([...good(7), { date: TODAY, kcal: 100 }]);
  const s = stampState({ history: h, plan, today: TODAY, rows: [] });
  assert.equal(s.count, 7);
  assert.equal(s.canRedeem, true);
  assert.equal(s.stampsThrough, addDays(TODAY, -1));
  assert.equal(STAMPS_FOR_CHEAT, 7);
});
test("6 個唔夠；中間有一日超標就斷（唔計嗰日）", () => {
  assert.equal(stampState({ history: hist(good(6)), plan, today: TODAY, rows: [] }).canRedeem, false);
  const days = good(7);
  days[3] = { ...days[3], kcal: BUDGET + 300 };
  const s = stampState({ history: hist(days), plan, today: TODAY, rows: [] });
  assert.equal(s.count, 6);
  assert.equal(s.canRedeem, false);
});
test("今日暫定：三樣做晒＋未超 → onTrack；超標就唔係", () => {
  const ok = stampState({ history: hist([{ date: TODAY, kcal: 1500 }]), plan, today: TODAY, rows: [] });
  assert.equal(ok.today.onTrack, true);
  assert.equal(ok.count, 0);
  const over = stampState({ history: hist([{ date: TODAY, kcal: BUDGET + 50 }]), plan, today: TODAY, rows: [] });
  assert.equal(over.today.onTrack, false);
  assert.equal(over.today.withinBudget, false);
});
test("領咗之後重新計：用咗嘅 7 個唔再計，多出嚟嘅照計；放縱日當日唔蓋章", () => {
  const h = hist(good(9)); // 昨日起計 9 日
  const through = addDays(TODAY, -3); // 7 個用到呢日
  const s = stampState({ history: h, plan, today: TODAY, rows: [{ cheat_on: TODAY, stamps_through: through }] });
  assert.equal(s.count, 2);
  assert.equal(s.canRedeem, false);
  assert.equal(s.cheatToday, true);
  assert.equal(s.redeemed, 1);
  // 放縱日本身唔計
  const day = addDays(TODAY, -1);
  const s2 = stampState({ history: h, plan, today: TODAY, rows: [{ cheat_on: day, stamps_through: through }] });
  assert.equal(s2.count, 1);
  assert.equal(s2.lifetime, 8); // 9 日減放縱日
});
test("預約聽日用：cheatUpcoming；今日仲未係放縱日", () => {
  const s = stampState({ history: hist(good(7)), plan, today: TODAY, rows: [{ cheat_on: addDays(TODAY, 1), stamps_through: addDays(TODAY, -1) }] });
  assert.equal(s.cheatUpcoming, addDays(TODAY, 1));
  assert.equal(s.cheatToday, false);
  assert.equal(s.count, 0);
});
test("太舊嘅印花（超過 60 日）唔計", () => {
  const old = Array.from({ length: 7 }, (_, i) => ({ date: addDays(TODAY, -100 + i), kcal: 1500 }));
  assert.equal(stampState({ history: hist(old), plan, today: TODAY, rows: [] }).count, 0);
});

console.log("放縱日");
test("減脂：加 ≤ 400 kcal，而且唔高過維持量（唔會變盈餘）", () => {
  const x = cheatExtraKcal(plan);
  assert.ok(x > 0 && x <= 400);
  assert.ok(plan.targetCalories + x <= plan.tdee);
  // 進取檔：赤字大，封頂 400
  const f = computePlan({ profile: { ...profile, pace: "faster" }, weightKg: 96, today: TODAY });
  assert.ok(f.ok);
  assert.ok(cheatExtraKcal(f.plan) <= 400 && f.plan.targetCalories + cheatExtraKcal(f.plan) <= f.plan.tdee);
});
test("維持量計劃（需要評估／細赤字）：額外 ≤ 赤字；其他目標 +300", () => {
  const rr = computePlan({ profile: { ...profile, risk_review: "needs_review" }, weightKg: 82, today: TODAY });
  assert.ok(rr.ok);
  assert.equal(cheatExtraKcal(rr.plan), 0);
  const g = computePlan({ profile: { ...profile, goal: "gain", weekly_rate_kg: 0.25 }, weightKg: 70, today: TODAY });
  assert.ok(g.ok);
  assert.equal(cheatExtraKcal(g.plan), 300);
  const rc = computePlan({ profile: { ...profile, goal: "recomp", pace: null, target_weight_kg: null }, weightKg: 82, today: TODAY });
  assert.ok(rc.ok);
  assert.ok(cheatExtraKcal(rc.plan) <= rc.plan.tdee - rc.plan.targetCalories);
});
test("applyCheat：上限加咗、額外撥入碳水、宏量仍然 ≈ 新上限；原 plan 唔變", () => {
  const x = cheatExtraKcal(plan);
  const c = applyCheat(plan, x);
  assert.equal(c.targetCalories, plan.targetCalories + x);
  assert.equal(c.cheatExtraKcal, x);
  assert.equal(c.macros.proteinG, plan.macros.proteinG);
  assert.equal(c.macros.fatG, plan.macros.fatG);
  assert.ok(Math.abs(macroKcal(c.macros.proteinG, c.macros.carbsG, c.macros.fatG) - c.targetCalories) <= MACRO_TOLERANCE_KCAL);
  assert.equal(dayBudget(c, 0).calories, plan.targetCalories + x);
  assert.equal(applyCheat(plan, 0).targetCalories, plan.targetCalories);
});
test("每週影響：一個星期只少咗一日赤字（≤ 1/7）", () => {
  const x = cheatExtraKcal(plan);
  const weeklyDeficit = (plan.tdee - plan.targetCalories) * 7;
  assert.ok(x / weeklyDeficit <= 1 / 7 + 1e-9, `${x}/${weeklyDeficit}`);
});
test("放縱日語氣：永遠溫柔、唔 roast（優先過其他情況，包括 65+ 同超標）", () => {
  const base = { age: 30, goal: "lose" as const, hour: 20, eatenKcal: 3000, budgetKcal: 2000, trendKgPerWeek: -0.5, daysSinceLastLog: 0, cheatToday: true };
  assert.equal(sensitiveReason(base), "cheat");
  assert.equal(sensitiveReason({ ...base, age: 70 }), "cheat");
  const prefs = { tone: "spicy" as const, food_roast: true, elder_mode: false };
  assert.equal(effectiveTone(prefs, "cheat"), "soft");
  assert.equal(roastAllowed(prefs, "cheat"), false);
  assert.equal(sensitiveKind("cheat"), "cheat");
  assert.equal(say("cheat", "spicy", "x").text, say("cheat", "soft", "x").text);
  // 減得太快係安全問題：而家冇 cheat 都唔會被蓋過（cheat 只喺 cheatToday）
  assert.equal(sensitiveReason({ ...base, cheatToday: false, trendKgPerWeek: -1.5, eatenKcal: 1000 }), "fast");
});

console.log(`\n${passed} 項測試全部通過`);

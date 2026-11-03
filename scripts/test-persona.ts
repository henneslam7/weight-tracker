// npm run test:persona
import assert from "node:assert/strict";
import { dayBudget } from "../lib/budget.ts";
import { ageOn, computePlan, validateProfile } from "../lib/calc.ts";
import { allGossip, allLines, gossipFor, say, SENSITIVE_KINDS, type Kind } from "../lib/copy.ts";
import { creditFor } from "../lib/exercise.ts";
import { cardProgress, dayLogFor, levelFor, stampDates, tasksFor, type History } from "../lib/gamify.ts";
import { defaultPrefs, effectiveTone, normalizePrefs, roastAllowed, sensitiveKind, sensitiveReason } from "../lib/persona.ts";
import { foodRoast, GENERIC, RULES } from "../lib/roast.ts";
import type { MealType, Profile, Tone } from "../lib/types.ts";

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

/** 安全檢查：唔鬧身形、唔恐嚇、唔講罪惡／補償、唔叫人少食 */
const UNSAFE = /肥|胖|瘦|醜|會死|會病|癌|罪惡|壞嘢|補償|懲罰|少食|唔好食|唔准食|食咗要|要補返|運動補|餓/;
export function safe(text: string): boolean {
  const t = text.replaceAll("減肥", "").replaceAll("肚餓就食啲嘢先", "");
  return !UNSAFE.test(t);
}

const TONES: Tone[] = ["soft", "neighbour", "spicy"];
const KINDS: Kind[] = ["weight", "breakfast", "lunch", "dinner", "snack", "move", "rest", "evening", "inactive", "allDone", "stamp", "goal", "over", "low", "fast", "welcomeBack"];

console.log("copy");
test("每個情境 × 每個語氣都有對白，講嘢嘅人有效", () => {
  for (const k of KINDS) for (const t of TONES) {
    const l = say(k, t, "2026-11-03");
    assert.ok(l.text.length > 3 && (l.who === "chan" || l.who === "foon"), `${k}/${t}`);
  }
});
test("敏感情境：任何語氣都只用溫柔版", () => {
  for (const k of SENSITIVE_KINDS) for (const t of TONES) {
    assert.equal(say(k, t, "x").text, say(k, "soft", "x").text);
  }
});
test("同一種子揀同一句", () => {
  assert.deepEqual(say("weight", "spicy", "a"), say("weight", "spicy", "a"));
  assert.deepEqual(gossipFor("2026-11-03"), gossipFor("2026-11-03"));
});
test("所有對白同街坊閒話都過安全檢查", () => {
  for (const l of allLines()) assert.ok(safe(l.text), l.text);
  for (const l of allGossip()) assert.ok(safe(l.text), l.text);
  assert.ok(allGossip().length >= 10);
});
test("毒舌版同溫柔版唔同，而且毒舌版有刺（賭、年卡、失蹤、聽日開始…）", () => {
  for (const k of ["weight", "evening", "dinner"] as Kind[]) {
    for (let n = 0; n < 6; n++) assert.notEqual(say(k, "spicy", `s${n}`).text, say(k, "soft", `s${n}`).text);
  }
});

console.log("roast");
const R = (names: string[], cals: number[], rem: number, tone: Tone = "spicy", enabled = true) =>
  foodRoast({ items: names.map((name, i) => ({ name, calories: cals[i] })), remainingKcal: rem, tone, enabled, seed: "t" });
test("撞中關鍵字：珍珠奶茶、炸雞、蛋撻、出前一丁、燒烤、汽水、快餐", () => {
  assert.equal(R(["珍珠奶茶"], [450], 1500)?.rule, "milktea");
  assert.equal(R(["炸雞髀"], [300], 1500)?.rule, "fried");
  assert.equal(R(["蛋撻"], [230], 1500)?.rule, "sweet");
  assert.equal(R(["出前一丁加午餐肉"], [500], 1500)?.rule, "instant");
  assert.equal(R(["串燒"], [400], 1500)?.rule, "bbq");
  assert.equal(R(["可樂"], [140], 1500)?.rule, "soda");
  assert.equal(R(["麥當勞套餐"], [900], 1500)?.rule, "fastfood");
});
test("唔撞關鍵字：大餐先 roast，清淡細餐唔 roast", () => {
  assert.equal(R(["蒸魚飯"], [550], 1500), null);
  assert.equal(R(["燉湯麵"], [820], 1500)?.rule, "generic");
  assert.equal(R(["雜菜粥"], [400], 700)?.rule, "generic");   // 成餐 ≥ 剩餘一半
});
test("溫柔語氣、關咗食物 roast、已經超標：一律唔 roast", () => {
  assert.equal(R(["珍珠奶茶"], [450], 1500, "soft"), null);
  assert.equal(R(["珍珠奶茶"], [450], 1500, "spicy", false), null);
  assert.equal(R(["珍珠奶茶"], [450], 0), null);
  assert.equal(R(["珍珠奶茶"], [450], -200), null);
  assert.equal(R([], [], 1000), null);
});
test("數字有代入，冇剩低 {kcal}／{rem}", () => {
  const r = R(["燉湯麵"], [820], 1500)!;
  assert.ok(!/[{}]/.test(r.line.text));
  const g = [...GENERIC.neighbour, ...GENERIC.spicy].every((l) => /{kcal}|{rem}/.test(l.text));
  assert.ok(g);
});
test("每條規則都有毒舌版（≥2 句）同街坊版，毒舌版同街坊版唔同；全部過安全檢查", () => {
  for (const r of RULES) {
    assert.ok(r.spicy.length >= 2 && r.neighbour.length >= 1, r.id);
    for (const l of [...r.neighbour, ...r.spicy]) assert.ok(safe(l.text), l.text);
    assert.ok(r.spicy.every((s) => !r.neighbour.some((n) => n.text === s.text)));
  }
  for (const l of [...GENERIC.neighbour, ...GENERIC.spicy]) assert.ok(safe(l.text), l.text);
});
test("毒舌 roast 只針對食物同衝動：冇「你肥」「食咗會病」呢類字眼", () => {
  for (const r of RULES) for (const l of r.spicy) assert.ok(!/你.{0,3}(肥|胖)|會病|會死/.test(l.text));
});

console.log("persona");
test("預設設定：長者 = 溫柔、關 roast、長者模式；一般成人 = 街坊", () => {
  assert.deepEqual(defaultPrefs(70), { tone: "soft", food_roast: false, elder_mode: true });
  assert.deepEqual(defaultPrefs(30), { tone: "neighbour", food_roast: true, elder_mode: false });
  assert.deepEqual(defaultPrefs(null), defaultPrefs(30));
});
test("normalizePrefs：壞值退返預設", () => {
  assert.equal(normalizePrefs({ tone: "evil" as Tone }, 30).tone, "neighbour");
  assert.equal(normalizePrefs({ tone: "spicy", food_roast: false }, 30).food_roast, false);
  assert.equal(normalizePrefs(null, 70).tone, "soft");
});
const S = (o: Partial<Parameters<typeof sensitiveReason>[0]> = {}) =>
  sensitiveReason({ age: 30, goal: "lose", hour: 14, eatenKcal: 800, budgetKcal: 2000, trendKgPerWeek: -0.4, daysSinceLastLog: 0, ...o });
test("敏感時刻：65+、減太快、超標、傍晚食得好少、隔咗幾日返嚟", () => {
  assert.equal(S(), null);
  assert.equal(S({ age: 70 }), "senior");
  assert.equal(S({ trendKgPerWeek: -1.3 }), "fast");
  assert.equal(S({ eatenKcal: 2100 }), "over");
  assert.equal(S({ hour: 19, eatenKcal: 500 }), "low");
  assert.equal(S({ hour: 14, eatenKcal: 500 }), null);          // 下晝食少啲好正常
  assert.equal(S({ daysSinceLastLog: 4 }), "returning");
  assert.equal(S({ goal: "gain", trendKgPerWeek: -1.3 }), null); // 增肌唔查減重速度
});
test("敏感時刻 → 溫柔語氣、唔 roast；一般情況跟設定", () => {
  const p = { tone: "spicy" as Tone, food_roast: true, elder_mode: false };
  assert.equal(effectiveTone(p, "over"), "soft");
  assert.equal(effectiveTone(p, null), "spicy");
  assert.equal(roastAllowed(p, null), true);
  assert.equal(roastAllowed(p, "low"), false);
  assert.equal(roastAllowed({ ...p, food_roast: false }, null), false);
  assert.equal(roastAllowed({ ...p, tone: "soft" }, null), false);
});
test("敏感情境對應對白", () => {
  assert.equal(sensitiveKind("over"), "over");
  assert.equal(sensitiveKind("returning"), "welcomeBack");
  assert.equal(sensitiveKind("senior"), null);
  assert.equal(sensitiveKind(null), null);
});

console.log("gamify");
const mk = (w: string[], m: Record<string, MealType[]>, mv: string[]): History => ({
  weightDates: new Set(w),
  mealsByDate: new Map(Object.entries(m).map(([d, v]) => [d, new Set(v)])),
  moveDates: new Set(mv),
});
test("今日三樣：上磅、三餐、郁下或休息", () => {
  const h = mk(["2026-11-03"], { "2026-11-03": ["breakfast", "lunch"] }, []);
  assert.deepEqual(tasksFor(dayLogFor(h, "2026-11-03")), { weight: true, meals: false, move: false, done: false });
  const h2 = mk(["2026-11-03"], { "2026-11-03": ["breakfast", "lunch", "dinner"] }, ["2026-11-03"]);
  assert.equal(tasksFor(dayLogFor(h2, "2026-11-03")).done, true);
});
test("休息日算完成（moveDates 包括休息）；同一餐記幾次只計一次", () => {
  const h = mk(["d"], { d: ["lunch", "lunch", "dinner"] as MealType[] }, []);
  assert.equal(dayLogFor(h, "d").meals, 2);
});
test("stampDates：只計三樣齊嘅日子", () => {
  const full: MealType[] = ["breakfast", "lunch", "dinner"];
  const h = mk(["2026-11-01", "2026-11-02", "2026-11-03"], { "2026-11-01": full, "2026-11-02": full, "2026-11-03": ["lunch"] }, ["2026-11-01", "2026-11-02", "2026-11-03"]);
  assert.deepEqual(stampDates(h, "2026-10-30", "2026-11-03"), ["2026-11-01", "2026-11-02"]);
});
test("印花卡：7 個一張；街坊級數", () => {
  assert.deepEqual(cardProgress(0), { filled: 0, cardsDone: 0 });
  assert.deepEqual(cardProgress(3), { filled: 3, cardsDone: 0 });
  assert.deepEqual(cardProgress(7), { filled: 7, cardsDone: 1 });
  assert.deepEqual(cardProgress(8), { filled: 1, cardsDone: 1 });
  assert.equal(levelFor(0).name, "新搬嚟");
  assert.equal(levelFor(7).name, "熟客");
  assert.equal(levelFor(20).toNext, 1);
  assert.equal(levelFor(100).next, null);
});

console.log("senior（65 歲或以上）");
const base: Profile = { sex: "female", birth_date: "1955-03-01", height_cm: 158, activity_level: "light", goal: "lose", target_weight_kg: 55, weekly_rate_kg: 0.75 };
const adult: Profile = { ...base, birth_date: "1990-03-01" };
const T = "2026-11-03";
test("年齡計算", () => assert.equal(ageOn("1955-03-01", T), 71));
test("減脂：赤字 ≤ TDEE 15%、每週速度 ≤ 0.25kg、有醫生提示", () => {
  const r = computePlan({ profile: base, weightKg: 68, today: T });
  assert.ok(r.ok);
  assert.equal(r.plan.senior, true);
  assert.ok(-r.plan.dailyDeltaKcal <= r.plan.tdee * 0.15 + 1, `${r.plan.dailyDeltaKcal}/${r.plan.tdee}`);
  assert.ok(Math.abs(r.plan.weeklyRateKg) <= 0.26);
  assert.ok(r.plan.notes.some((n) => n.includes("醫生")));
});
test("一般成人唔受影響：赤字上限仍然 25%，蛋白質 1.8 g/kg", () => {
  const r = computePlan({ profile: adult, weightKg: 68, today: T });
  assert.ok(r.ok);
  assert.equal(r.plan.senior, false);
  assert.equal(r.plan.macros.proteinG, Math.round(1.8 * 68));
});
test("長者蛋白質 1.2 g/kg；calories 下限仍然生效", () => {
  const r = computePlan({ profile: base, weightKg: 68, today: T });
  assert.ok(r.ok);
  assert.equal(r.plan.macros.proteinG, Math.round(1.2 * 68));
  assert.ok(r.plan.targetCalories >= Math.min(1200, r.plan.tdee));
});
test("目標體重 BMI 下限：長者 22，成人 18.5", () => {
  const t = 52; // 158cm → BMI 20.8
  assert.ok(validateProfile({ profile: { ...base, target_weight_kg: t }, currentWeightKg: 68, today: T })?.includes("22"));
  assert.equal(validateProfile({ profile: { ...adult, target_weight_kg: t }, currentWeightKg: 68, today: T }), null);
});
test("長者運動加成：一半、每日最多 500", () => {
  assert.equal(creditFor(400, true), 200);
  assert.equal(creditFor(5000, true), 500);
  assert.equal(creditFor(400, false), 400);
  const r = computePlan({ profile: base, weightKg: 68, today: T });
  assert.ok(r.ok);
  assert.equal(dayBudget(r.plan, 600).exerciseCredit, 300);
  const a = computePlan({ profile: adult, weightKg: 68, today: T });
  assert.ok(a.ok);
  assert.equal(dayBudget(a.plan, 600).exerciseCredit, 600);
});

console.log(`\n${passed} 項測試全部通過`);

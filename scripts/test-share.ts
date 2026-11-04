// npm run test:share（Node >= 22.6）
import assert from "node:assert/strict";
import { computePlan } from "../lib/calc.ts";
import { buildShareModel, cleanName, SHARE_MAX_ITEMS } from "../lib/sharecard.ts";
import { shareHeight } from "../lib/sharedraw.ts";
import type { FoodLog, Profile } from "../lib/types.ts";

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

const profile: Profile = {
  sex: "male", birth_date: "1995-06-01", height_cm: 175, activity_level: null, goal: "lose", target_weight_kg: 75,
  weekly_rate_kg: null, steps_range: "5000_6999", work_activity: "mostly_sitting", exercise_type: "none", pace: "standard", risk_review: "clear",
};
const r = computePlan({ profile, weightKg: 82, today: "2026-11-04" });
assert.ok(r.ok);
const plan = r.plan;
const food = (i: number, meal: FoodLog["meal_type"], name: string, cal: number): FoodLog => ({
  id: String(i), logged_on: "2026-11-04", meal_type: meal, name, quantity_text: null, calories: cal, protein_g: 10, carbs_g: 30, fat_g: 5, source: "manual",
});
const M = (foods: FoodLog[], o: Partial<Parameters<typeof buildShareModel>[0]> = {}) =>
  buildShareModel({ today: "2026-11-04", plan, foods, exerciseBurned: 0, ...o });

test("空：mode=empty，大數字 = 上限", () => {
  const m = M([]);
  assert.equal(m.mode, "empty");
  assert.equal(m.bigNumber, plan.targetCalories);
  assert.equal(m.meals.length, 0);
});
test("剩餘：bigNumber = 上限 − 已食；progress 0–1", () => {
  const m = M([food(1, "breakfast", "麵包", 300), food(2, "lunch", "叉燒飯", 800)]);
  assert.equal(m.mode, "remaining");
  assert.equal(m.eaten, 1100);
  assert.equal(m.bigNumber, plan.targetCalories - 1100);
  assert.ok(m.progress > 0 && m.progress < 1);
  assert.deepEqual(m.meals.map((x) => x.label), ["早餐", "午餐"]);
  assert.equal(m.meals[1].kcal, 800);
});
test("超標：mode=over，bigNumber = 超出，文案唔責備", () => {
  const m = M([food(1, "dinner", "火鍋", plan.targetCalories + 400)]);
  assert.equal(m.mode, "over");
  assert.equal(m.bigNumber, 400);
  assert.equal(m.progress, 1);
  assert.ok(!/(失敗|蠢|肥|罪)/.test(m.caption));
});
test("運動加成：上限會加返", () => {
  const a = M([food(1, "lunch", "飯", 500)]);
  const b = M([food(1, "lunch", "飯", 500)], { exerciseBurned: 300 });
  assert.equal(b.budget, a.budget + 300);
  assert.equal(b.exercise, 300);
});
test("食物太多：只保留 kcal 最高 8 項，其餘計 moreCount", () => {
  const foods = Array.from({ length: 12 }, (_, i) => food(i, "snack", `小食${i}`, 100 + i * 10));
  const m = M(foods);
  const shown = m.meals.flatMap((x) => x.items);
  assert.equal(shown.length, SHARE_MAX_ITEMS);
  assert.equal(m.moreCount, 4);
  assert.ok(shown.every((s) => s.kcal >= 140)); // 最低嗰 4 項（100–130）被收埋
  assert.equal(m.meals[0].kcal, foods.reduce((a, f) => a + f.calories, 0)); // 餐總數仍然包晒
});
test("唔顯示食物名：只有每餐 kcal，冇任何食物名", () => {
  const m = M([food(1, "lunch", "榴槤雪糕", 300)], { showNames: false });
  assert.equal(m.meals[0].items.length, 0);
  assert.ok(!JSON.stringify(m).includes("榴槤"));
});
test("私隱：model 唔包體重、身高、年齡", () => {
  const s = JSON.stringify(M([food(1, "lunch", "飯", 500)]));
  for (const k of ["weight", "height", "birth", "age", "bmr", "tdee"]) assert.ok(!s.toLowerCase().includes(k), k);
});
test("cleanName：控制字元、空白、過長截短", () => {
  assert.equal(cleanName("  叉燒\n飯  "), "叉燒 飯");
  assert.equal([...cleanName("一二三四五六七八九十一二三四")].length, 12);
  assert.ok(cleanName("一二三四五六七八九十一二三四").endsWith("…"));
});
test("圖高：食物少 1350；多就加長，最高 2000", () => {
  assert.equal(shareHeight(M([food(1, "lunch", "飯", 500)])), 1350);
  const many = M(Array.from({ length: 8 }, (_, i) => food(i, (["breakfast", "lunch", "dinner", "snack"] as const)[i % 4], `食物${i}`, 200 + i)));
  assert.ok(shareHeight(many) >= 1350 && shareHeight(many) <= 2000);
});
test("街坊按日期固定（偶數日歡嬸、單數日陳伯）", () => {
  assert.equal(M([]).who, "foon");
  assert.equal(buildShareModel({ today: "2026-11-05", plan, foods: [], exerciseBurned: 0 }).who, "chan");
});

console.log(`\n${passed} 項測試全部通過`);

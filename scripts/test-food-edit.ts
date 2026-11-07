// npm run test:food-edit（Node >= 22.6）
import assert from "node:assert/strict";
import { checkFoodEdit, foodUpdateRow, macroGap, type FoodEditInput } from "../lib/food.ts";

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
const TODAY = "2026-11-07";
const ok: FoodEditInput = { name: "叉燒飯", quantity_text: "1 碟", meal_type: "lunch", logged_on: "2026-11-06", calories: "780", protein_g: "30", carbs_g: "95", fat_g: "28" };
const orig = { source: "ai" as const, calories: 780, protein_g: 30, carbs_g: 95, fat_g: 28 };

test("正常輸入通過；份量可以空", () => {
  assert.equal(checkFoodEdit(ok, TODAY), null);
  assert.equal(checkFoodEdit({ ...ok, quantity_text: "" }, TODAY), null);
  assert.equal(checkFoodEdit({ ...ok, protein_g: "", carbs_g: "", fat_g: "" }, TODAY), null); // 空 = 0
});
test("擋：空名、太長名／份量、calories 越界或空、營養素越界／負數／NaN", () => {
  assert.ok(checkFoodEdit({ ...ok, name: "   " }, TODAY));
  assert.ok(checkFoodEdit({ ...ok, name: "字".repeat(81) }, TODAY));
  assert.equal(checkFoodEdit({ ...ok, name: "字".repeat(80) }, TODAY), null);
  assert.ok(checkFoodEdit({ ...ok, quantity_text: "a".repeat(81) }, TODAY));
  for (const c of ["", "-1", "5001", "abc"]) assert.ok(checkFoodEdit({ ...ok, calories: c }, TODAY), c);
  assert.equal(checkFoodEdit({ ...ok, calories: "0" }, TODAY), null);
  assert.equal(checkFoodEdit({ ...ok, calories: "5000" }, TODAY), null);
  assert.ok(checkFoodEdit({ ...ok, protein_g: "501" }, TODAY));
  assert.ok(checkFoodEdit({ ...ok, carbs_g: "801" }, TODAY));
  assert.ok(checkFoodEdit({ ...ok, fat_g: "-2" }, TODAY));
  assert.ok(checkFoodEdit({ ...ok, fat_g: "x" }, TODAY));
});
test("擋：未來日期、壞日期、壞餐別", () => {
  assert.ok(checkFoodEdit({ ...ok, logged_on: "2026-11-08" }, TODAY));
  assert.equal(checkFoodEdit({ ...ok, logged_on: TODAY }, TODAY), null);
  assert.ok(checkFoodEdit({ ...ok, logged_on: "2026-13-40" }, TODAY));
  assert.ok(checkFoodEdit({ ...ok, logged_on: "" }, TODAY));
  assert.ok(checkFoodEdit({ ...ok, meal_type: "brunch" as never }, TODAY));
});
test("更新欄位：trim、空份量變 null、數字取整／1 位細數、可以改餐別同日期", () => {
  const r = foodUpdateRow({ ...ok, name: "  叉燒飯（少飯） ", quantity_text: "  ", meal_type: "dinner", logged_on: "2026-11-05", calories: "700.4", protein_g: "30.26", carbs_g: "80", fat_g: "" }, orig);
  assert.equal(r.name, "叉燒飯（少飯）");
  assert.equal(r.quantity_text, null);
  assert.equal(r.meal_type, "dinner");
  assert.equal(r.logged_on, "2026-11-05");
  assert.equal(r.calories, 700);
  assert.equal(r.protein_g, 30.3);
  assert.equal(r.fat_g, 0);
});
test("AI 估算：改咗 calories／營養素 → 變 manual；只改名／餐別／日期 → 保持 ai；manual／saved 唔變", () => {
  assert.equal(foodUpdateRow({ ...ok, calories: "600" }, orig).source, "manual");
  assert.equal(foodUpdateRow({ ...ok, carbs_g: "50" }, orig).source, "manual");
  assert.equal(foodUpdateRow({ ...ok, name: "改個名", meal_type: "dinner" }, orig).source, "ai");
  assert.equal(foodUpdateRow({ ...ok, calories: "600" }, { ...orig, source: "saved" }).source, "saved");
  assert.equal(foodUpdateRow({ ...ok, calories: "600" }, { ...orig, source: "manual" }).source, "manual");
});
test("營養素同 kcal 差好遠 → macroGap 可以提示（唔阻止儲存）", () => {
  assert.equal(macroGap({ ...ok, calories: "780", protein_g: "30", carbs_g: "95", fat_g: "28" }), -28);
  assert.ok(Math.abs(macroGap({ ...ok, calories: "100" })) > 600);
  assert.equal(checkFoodEdit({ ...ok, calories: "100" }, TODAY), null);
});
test("更新唔會帶 user_id／ai_raw（RLS 同原始估算原樣保留）", () => {
  const r = foodUpdateRow(ok, orig) as Record<string, unknown>;
  assert.ok(!("user_id" in r) && !("ai_raw" in r) && !("id" in r));
});

console.log(`\n${passed} 項測試全部通過`);

// npm run test:reminders
import assert from "node:assert/strict";
import { reminderLine, type ReminderKind } from "../lib/copy.ts";
import { nowInZone } from "../lib/date.ts";
import { defaultMealType, sumFood } from "../lib/food.ts";
import {
  DEFAULT_SETTINGS,
  decideReminders,
  isQuiet,
  type DecideInput,
} from "../lib/reminders.ts";
import type { MealType } from "../lib/types.ts";

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

const base = (o: Partial<DecideInput> = {}): DecideInput => ({
  nowDate: "2026-11-03",
  nowTime: "12:35",
  settings: DEFAULT_SETTINGS,
  weightLoggedToday: true,
  mealsLoggedToday: new Set<MealType>(),
  lastLogDate: "2026-11-03",
  sentToday: new Set<string>(),
  ...o,
});
const kinds = (i: DecideInput) => decideReminders(i).map((d) => d.kind);

console.log("time");
test("nowInZone：UTC 00:30 = 香港 08:30", () => {
  assert.deepEqual(nowInZone("Asia/Hong_Kong", new Date("2026-11-03T00:30:00Z")), {
    date: "2026-11-03",
    time: "08:30",
  });
});
test("nowInZone：UTC 17:00 = 香港翌日 01:00", () => {
  assert.deepEqual(nowInZone("Asia/Hong_Kong", new Date("2026-11-03T17:00:00Z")), {
    date: "2026-11-04",
    time: "01:00",
  });
});
test("isQuiet 跨午夜 23:00–07:00", () => {
  assert.equal(isQuiet("23:30", "23:00", "07:00"), true);
  assert.equal(isQuiet("03:00", "23:00", "07:00"), true);
  assert.equal(isQuiet("07:00", "23:00", "07:00"), false);
  assert.equal(isQuiet("12:00", "23:00", "07:00"), false);
});

console.log("reminders");
test("午餐時間未記 → 發午餐提醒", () => {
  assert.deepEqual(kinds(base()), ["lunch"]);
});
test("已記午餐 → 唔提醒", () => {
  assert.deepEqual(kinds(base({ mealsLoggedToday: new Set<MealType>(["lunch"]) })), []);
});
test("今日已發過 → 唔再發", () => {
  assert.deepEqual(kinds(base({ sentToday: new Set(["lunch"]) })), []);
});
test("未到時間 / 超過 window → 唔發", () => {
  assert.deepEqual(kinds(base({ nowTime: "12:00" })), []);
  assert.deepEqual(kinds(base({ nowTime: "13:31" })), []);
});
test("體重：未記先提醒", () => {
  const i = base({ nowTime: "07:35", weightLoggedToday: false });
  assert.deepEqual(kinds(i), ["weight"]);
  assert.deepEqual(kinds({ ...i, weightLoggedToday: true }), []);
});
test("靜音時段內唔發（自訂 07:00 前靜音，07:30 照發）", () => {
  const i = base({ nowTime: "07:30", weightLoggedToday: false });
  assert.deepEqual(kinds(i), ["weight"]);
  const quiet = { ...DEFAULT_SETTINGS, quiet_start: "07:00", quiet_end: "08:00" };
  assert.deepEqual(kinds({ ...i, settings: quiet }), []);
});
test("關閉靜音 → 照發", () => {
  const s = { ...DEFAULT_SETTINGS, weight_time: "23:30", quiet_enabled: false };
  assert.deepEqual(kinds(base({ nowTime: "23:35", weightLoggedToday: false, settings: s })), ["weight"]);
});
test("關閉某項 → 唔發", () => {
  const s = { ...DEFAULT_SETTINGS, lunch_enabled: false };
  assert.deepEqual(kinds(base({ settings: s })), []);
});
test("小食預設關閉", () => {
  assert.deepEqual(kinds(base({ nowTime: "16:05" })), []);
});
test("夜晚補記：未記體重 → 提醒", () => {
  const i = base({
    nowTime: "21:05",
    weightLoggedToday: false,
    mealsLoggedToday: new Set<MealType>(["breakfast", "lunch", "dinner"]),
  });
  assert.deepEqual(kinds(i), ["evening"]);
});
test("夜晚補記：體重 + 兩餐以上都記咗 → 唔提醒", () => {
  const i = base({
    nowTime: "21:05",
    mealsLoggedToday: new Set<MealType>(["lunch", "dinner"]),
  });
  assert.deepEqual(kinds(i), []);
});
test("連續 3 日冇記錄 → 夜晚改發「好耐冇見」，唔責備", () => {
  const i = base({
    nowTime: "21:05",
    weightLoggedToday: false,
    lastLogDate: "2026-10-30",
  });
  const d = decideReminders(i);
  assert.equal(d.length, 1);
  assert.ok(d[0].body.includes("記一筆"));
});
test("提醒有講嘢嘅人（陳伯／歡嬸）同標題", () => {
  const d = decideReminders(base());
  assert.ok(d[0].who === "chan" || d[0].who === "foon");
  assert.equal(d[0].title, d[0].who === "chan" ? "陳伯" : "歡嬸");
});
test("所有語氣嘅提醒：唔鬧身形、唔叫人少食、唔恐嚇、唔講補償；溫柔版冇毒舌", () => {
  const kinds_: ReminderKind[] = ["weight", "breakfast", "lunch", "dinner", "snack", "evening", "inactive"];
  // 「補返先瞓」係補記錄，唔算補償；真正禁嘅係「食咗要…」「要補返」「運動補」
  const banned = /減少食|少食|唔准食|唔好食|肥|餓|會死|會病|罪惡|補償|懲罰|癌|食咗要|要補返|運動補/;
  let withDeficit = 0;
  for (const tone of ["soft", "neighbour", "spicy"] as const) {
    for (const k of kinds_) {
      for (let n = 0; n < 6; n++) {
        const l = reminderLine(k, tone, `seed${n}`);
        assert.ok(!banned.test(l.text.replaceAll("減肥", "")), l.text);   // 「減肥」係中性活動詞，唔當鬧人肥
        if (l.text.includes("赤字")) withDeficit++;
      }
    }
  }
  assert.ok(withDeficit >= 10, "提醒應該有提赤字");
  // 溫柔版唔應該有賭、年卡、報警等毒舌套路
  for (const k of kinds_) {
    for (let n = 0; n < 6; n++) assert.ok(!/賭|年卡|報警|失蹤/.test(reminderLine(k, "soft", `s${n}`).text));
  }
});
test("inactive 提醒最多用街坊級，spicy 會退返 neighbour", () => {
  for (let n = 0; n < 8; n++) {
    const sp = reminderLine("inactive", "spicy", `x${n}`).text;
    const nb = reminderLine("inactive", "neighbour", `x${n}`).text;
    assert.equal(sp, nb);
  }
});
test("溫柔語氣會傳落提醒（tone=soft）", () => {
  const soft = decideReminders(base({ tone: "soft", nowTime: "07:35", weightLoggedToday: false }))[0].body;
  assert.ok(!/賭|報警|失蹤|拍咗拖/.test(soft));
});
test("深層連結：餐單提醒帶 meal 參數", () => {
  assert.equal(decideReminders(base())[0].url, "/?tab=food&meal=lunch");
});

console.log("food");
test("sumFood", () => {
  assert.deepEqual(
    sumFood([
      { calories: 500, protein_g: 20.25, carbs_g: 60, fat_g: 10 },
      { calories: 150, protein_g: 1, carbs_g: 30.5, fat_g: 0.1 },
    ]),
    { calories: 650, protein_g: 21.3, carbs_g: 90.5, fat_g: 10.1 },
  );
});
test("defaultMealType", () => {
  assert.equal(defaultMealType(8), "breakfast");
  assert.equal(defaultMealType(12), "lunch");
  assert.equal(defaultMealType(16), "snack");
  assert.equal(defaultMealType(19), "dinner");
  assert.equal(defaultMealType(23), "snack");
});

console.log(`\n${passed} 項測試全部通過`);

// npm run test:cantonese
// 廣東話用字檢查：掃走普通話字詞，同我查證唔到出處嘅用字。
// 注意：呢個係自動篩查，唔可以代替母語者審稿。
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  AI_ESTIMATE_NOTE, allGossip, allLines, FOOD_EMPTY, goalMessage, intakeMessage, LOADING_TEXT,
  PHOTO_NOTE, savedMessage, TAGLINE, trendMessage, WEIGHT_EMPTY, WEIGHT_NEED_MORE, WEIGHT_NOT_LOGGED,
} from "../lib/copy.ts";
import { GENERIC, RULES } from "../lib/roast.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// 普通話常用、粵語書面唔用（粵語用：嘅、唔、冇、係、咗、喺、佢哋、呢、嗰、畀、好、啲、嘢…）
const MANDARIN = ["的", "這", "那", "沒", "們", "他", "她", "吧", "嗎", "了", "是", "還", "給", "很", "不", "什麼", "怎麼", "為什麼", "裡", "啥", "咱", "俺", "咋"];
// 我查唔到可靠出處、或者唔夠自然嘅用字（已改走）
const UNVERIFIED = ["波波", "搭住心口", "眼尾掃到", "走甜", "刀仔嘴", "被冷落"];

// 含有「是」「不」等字但係正宗粵語嘅詞，先剔走再檢查
const ALLOWED_WORDS = ["利是", "是但", "唔係幾"];

function offenders(text: string): string[] {
  const t = ALLOWED_WORDS.reduce((acc, w) => acc.replaceAll(w, ""), text);
  return [...MANDARIN, ...UNVERIFIED].filter((w) => t.includes(w));
}

const all: string[] = [
  ...allLines().map((l) => l.text),
  ...allGossip().map((l) => l.text),
  ...RULES.flatMap((r) => [...r.neighbour, ...r.spicy].map((l) => l.text)),
  ...[...GENERIC.neighbour, ...GENERIC.spicy].map((l) => l.text),
  TAGLINE, LOADING_TEXT, WEIGHT_NOT_LOGGED.title, WEIGHT_NOT_LOGGED.sub, WEIGHT_EMPTY, WEIGHT_NEED_MORE,
  FOOD_EMPTY, AI_ESTIMATE_NOTE, PHOTO_NOTE,
  ...[-1.5, -0.5, 0, 0.5].flatMap((t) => (["lose", "gain", "maintain"] as const).map((g) => trendMessage(g, t))),
  trendMessage("lose", null), goalMessage("lose", 70, 70) ?? "", goalMessage("lose", 75, 70) ?? "",
  intakeMessage(0, 2000), intakeMessage(800, 2000), intakeMessage(2300, 2000),
  ...["a", "b", "c", "d"].map((s) => savedMessage(s)),
];

test("對白、街坊閒話、roast、訊息：冇普通話字詞、冇未證實用字", () => {
  const bad = all.map((t) => [t, offenders(t)] as const).filter(([, o]) => o.length);
  assert.deepEqual(bad, []);
});

test("介面文字（components／app 入面嘅中文）：冇普通話字詞、冇未證實用字", () => {
  const files = [
    ...readdirSync("components").filter((f) => f.endsWith(".tsx")).map((f) => `components/${f}`),
    "app/page.tsx", "app/layout.tsx",
  ];
  const bad: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")          // 去 block comment
      .replace(/(^|\s)\/\/.*$/gm, "$1");         // 去 line comment
    for (const run of src.match(/[一-鿿][一-鿿，。！？、：；（）「」『』\s\w%\-·…]*/g) ?? []) {
      const o = offenders(run);
      if (o.length) bad.push(`${f}: 「${run.trim().slice(0, 30)}」→ ${o.join("、")}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("核實過嘅茶餐廳用字有出現（飛砂走奶、走糖走冰），冇出現未證實嘅「走甜」", () => {
  const joined = all.join("\n");
  assert.ok(joined.includes("飛砂走奶"));
  assert.ok(joined.includes("走糖"));
  assert.ok(!joined.includes("走甜"));
});

console.log(`\n${passed} 項測試全部通過`);

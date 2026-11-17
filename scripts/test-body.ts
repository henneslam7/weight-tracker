// npm run test:body（Node >= 22.6）— 身體組成：驗證、推算、比較、設定建議、AI 讀數／總結（fake fetch）
import assert from "node:assert/strict";
import {
  buildFacts, checkScan, compareScans, deriveScan, fatBand, impliedFatPct, katchMcArdleBmr, suggestSettings, toKg, weightAtFatPct,
  type BodyScan,
} from "../lib/body.ts";
import { extractScan, fallbackNarrative, narrateBody, parseNarrative, parseScanExtraction } from "../lib/ai/body.ts";
import { validateProfile } from "../lib/calc.ts";
import { isSafeText, cantoneseOffenders } from "../lib/safety.ts";
import type { Profile } from "../lib/types.ts";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    throw e;
  }
}
const near = (a: number, b: number, tol = 0.051) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const TODAY = "2026-11-17";

// 用戶張磅報告：94.6 kg、體脂 29%、去脂 67.1、肌肉 63.5、BMR 1822…
const scan: BodyScan = {
  measured_on: "2026-11-17", weight_kg: 94.6, body_fat_pct: 29, lean_kg: 67.1, muscle_kg: 63.5, skeletal_muscle_kg: 35.8,
  water_pct: 51.6, protein_pct: 14.8, bone_kg: 3.6, visceral_fat: 13, bmr_kcal: 1822, body_age: 28, bmi: 30.9, heart_rate: 71, source: "screenshot",
};
const profile: Profile = {
  sex: "male", birth_date: "1995-06-01", height_cm: 175, activity_level: null, goal: "lose", target_weight_kg: 75, weekly_rate_kg: null,
  steps_range: "5000_6999", work_activity: "mostly_sitting", exercise_type: "none", pace: "standard", risk_review: "clear",
};

console.log("單位／驗證／推算");
await test("單位換算：lb、斤（1 斤 = 0.5 kg）", () => {
  near(toKg(200, "lb"), 90.7, 0.05);
  near(toKg(189.2, "jin"), 94.6);
  assert.equal(toKg(94.6, "kg"), 94.6);
});
await test("用戶例子：脂肪 27.4 kg、去脂 67.1；BMI 30.9；Katch-McArdle ≈ 磅 BMR 1822", () => {
  const d = deriveScan(scan, 175);
  near(d.fatKg!, 27.4);
  assert.equal(d.leanKg, 67.1);
  near(d.bmi!, 30.9);
  assert.ok(Math.abs(katchMcArdleBmr(67.1) - 1822) <= 5);
  // 冇 lean：由體重同體脂推
  near(deriveScan({ ...scan, lean_kg: null }, 175).leanKg!, 67.2, 0.11);
});
await test("checkScan：例子通過；越界／未來／缺體重／去脂大過體重 → error", () => {
  const ok = checkScan(scan, 175, TODAY);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.warnings, []);
  assert.ok(checkScan({ ...scan, weight_kg: 20 }, 175, TODAY).errors.length > 0);
  assert.ok(checkScan({ ...scan, body_fat_pct: 80 }, 175, TODAY).errors.length > 0);
  assert.ok(checkScan({ ...scan, measured_on: "2026-12-01" }, 175, TODAY).errors.length > 0);
  assert.ok(checkScan({ ...scan, measured_on: "abc" }, 175, TODAY).errors.length > 0);
  assert.ok(checkScan({ ...scan, weight_kg: NaN }, 175, TODAY).errors.length > 0);
  assert.ok(checkScan({ ...scan, lean_kg: 100 }, 175, TODAY).errors.length > 0);
  assert.ok(checkScan({ ...scan, muscle_kg: 120 }, 175, TODAY).errors.length > 0);
});
await test("checkScan 提示（唔阻止）：去脂同體重／體脂對唔上；BMI 同身高對唔上", () => {
  const w1 = checkScan({ ...scan, lean_kg: 55 }, 175, TODAY);
  assert.equal(w1.errors.length, 0);
  assert.ok(w1.warnings.some((w) => w.includes("去脂體重")));
  const w2 = checkScan(scan, 160, TODAY);
  assert.ok(w2.warnings.some((w) => w.includes("BMI")));
});
await test("體脂參考範圍（中性字眼）、現實目標體重、隱含體脂", () => {
  assert.equal(fatBand("male", 29, 31), "high");
  assert.equal(fatBand("male", 20, 31), "typical");
  assert.equal(fatBand("male", 8, 31), "low");
  assert.equal(fatBand("male", 26, 45), "typical"); // 40+ 放寬到 27
  assert.equal(fatBand("female", 30, 30), "typical");
  near(weightAtFatPct(67.1, 20), 83.9);
  near(impliedFatPct(67.1, 75), 10.5);
});

console.log("前後比較");
const prev: BodyScan = { ...scan, measured_on: "2026-11-03", weight_kg: 97.0, body_fat_pct: 31, lean_kg: 66.9 };
await test("減重主要係脂肪 → fat_loss；主要係去脂 → lean_loss；細過 1 kg → noise", () => {
  const fat = compareScans(prev, { ...scan }, 175); // 97.0→94.6：脂肪 30.1→27.4 (−2.7)，去脂 +0.2
  assert.equal(fat.kind, "fat_loss");
  assert.equal(fat.days, 14);
  const lean = compareScans({ ...prev, body_fat_pct: 29, lean_kg: 68.9 }, { ...scan, body_fat_pct: 29 }, 175); // 脂肪減少少，去脂 −1.8
  assert.ok(["lean_loss", "mixed_loss"].includes(lean.kind), lean.kind);
  assert.equal(compareScans(prev, { ...prev, measured_on: "2026-11-10", weight_kg: 96.6 }, 175).kind, "noise");
  const leanLoss = compareScans({ ...prev, weight_kg: 97, body_fat_pct: 29, lean_kg: null }, { ...scan, weight_kg: 94.6, body_fat_pct: 29.7, lean_kg: null }, 175);
  assert.equal(leanLoss.kind, "lean_loss");
});
await test("體重差唔多但脂肪減、去脂增 → recomp；增重主要去脂 → lean_gain；缺資料 → no_data", () => {
  assert.equal(compareScans({ ...prev, weight_kg: 94.8, body_fat_pct: 30.5, lean_kg: 65.9 }, scan, 175).kind, "recomp");
  assert.equal(compareScans({ ...prev, weight_kg: 90, body_fat_pct: 29, lean_kg: 63.9 }, { ...scan, weight_kg: 93, body_fat_pct: 28, lean_kg: 66.9 }, 175).kind, "lean_gain");
  assert.equal(compareScans({ ...prev, body_fat_pct: null, lean_kg: null }, scan, 175).kind, "no_data");
});

console.log("設定建議（候選，要用戶採用）");
await test("目標 75 kg 太低（去脂不變 → 體脂約 10.5%）→ 建議 84 kg；patch 過 validateProfile", () => {
  const s = suggestSettings({ profile, scan, prev: null, today: TODAY });
  const t = s.find((x) => x.id === "target_weight");
  assert.ok(t);
  assert.equal(t.suggested, "84 kg");
  assert.deepEqual(t.patch, { target_weight_kg: 84 });
  assert.equal(validateProfile({ profile: { ...profile, ...t.patch }, currentWeightKg: 94.6, today: TODAY }), null);
  assert.ok(t.facts.some((f) => f.includes("BMI")));
});
await test("未設目標 → 建議；目標已經合理（±4 kg）→ 唔建議", () => {
  assert.ok(suggestSettings({ profile: { ...profile, target_weight_kg: null }, scan, prev: null, today: TODAY }).some((x) => x.id === "target_weight"));
  assert.ok(!suggestSettings({ profile: { ...profile, target_weight_kg: 85 }, scan, prev: null, today: TODAY }).some((x) => x.id === "target_weight"));
  // 維持／增肌唔建議目標體重
  assert.equal(suggestSettings({ profile: { ...profile, goal: "maintain" }, scan, prev: null, today: TODAY }).length, 0);
});
await test("BMI 高但體脂唔高 ＋ 每週重訓 ≥ 2 → 建議體態重組；冇重訓就唔建議", () => {
  const lean: BodyScan = { ...scan, body_fat_pct: 21, lean_kg: 74.7, bmi: 30.9 };
  const trains: Profile = { ...profile, target_weight_kg: 85, exercise_type: "resistance", exercise_sessions_per_week: 3, exercise_minutes: 60 };
  const g = suggestSettings({ profile: trains, scan: lean, prev: null, today: TODAY }).find((x) => x.id === "goal_recomp");
  assert.ok(g);
  assert.deepEqual(g.patch, { goal: "recomp", target_weight_kg: null, weekly_rate_kg: null, pace: null, custom_kcal: null });
  assert.ok(!suggestSettings({ profile: { ...trains, exercise_type: "none" }, scan: lean, prev: null, today: TODAY }).some((x) => x.id === "goal_recomp"));
  assert.ok(!suggestSettings({ profile: trains, scan, prev: null, today: TODAY }).some((x) => x.id === "goal_recomp")); // 體脂 29% 偏高
});
await test("體脂已經偏低 → 建議維持（安全）", () => {
  const thin: BodyScan = { ...scan, weight_kg: 66, body_fat_pct: 7, lean_kg: 61.4, bmi: 21.6 };
  const g = suggestSettings({ profile: { ...profile, target_weight_kg: 60 }, scan: thin, prev: null, today: TODAY }).find((x) => x.id === "goal_maintain");
  assert.ok(g);
  assert.equal(g.patch.goal, "maintain");
});
await test("近排減重主要係去脂體重 → 建議放慢到溫和（並提醒再量確認）", () => {
  const a: BodyScan = { ...scan, measured_on: "2026-11-03", weight_kg: 97, body_fat_pct: 29, lean_kg: null };
  const b: BodyScan = { ...scan, measured_on: "2026-11-17", weight_kg: 94.6, body_fat_pct: 29.7, lean_kg: null };
  const s = suggestSettings({ profile: { ...profile, target_weight_kg: 85 }, scan: b, prev: a, today: TODAY }).find((x) => x.id === "pace_gentle");
  assert.ok(s);
  assert.deepEqual(s.patch, { pace: "gentle", custom_kcal: null, weekly_rate_kg: 0.25 });
  assert.ok(s.facts.some((f) => f.includes("誤差")));
  assert.ok(!suggestSettings({ profile: { ...profile, target_weight_kg: 85, pace: "gentle" }, scan: b, prev: a, today: TODAY }).some((x) => x.id === "pace_gentle"));
});
await test("事實包：BMI vs 體脂、磅 BMR vs app BMR、建議清單（只有 id／標題）", () => {
  const f = buildFacts({ profile, scan, prev, today: TODAY, scanCount: 2, appBmr: 1890 });
  assert.equal(f.fatBand, "偏高");
  assert.equal(f.bmiVsFat, "BMI 同體脂率都偏高");
  assert.equal(f.scaleBmr, 1822);
  assert.equal(f.appBmr, 1890);
  assert.equal(f.change?.kind, "fat_loss");
  assert.ok(f.suggestions.every((s) => !("patch" in s)));
  assert.ok(!JSON.stringify(f).includes("birth")); // 唔帶出生日期／名
});

console.log("AI：讀截圖／寫總結");
await test("parseScanExtraction：斤換 kg、越界丟棄、日期、唔係報告", () => {
  const e = parseScanExtraction({ is_body_report: true, weight_unit: "jin", measured_on: "2026-11-17", weight_kg: 189.2, body_fat_pct: 29, lean_kg: 134.2, bmr_kcal: 1822, heart_rate: 500, bone_kg: 7.2 }, TODAY);
  assert.equal(e.isReport, true);
  near(e.fields.weight_kg!, 94.6);
  near(e.fields.lean_kg!, 67.1);
  assert.equal(e.fields.body_fat_pct, 29);
  assert.equal(e.fields.bmr_kcal, 1822);
  assert.equal(e.fields.heart_rate, undefined);
  assert.deepEqual(e.dropped, ["heart_rate"]);
  assert.equal(e.measuredOn, "2026-11-17");
  assert.equal(parseScanExtraction({ is_body_report: true, weight_unit: "kg", measured_on: "2030-01-01", weight_kg: 90 }, TODAY).measuredOn, null);
  const no = parseScanExtraction({ is_body_report: false, weight_unit: "kg", weight_kg: 90 }, TODAY);
  assert.equal(no.isReport, false);
  assert.deepEqual(no.fields, {});
  assert.equal(parseScanExtraction("garbage", TODAY).isReport, false);
});
await test("parseNarrative：合格 AI 內容採用；越界字眼／未知 id／壞 closing → 該欄位退返固定句子", () => {
  const f = buildFacts({ profile, scan, prev, today: TODAY, scanCount: 2, appBmr: 1890 });
  const good = {
    summary: "你而家體脂率 29%，脂肪約 27.4 kg。近兩個星期體重跌咗，大部分係脂肪，方向啱。",
    highlights: ["去脂體重大致冇變，主要係脂肪減少。", "磅報 BMR 同 app 差約 68 kcal，只供參考。", "再量幾次先睇到穩定趨勢。"],
    suggestion_notes: [{ id: "target_weight", why: "按去脂體重推算，84 kg 較現實。" }, { id: "hack", why: "唔存在嘅建議" }],
    caution: "家用磅量體脂有誤差，睇趨勢唔好睇單次。",
    closing_who: "chan",
    closing: "有記錄就有進步，陳伯睇好你。",
  };
  const n = parseNarrative(good, f);
  assert.equal(n.fromAi, true);
  assert.equal(n.summary, good.summary);
  assert.equal(n.highlights.length, 3);
  assert.deepEqual(Object.keys(n.notes), ["target_weight"]);
  assert.equal(n.who, "chan");
  // 評論身形／恐嚇／普通話 → 退返固定句子
  const bad = parseNarrative({ ...good, summary: "你而家屬於肥胖，會傷身。", highlights: ["你好胖", "這個很差"], caution: "這是診斷", closing: "仆街" }, f);
  const fb = fallbackNarrative(f);
  assert.equal(bad.summary, fb.summary);
  assert.deepEqual(bad.highlights, fb.highlights);
  assert.equal(bad.caution, fb.caution);
  assert.equal(bad.closing, fb.closing);
  assert.deepEqual(parseNarrative(null, f), fb);
  assert.deepEqual(parseNarrative({ summary: 1 }, f), fb);
});
await test("固定句子本身都過安全檢查（唔評論身形、冇普通話）", () => {
  const cases = [
    buildFacts({ profile, scan, prev, today: TODAY, scanCount: 1, appBmr: 1890 }),
    buildFacts({ profile, scan, prev: { ...prev, weight_kg: 97, body_fat_pct: 29, lean_kg: null }, today: TODAY, scanCount: 5, appBmr: null }),
    buildFacts({ profile, scan: { ...scan, body_fat_pct: null, lean_kg: null }, prev: null, today: TODAY, scanCount: 1, appBmr: 1890 }),
  ];
  for (const f of cases) {
    const n = fallbackNarrative(f);
    for (const t of [n.summary, ...n.highlights, n.caution, n.closing]) {
      assert.ok(isSafeText(t), t);
      assert.deepEqual(cantoneseOffenders(t), [], t);
    }
  }
});
await test("extractScan／narrateBody：用 fake fetch 跑通；圖放 inlineData、指示喺 system、key 唔喺 URL", async () => {
  const cfg = { apiKey: "k", model: "m" };
  let body: Record<string, unknown> = {};
  let url = "";
  const fake = (async (u: string | URL | Request, init?: RequestInit) => {
    url = String(u);
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ is_body_report: true, weight_unit: "kg", measured_on: null, weight_kg: 94.6, body_fat_pct: 29 }) }] } }] }), { status: 200 });
  }) as typeof fetch;
  const e = await extractScan({ mimeType: "image/png", data: "AAAA" }, TODAY, cfg, fake);
  assert.equal(e.fields.weight_kg, 94.6);
  const parts = ((body.contents as { parts: Record<string, unknown>[] }[])[0]).parts;
  assert.ok(parts.some((p) => "inlineData" in p));
  assert.ok(JSON.stringify(body.systemInstruction).includes("忽略"));
  assert.ok(!url.includes("k="));
  const facts = buildFacts({ profile, scan, prev: null, today: TODAY, scanCount: 1, appBmr: 1890 });
  const fake2 = (async (_u: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: "體脂率 29%，脂肪約 27.4 kg，先記低，之後睇趨勢。", highlights: ["去脂體重約 67.1 kg。", "再量幾次先睇到趨勢。"], suggestion_notes: [], caution: "家用磅有誤差，睇趨勢。", closing_who: "foon", closing: "慢慢嚟，歡嬸陪住你。" }) }] } }] }), { status: 200 });
  }) as typeof fetch;
  const n = await narrateBody(facts, cfg, fake2);
  assert.equal(n.fromAi, true);
  const userText = JSON.stringify(body.contents);
  assert.ok(userText.includes("27.4") && !userText.includes("Hennes"));
});

console.log(`\n${passed} 項測試全部通過`);

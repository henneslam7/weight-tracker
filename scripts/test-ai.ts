// npm run test:ai（唔會真係 call Gemini，用 fake fetch）
import assert from "node:assert/strict";
import { AiError } from "../lib/ai/errors.ts";
import { buildRequestBody, callGemini, readConfig } from "../lib/ai/gemini.ts";
import { MAX_ITEMS, parseEstimate } from "../lib/ai/schema.ts";

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

const cfg = { apiKey: "test-key", model: "test-model" };
const okBody = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
  });
const item = {
  name: "叉燒飯",
  quantity_text: "1 碟",
  calories: 780,
  protein_g: 30,
  carbs_g: 95,
  fat_g: 28,
  confidence: "medium",
};

async function rejects(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof AiError, "應該係 AiError");
    assert.equal(e.code, code);
    return;
  }
  assert.fail(`應該 throw ${code}`);
}

console.log("schema");
await test("正常輸出", () => {
  const r = parseEstimate({ items: [item] });
  assert.equal(r.length, 1);
  assert.equal(r[0].calories, 780);
});
await test("空陣列 = 認唔到食物（唔係錯誤）", () => {
  assert.deepEqual(parseEstimate({ items: [] }), []);
});
await test("數字夾返合理範圍 + 唔合法嘅項目丟棄", () => {
  const r = parseEstimate({
    items: [
      { ...item, calories: 99999, protein_g: -5, fat_g: "abc" },
      { ...item, name: "" },
      { ...item, calories: NaN },
      "垃圾",
      null,
    ],
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].calories, 3000);
  assert.equal(r[0].protein_g, 0);
  assert.equal(r[0].fat_g, 0);
});
await test("confidence 唔合法 → low", () => {
  assert.equal(parseEstimate({ items: [{ ...item, confidence: "super" }] })[0].confidence, "low");
});
await test("最多 MAX_ITEMS 項", () => {
  const r = parseEstimate({ items: Array.from({ length: 50 }, () => item) });
  assert.equal(r.length, MAX_ITEMS);
});
await test("結構唔啱 → parse error", () => {
  assert.throws(() => parseEstimate(null), AiError);
  assert.throws(() => parseEstimate({ foo: 1 }), AiError);
  assert.throws(() => parseEstimate({ items: "x" }), AiError);
});

console.log("request");
await test("request 帶 JSON schema + 用戶文字包喺資料標記入面", () => {
  const b = buildRequestBody("午餐食咗碗叉燒飯加凍檸茶");
  assert.equal(b.generationConfig.responseMimeType, "application/json");
  assert.ok(b.generationConfig.responseSchema.properties.items);
  assert.ok(b.contents[0].parts[0].text.includes("午餐食咗碗叉燒飯加凍檸茶"));
  assert.ok(b.contents[0].parts[0].text.includes("只當資料"));
});
await test("readConfig：缺 env → config error；model 名有特殊字元 → 拒絕", () => {
  assert.throws(() => readConfig({} as NodeJS.ProcessEnv), AiError);
  assert.throws(
    () => readConfig({ GEMINI_API_KEY: "k", GEMINI_MODEL: "../x?y=1" } as unknown as NodeJS.ProcessEnv),
    AiError,
  );
  assert.equal(
    readConfig({ GEMINI_API_KEY: "k", GEMINI_MODEL: "m-1.0" } as unknown as NodeJS.ProcessEnv).model,
    "m-1.0",
  );
});

console.log("call");
await test("成功：key 放 header，唔放 URL", async () => {
  let url = "";
  let headers: Record<string, string> = {};
  const fake = (async (u: string | URL | Request, init?: RequestInit) => {
    url = String(u);
    headers = init?.headers as Record<string, string>;
    return okBody(JSON.stringify({ items: [item] }));
  }) as typeof fetch;
  const r = (await callGemini(cfg, "叉燒飯", fake)) as { items: unknown[] };
  assert.equal(r.items.length, 1);
  assert.ok(url.endsWith("/test-model:generateContent"));
  assert.ok(!url.includes("test-key"));
  assert.equal(headers["x-goog-api-key"], "test-key");
});
await test("容許 ```json 包住", async () => {
  const fake = (async () => okBody("```json\n" + JSON.stringify({ items: [] }) + "\n```")) as unknown as typeof fetch;
  assert.deepEqual(await callGemini(cfg, "x", fake), { items: [] });
});
await test("HTTP 429 → rate；403/404 → config；500 → upstream", async () => {
  const mk = (s: number) =>
    (async () => new Response(JSON.stringify({ error: { status: "X" } }), { status: s })) as unknown as typeof fetch;
  await rejects(callGemini(cfg, "x", mk(429)), "rate");
  await rejects(callGemini(cfg, "x", mk(403)), "config");
  await rejects(callGemini(cfg, "x", mk(404)), "config");
  await rejects(callGemini(cfg, "x", mk(500)), "upstream");
});
await test("被 safety block → blocked；空內容 / 非 JSON → parse；網絡錯 → upstream", async () => {
  const blocked = (async () =>
    new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 })) as unknown as typeof fetch;
  await rejects(callGemini(cfg, "x", blocked), "blocked");
  const empty = (async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 })) as unknown as typeof fetch;
  await rejects(callGemini(cfg, "x", empty), "parse");
  const notJson = (async () => okBody("唔係 json")) as unknown as typeof fetch;
  await rejects(callGemini(cfg, "x", notJson), "parse");
  const net = (async () => {
    throw new Error("boom");
  }) as unknown as typeof fetch;
  await rejects(callGemini(cfg, "x", net), "upstream");
});

console.log(`\n${passed} 項測試全部通過`);

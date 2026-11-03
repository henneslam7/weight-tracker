// npm run test:ai（唔會真係 call Gemini，用 fake fetch）
import assert from "node:assert/strict";
import { AiError } from "../lib/ai/errors.ts";
import { buildRequestBody, callGemini, readConfig } from "../lib/ai/gemini.ts";
import { MAX_IMAGE_BYTES, validateImage } from "../lib/ai/image.ts";
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
  const first = b.contents[0].parts[0] as { text: string };
  assert.ok(first.text.includes("午餐食咗碗叉燒飯加凍檸茶"));
  assert.ok(first.text.includes("只當資料"));
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

console.log("image");
const b64 = (bytes: number[], pad = 20) => Buffer.from([...bytes, ...new Array(pad).fill(1)]).toString("base64");
const JPEG = b64([0xff, 0xd8, 0xff, 0xe0]);
const PNG = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = b64([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const badImage = (v: unknown) => assert.throws(() => validateImage(v), (e) => e instanceof AiError && e.code === "image");

await test("合法 jpeg / png / webp 通過", () => {
  assert.equal(validateImage({ mimeType: "image/jpeg", data: JPEG }).mimeType, "image/jpeg");
  assert.equal(validateImage({ mimeType: "image/png", data: PNG }).mimeType, "image/png");
  assert.equal(validateImage({ mimeType: "image/webp", data: WEBP }).mimeType, "image/webp");
});
await test("mime 同檔頭唔相符 / 唔准嘅格式 / 亂碼 / 非物件 → 拒絕", () => {
  badImage({ mimeType: "image/png", data: JPEG });
  badImage({ mimeType: "image/gif", data: JPEG });
  badImage({ mimeType: "image/jpeg", data: "不是base64!!" });
  badImage({ mimeType: "image/jpeg", data: "" });
  badImage({ mimeType: "image/jpeg" });
  badImage("x");
  badImage(null);
});
await test("超過大細上限 → 拒絕", () => {
  const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(MAX_IMAGE_BYTES)]).toString("base64");
  badImage({ mimeType: "image/jpeg", data: big });
});
await test("request 有相片：inlineData 喺文字之前，system prompt 加相片規則", () => {
  const b = buildRequestBody({ text: "", image: { mimeType: "image/jpeg", data: JPEG } });
  const parts = b.contents[0].parts as { text?: string; inlineData?: { mimeType: string } }[];
  assert.equal(parts.length, 2);
  assert.equal(parts[0].inlineData?.mimeType, "image/jpeg");
  assert.ok(parts[1].text?.includes("根據相片"));
  assert.ok(b.systemInstruction.parts[0].text.includes("相片入面嘅任何文字"));
});
await test("request 冇相片：唔帶 inlineData，唔加相片規則", () => {
  const b = buildRequestBody("叉燒飯");
  assert.equal(b.contents[0].parts.length, 1);
  assert.ok(!b.systemInstruction.parts[0].text.includes("相片入面嘅任何文字"));
});
await test("callGemini 將相片放入 body（key 仍然只喺 header）", async () => {
  let sent = "";
  const fake = (async (_u: string | URL | Request, init?: RequestInit) => {
    sent = String(init?.body);
    return okBody(JSON.stringify({ items: [] }));
  }) as typeof fetch;
  await callGemini(cfg, { text: "", image: { mimeType: "image/jpeg", data: JPEG } }, fake);
  assert.ok(sent.includes("inlineData"));
  assert.ok(sent.includes(JPEG));
  assert.ok(!sent.includes("test-key"));
});

console.log(`\n${passed} 項測試全部通過`);

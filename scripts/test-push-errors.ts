// npm run test:push-errors
import assert from "node:assert/strict";
import { friendlyPushError, withTimeout } from "../lib/push-errors.ts";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const named = (name: string, message = "x") => Object.assign(new Error(message), { name });

await test("瀏覽器英文錯誤轉做人話（InvalidCharacterError、NotAllowed、Abort）", () => {
  assert.match(friendlyPushError(named("InvalidCharacterError", "The string contains invalid characters.")), /VAPID.*Redeploy/);
  assert.match(friendlyPushError(new Error("The string contains invalid characters.")), /VAPID/);
  assert.match(friendlyPushError(named("NotAllowedError")), /通知權限/);
  assert.match(friendlyPushError(named("AbortError")), /推送服務暫時連唔到/);
});
await test("Supabase 嘅 plain object 錯誤：唔再顯示 [object Object]，而且講明缺表／RLS", () => {
  const missing = friendlyPushError({ code: "PGRST205", message: "Could not find the table 'public.push_subscriptions'" });
  assert.match(missing, /schema_phase2\.sql/);
  assert.match(friendlyPushError({ code: "42P01", message: "relation does not exist" }), /schema_phase2\.sql/);
  assert.match(friendlyPushError({ code: "42501", message: "new row violates row-level security policy" }), /登出再登入/);
  assert.equal(friendlyPushError({ message: "網絡斷咗" }), "網絡斷咗");
  for (const weird of [{}, { code: 1 }, null, undefined, 42, "", {}]) assert.ok(!/object Object/.test(friendlyPushError(weird)));
  assert.equal(friendlyPushError({}), "開啟通知失敗");
});
await test("withTimeout：逾時變 TimeoutError 並顯示步驟名；正常完成就唔逾時；原本嘅錯誤照傳", async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 20, "訂閱推送等咗太耐"), (e: Error) => e.name === "TimeoutError" && e.message.includes("訂閱推送"));
  assert.equal(await withTimeout(Promise.resolve(7), 50, "x"), 7);
  await assert.rejects(withTimeout(Promise.reject(new Error("boom")), 50, "x"), /boom/);
  assert.match(friendlyPushError(named("TimeoutError", "註冊服務等咗太耐")), /註冊服務等咗太耐.*主畫面/);
});

console.log(`\n${passed} 項測試全部通過`);

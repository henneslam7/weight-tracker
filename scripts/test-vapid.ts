// npm run test:vapid
import assert from "node:assert/strict";
import webpush from "web-push";
import { cleanVapidKey, vapidKeyProblem, vapidKeyToBytes, VAPID_PUBLIC_LENGTH } from "../lib/vapid.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const KEY = "BO0sstKMlxNqHzYSEeNszpAcg7hEu0F_aPobQBMrOZLBqZUJh48DI0ywcqIgxGpzn1QbzikIpFf8On1ay9B-QbI"; // 之前畀你嘅公開 key
const b64url = (b: Buffer) => b.toString("base64url");

test("正確嘅公開 key：87 字元、解碼 65 bytes、頭一個 byte 係 4", () => {
  assert.equal(KEY.length, VAPID_PUBLIC_LENGTH);
  assert.equal(vapidKeyProblem(KEY), null);
  const b = vapidKeyToBytes(KEY);
  assert.equal(b.length, 65);
  assert.equal(b[0], 4);
});

test("Vercel 常見貼錯：尾部換行、前後空格、引號、結尾 =、標準 base64 嘅 + /，清理後都用得", () => {
  for (const raw of [`${KEY}\n`, `  ${KEY}  `, `"${KEY}"`, `'${KEY}'`, `${KEY}=`, `${KEY}\r\n`, `${KEY.slice(0, 40)} ${KEY.slice(40)}`]) {
    assert.equal(vapidKeyProblem(raw), null, JSON.stringify(raw));
    assert.equal(cleanVapidKey(raw), KEY);
  }
  const std = Buffer.from(KEY, "base64url").toString("base64"); // 標準 base64（可能有 + /）
  assert.equal(vapidKeyProblem(std), null);
  assert.deepEqual([...vapidKeyToBytes(std)], [...vapidKeyToBytes(KEY)]);
});

test("真正有問題嘅 key：講明邊度唔啱（唔合法字元、長度、唔係 P-256）", () => {
  assert.match(vapidKeyProblem(undefined)!, /未設定/);
  assert.match(vapidKeyProblem("   ")!, /未設定/);
  assert.match(vapidKeyProblem(KEY.slice(0, 40) + "$" + KEY.slice(41))!, /唔合法字元「\$」/);
  assert.match(vapidKeyProblem(KEY.slice(0, 40) + "中" + KEY.slice(41))!, /唔合法字元「中」/);
  assert.match(vapidKeyProblem(KEY.slice(0, 80))!, /長度唔啱：收到 80 個字元，應該係 87 個/);
  assert.match(vapidKeyProblem(KEY + "AAAA")!, /長度唔啱/);
  const notPoint = b64url(Buffer.concat([Buffer.from([5]), Buffer.alloc(64, 7)])); // 65 bytes 但頭一個 byte 唔係 4
  assert.equal(notPoint.length, 87);
  assert.match(vapidKeyProblem(notPoint)!, /唔係有效嘅 P-256/);
});

test("舊做法會爆：web-push 對有尾部換行嘅 key 直接拒絕；清理後正常", () => {
  const pair = webpush.generateVAPIDKeys();
  assert.equal(vapidKeyProblem(pair.publicKey), null);
  assert.throws(() => webpush.setVapidDetails("https://example.com", `${pair.publicKey}\n`, pair.privateKey));
  assert.doesNotThrow(() => webpush.setVapidDetails("https://example.com", cleanVapidKey(`${pair.publicKey}\n`), pair.privateKey));
});

test("每次新生成嘅 VAPID 公開 key 都通過驗證", () => {
  for (let i = 0; i < 20; i++) assert.equal(vapidKeyProblem(webpush.generateVAPIDKeys().publicKey), null);
});

console.log(`\n${passed} 項測試全部通過`);

// npm run test:install
import assert from "node:assert/strict";
import { isIosSafariUa } from "../lib/install.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
const IPAD_DESKTOP_MODE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

test("iPhone Safari → true", () => assert.equal(isIosSafariUa(IPHONE_SAFARI), true));
test("iPhone Chrome / App 內置瀏覽器 → false", () => {
  assert.equal(isIosSafariUa(IPHONE_CHROME), false);
  assert.equal(isIosSafariUa(IPHONE_INSTAGRAM), false);
});
test("Android Chrome → false", () => assert.equal(isIosSafariUa(ANDROID_CHROME), false));
test("iPad 桌面模式（MacIntel + 觸控）→ true；真 Mac → false", () => {
  assert.equal(isIosSafariUa(IPAD_DESKTOP_MODE, "MacIntel", 5), true);
  assert.equal(isIosSafariUa(IPAD_DESKTOP_MODE, "MacIntel", 0), false);
});
console.log(`\n${passed} 項測試全部通過`);

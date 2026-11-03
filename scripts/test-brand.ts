// npm run test:brand：名、icon、manifest 一致，冇舊名殘留
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import manifest from "../app/manifest.ts";
import { ASSET_V, assetUrl, ICON_FILES } from "../lib/brand.ts";
import { APP_NAME, APP_SHORT_NAME } from "../lib/copy.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

function pngSize(file: string): [number, number] {
  const b = readFileSync(file);
  assert.equal(b.subarray(1, 4).toString(), "PNG", `${file} 唔係 PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test("名：食咗飯未（主畫面名夠短）", () => {
  assert.equal(APP_NAME, "食咗飯未");
  assert.equal(APP_SHORT_NAME, "食咗飯未");
  assert.ok(APP_SHORT_NAME.length <= 8);
});

test("manifest：新名、standalone、icon 帶版本號，檔案存在而且尺寸啱", () => {
  const m = manifest();
  assert.equal(m.name, APP_NAME);
  assert.equal(m.short_name, APP_SHORT_NAME);
  assert.equal(m.display, "standalone");
  assert.equal(m.lang, "zh-HK");
  for (const i of m.icons ?? []) {
    assert.ok(i.src.endsWith(`?v=${ASSET_V}`), i.src);
    const file = join("public", i.src.split("?")[0]);
    assert.ok(existsSync(file), file);
    const [w, h] = pngSize(file);
    assert.equal(`${w}x${h}`, i.sizes);
  }
  assert.ok((m.icons ?? []).some((i) => i.purpose === "maskable"));
});

test("apple-touch-icon 180x180、favicon 32x32、有 favicon.ico；iOS icon 冇透明位", () => {
  assert.deepEqual(pngSize(join("public", ICON_FILES.apple)), [180, 180]);
  assert.deepEqual(pngSize(join("public", ICON_FILES.favicon32)), [32, 32]);
  assert.ok(existsSync(join("public", ICON_FILES.favicon)));
  const b = readFileSync(join("public", ICON_FILES.apple));
  assert.equal(b[25], 2, "colour type 應該係 RGB（2），冇 alpha"); // IHDR: bit depth@24, colour type@25
});

test("service worker 通知 icon 版本號同 ASSET_V 一致", () => {
  const sw = readFileSync("public/sw.js", "utf8");
  assert.ok(sw.includes(`/icon-192.png?v=${ASSET_V}`), "sw.js 嘅 icon 版本號要同 lib/brand.ts 一致");
  assert.ok(!/icon-192\.png"/.test(sw), "sw.js 唔應該有冇版本號嘅 icon");
});

test("assetUrl 帶版本號", () => assert.equal(assetUrl("/a.png"), `/a.png?v=${ASSET_V}`));

test("冇舊名殘留（Fit AI、Fit 過林峯、林峯）：source、public、README", () => {
  const stale = /Fit ?AI|Fit ?過林峯|林峯/;
  const skip = new Set(["node_modules", ".next", ".git", "scripts"]);
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      if (skip.has(f)) continue;
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|css|md|json|webmanifest|sql|html|js)$/.test(f) && f !== "package-lock.json") {
        if (stale.test(readFileSync(p, "utf8"))) hits.push(p);
      }
    }
  };
  walk(".");
  assert.deepEqual(hits, []);
});

console.log(`\n${passed} 項測試全部通過`);

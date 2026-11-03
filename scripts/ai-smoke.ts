// 用你自己部電腦驗證 Gemini key 同 model 名（真係會 call Gemini，會用少量 quota）。
//
//   GEMINI_API_KEY=你嘅key GEMINI_MODEL=model名 node scripts/ai-smoke.ts "午餐食咗碗叉燒飯加凍檸茶"
//   GEMINI_API_KEY=你嘅key GEMINI_MODEL=model名 node scripts/ai-smoke.ts --image 食物相.jpg
//
// Key 只放喺你自己嘅終端機環境變數，唔好 commit、唔好貼俾任何人。
import { readFileSync } from "node:fs";
import { estimateFood, validateImage, type ImageInput } from "../lib/ai/index.ts";

// 用法：node scripts/ai-smoke.ts "文字"            測文字
//       node scripts/ai-smoke.ts --image 相.jpg    測相片（可再加文字補充）
const args = process.argv.slice(2);
let image: ImageInput | undefined;
const i = args.indexOf("--image");
if (i >= 0) {
  const file = args.splice(i, 2)[1];
  const mimeType = /\.png$/i.test(file) ? "image/png" : /\.webp$/i.test(file) ? "image/webp" : "image/jpeg";
  image = validateImage({ mimeType, data: readFileSync(file).toString("base64") });
}
const text = args.join(" ") || (image ? "" : "午餐食咗碗叉燒飯加凍檸茶");
console.log(`輸入：${text || "（淨係相片）"}\n`);

try {
  const items = await estimateFood({ text, image });
  if (items.length === 0) console.log("AI 認唔到食物（items 為空）");
  for (const i of items) {
    console.log(
      `${i.name}（${i.quantity_text}） ${i.calories} kcal | P ${i.protein_g} C ${i.carbs_g} F ${i.fat_g} | 信心 ${i.confidence}`,
    );
  }
  console.log("\n✅ Gemini 連線同 JSON 格式都正常");
} catch (e) {
  console.error(`❌ ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
  process.exit(1);
}

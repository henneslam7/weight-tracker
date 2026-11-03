// 用你自己部電腦驗證 Gemini key 同 model 名（真係會 call Gemini，會用少量 quota）。
//
//   GEMINI_API_KEY=你嘅key GEMINI_MODEL=model名 node scripts/ai-smoke.ts "午餐食咗碗叉燒飯加凍檸茶"
//
// Key 只放喺你自己嘅終端機環境變數，唔好 commit、唔好貼俾任何人。
import { estimateFood } from "../lib/ai/index.ts";

const text = process.argv.slice(2).join(" ") || "午餐食咗碗叉燒飯加凍檸茶";
console.log(`輸入：${text}\n`);

try {
  const items = await estimateFood(text);
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

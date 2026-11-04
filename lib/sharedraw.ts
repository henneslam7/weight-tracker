// 將 ShareModel 畫成圖（Canvas 2D，純前端，唔會上傳任何嘢）。只喺瀏覽器用。

import { BACKGROUND_COLOR, THEME_COLOR } from "./brand.ts";
import type { ShareModel } from "./sharecard.ts";

export const SHARE_W = 1080;
const BASE_H = 1350;
const FONT = '"PingFang HK","Noto Sans HK","Noto Sans CJK TC","Microsoft JhengHei","Heiti TC",sans-serif';
const INK = "#1c1917";
const MUTED = "#78716c";
const AMBER = "#d97706";
const TEAL_SOFT = "#ccfbf1";

const ROW_H = 54;
const MEAL_H = 66;

const LIST_TOP = 900; // 食物清單卡頂（主卡 190+560，加營養素列）
const FOOT = 250; // 清單卡底到圖底（街坊句 ＋ 免責）

/** 清單卡所需高度 */
function listHeight(m: ShareModel): number {
  if (!m.meals.length) return 160;
  return 20 + m.meals.reduce((a, meal) => a + MEAL_H + meal.items.length * ROW_H, 0) + (m.moreCount > 0 ? ROW_H : 0) + 30;
}

/** 圖高：最少 1350，食物多就加長（最高 2000） */
export function shareHeight(m: ShareModel): number {
  return Math.min(2000, Math.max(BASE_H, LIST_TOP + listHeight(m) + FOOT));
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, weight = 500, align: CanvasTextAlign = "left") {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(s, x, y);
}

/** 文字太長就截短加 … */
function fit(ctx: CanvasRenderingContext2D, s: string, maxW: number): string {
  if (ctx.measureText(s).width <= maxW) return s;
  let t = [...s];
  while (t.length > 1 && ctx.measureText(t.join("") + "…").width > maxW) t = t.slice(0, -1);
  return t.join("") + "…";
}

export interface DrawImages {
  avatar?: CanvasImageSource | null;
  logo?: CanvasImageSource | null;
}

export function drawShareCard(ctx: CanvasRenderingContext2D, m: ShareModel, imgs: DrawImages = {}) {
  const W = SHARE_W;
  const H = shareHeight(m);
  const accent = m.mode === "over" ? AMBER : THEME_COLOR;
  const PAD = 64;

  // 背景
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, 520);
  g.addColorStop(0, "rgba(15,118,110,0.16)");
  g.addColorStop(1, "rgba(15,118,110,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 520);

  // 頂：logo + 名 + 日期
  if (imgs.logo) {
    ctx.save();
    rr(ctx, PAD, 56, 84, 84, 22);
    ctx.clip();
    ctx.drawImage(imgs.logo, PAD, 56, 84, 84);
    ctx.restore();
  }
  text(ctx, "食咗飯未", PAD + 108, 108, 50, THEME_COLOR, 900);
  text(ctx, "今日食咗幾多？", PAD + 108, 150, 26, MUTED, 500);
  text(ctx, m.dateText, W - PAD, 112, 44, INK, 800, "right");

  // 主卡：圓環 + 大數字
  const cardY = 190;
  const cardH = 560;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.08)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  rr(ctx, PAD, cardY, W - PAD * 2, cardH, 48);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  const cx = W / 2;
  const cy = cardY + 270;
  const R = 200;
  ctx.lineWidth = 36;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#f1f5f4";
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  if (m.progress > 0) {
    ctx.strokeStyle = accent;
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * m.progress);
    ctx.stroke();
  }
  text(ctx, String(m.bigNumber), cx, cy + 36, m.bigNumber >= 1000 ? 120 : 140, accent, 900, "center");
  text(ctx, m.bigLabel, cx, cy + 96, 34, MUTED, 600, "center");
  text(ctx, `已食 ${m.eaten} ／ 上限 ${m.budget} kcal${m.exercise > 0 ? `（含運動 ${m.exercise}）` : ""}`, cx, cardY + cardH - 40, 30, MUTED, 500, "center");

  // 營養素
  let y = cardY + cardH + 40;
  const colW = (W - PAD * 2 - 48) / 3;
  m.macros.forEach((mc, i) => {
    const x = PAD + i * (colW + 24);
    text(ctx, mc.label, x, y + 30, 28, MUTED, 600);
    text(ctx, `${mc.value}／${mc.target} g`, x + colW, y + 30, 28, INK, 700, "right");
    rr(ctx, x, y + 46, colW, 16, 8);
    ctx.fillStyle = "#e7e5e4";
    ctx.fill();
    const p = mc.target > 0 ? Math.min(1, mc.value / mc.target) : 0;
    if (p > 0) {
      rr(ctx, x, y + 46, Math.max(16, colW * p), 16, 8);
      ctx.fillStyle = mc.value > mc.target ? AMBER : THEME_COLOR;
      ctx.fill();
    }
  });
  y += 110;

  // 食物清單
  const listBottom = H - FOOT;
  if (m.meals.length) {
    ctx.save();
    rr(ctx, PAD, y, W - PAD * 2, listBottom - y, 40);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();
    let ly = y + 20;
    for (const meal of m.meals) {
      text(ctx, meal.label, PAD + 40, ly + 46, 32, THEME_COLOR, 800);
      text(ctx, `${meal.kcal} kcal`, W - PAD - 40, ly + 46, 30, INK, 800, "right");
      ly += MEAL_H;
      for (const it of meal.items) {
        ctx.font = `500 30px ${FONT}`;
        text(ctx, fit(ctx, it.name, 560), PAD + 64, ly + 36, 30, INK, 500);
        text(ctx, `${it.kcal}`, W - PAD - 40, ly + 36, 30, MUTED, 500, "right");
        ly += ROW_H;
      }
    }
    if (m.moreCount > 0) text(ctx, `另外仲有 ${m.moreCount} 款`, PAD + 64, ly + 34, 28, MUTED, 500);
  } else {
    text(ctx, "今日仲未記錄食物", cx, y + 80, 36, MUTED, 600, "center");
  }

  // 底：街坊 + 一句
  const by = H - 210;
  rr(ctx, PAD, by, W - PAD * 2, 150, 40);
  ctx.fillStyle = TEAL_SOFT;
  ctx.fill();
  if (imgs.avatar) {
    ctx.save();
    rr(ctx, PAD + 24, by + 22, 106, 106, 26);
    ctx.clip();
    ctx.drawImage(imgs.avatar, PAD + 24, by + 22, 106, 106);
    ctx.restore();
  }
  text(ctx, m.whoName, PAD + 154, by + 60, 28, THEME_COLOR, 800);
  ctx.font = `600 32px ${FONT}`;
  text(ctx, fit(ctx, m.caption, W - PAD * 2 - 190), PAD + 154, by + 108, 32, INK, 600);
  text(ctx, "AI 估算，只供參考　·　食咗飯未", cx, H - 24, 22, "#a8a29e", 500, "center");
}

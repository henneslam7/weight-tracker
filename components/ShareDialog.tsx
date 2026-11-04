"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Plan } from "@/lib/calc";
import { ICON_FILES, assetUrl } from "@/lib/brand";
import { WHO_AVATAR } from "@/lib/copy";
import { buildShareModel } from "@/lib/sharecard";
import { drawShareCard, SHARE_W, shareHeight } from "@/lib/sharedraw";
import type { FoodLog } from "@/lib/types";
import { btnGhost, btnPrimary, errorBox } from "./ui";

interface Props {
  today: string;
  plan: Plan;
  foods: FoodLog[];
  exerciseBurned: number;
  onClose: () => void;
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });
}

/** 「分享今日」：畫一張靚圖，用系統分享表（WhatsApp／IG 等）分享，唔支援就俾你儲存 */
export default function ShareDialog({ today, plan, foods, exerciseBurned, onClose }: Props) {
  const [showNames, setShowNames] = useState(true);
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const blobRef = useRef<Blob | null>(null);

  const model = useMemo(
    () => buildShareModel({ today, plan, foods, exerciseBurned, showNames }),
    [today, plan, foods, exerciseBurned, showNames],
  );

  useEffect(() => {
    let cancelled = false;
    let made: string | null = null;
    (async () => {
      const [avatar, logo] = await Promise.all([loadImg(WHO_AVATAR[model.who]), loadImg(assetUrl(ICON_FILES.icon192))]);
      const canvas = document.createElement("canvas");
      canvas.width = SHARE_W;
      canvas.height = shareHeight(model);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setMsg("呢部機畫唔到圖，請截圖分享。");
        return;
      }
      drawShareCard(ctx, model, { avatar, logo });
      canvas.toBlob((b) => {
        if (cancelled || !b) return;
        blobRef.current = b;
        made = URL.createObjectURL(b);
        setUrl(made);
      }, "image/png");
    })();
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [model]);

  async function share() {
    setMsg(null);
    const blob = blobRef.current;
    if (!blob) return;
    const file = new File([blob], `食咗飯未-${today}.png`, { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "食咗飯未" });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // 自己取消
    }
    // 後備：下載
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setMsg("你部機唔支援直接分享，已儲存圖片。你亦可以長按上面張圖儲存。");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label="分享今日">
      <div className="max-h-[94vh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-3xl bg-white p-4 sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-teal-800">分享今日</h2>
          <button className="rounded-full px-3 py-1 text-stone-500" onClick={onClose} aria-label="關閉">✕</button>
        </div>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="今日食咩摘要圖" className="w-full rounded-2xl ring-1 ring-stone-200" />
        ) : (
          <div className="flex h-64 items-center justify-center rounded-2xl bg-stone-100 text-stone-500">整緊圖…</div>
        )}
        <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
          <input type="checkbox" className="h-5 w-5 accent-teal-700" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} />
          顯示食物名稱（唔剔就只顯示每餐 kcal）
        </label>
        <p className="text-xs text-stone-500">圖入面冇你嘅體重、年齡同名，只有今日食物、kcal 同營養素。圖只喺你部機整，唔會上傳。</p>
        {msg && <p className={errorBox}>{msg}</p>}
        <button className={btnPrimary} onClick={() => void share()} disabled={!url}>分享</button>
        <button className={btnGhost} onClick={onClose}>關閉</button>
      </div>
    </div>
  );
}

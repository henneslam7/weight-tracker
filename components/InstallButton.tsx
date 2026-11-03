"use client";

import { useEffect, useState } from "react";
import {
  getDeferred,
  isIosSafari,
  promptInstall,
  subscribeInstall,
  wasInstalled,
} from "@/lib/install";
import { isIos, isStandalone } from "@/lib/push-client";
import { btnGhost, btnPrimary } from "./ui";

const DISMISS_KEY = "fit.installDismissed";

function useInstallState() {
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false); // 已安裝／由主畫面開
  useEffect(() => {
    const sync = () => setHidden(isStandalone() || wasInstalled());
    sync();
    setReady(true);
    return subscribeInstall(sync);
  }, []);
  return { ready, hidden };
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mx-0.5 inline h-5 w-5 align-text-bottom"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 11v8a2 2 0 002 2h10a2 2 0 002-2v-8" />
    </svg>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">
        {n}
      </span>
      <span className="pt-0.5 leading-relaxed">{children}</span>
    </li>
  );
}

function InstallSheet({ onClose }: { onClose: () => void }) {
  const ios = isIos();
  const safari = isIosSafari();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
    } catch {
      /* 唔支援就算 */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="加入主畫面"
        className="w-full max-w-md rounded-t-3xl bg-white p-5 text-left pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">加入主畫面</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400" aria-label="關閉">
            ✕
          </button>
        </div>

        {ios && !safari && (
          <div className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            你而家唔係用 Safari。請複製網址，用 <b>Safari</b> 開啟再加入。
            <button onClick={() => void copyLink()} className="mt-2 block font-semibold underline">
              {copied ? "已複製 ✓" : "複製網址"}
            </button>
          </div>
        )}

        {ios ? (
          <ol className="space-y-3 text-[15px] text-slate-700">
            <Step n={1}>
              撳 Safari 嘅<b>分享掣</b> <ShareIcon />（喺螢幕底部或者頂部）
            </Step>
            <Step n={2}>
              向下捲，揀 <b>「加入主畫面」</b>
            </Step>
            <Step n={3}>
              撳右上角嘅 <b>「加入」</b>
            </Step>
            <Step n={4}>
              返到主畫面，撳 <b>食咗飯未</b> icon 開啟。要由主畫面開，先收到推送提醒
            </Step>
          </ol>
        ) : (
          <ol className="space-y-3 text-[15px] text-slate-700">
            <Step n={1}>
              撳瀏覽器右上角嘅 <b>⋮</b> 選單
            </Step>
            <Step n={2}>
              揀 <b>「安裝 App」</b> 或者 <b>「加入主畫面」</b>
            </Step>
            <Step n={3}>確認安裝，然後由主畫面開啟</Step>
          </ol>
        )}

        <button className={`${btnGhost} mt-5`} onClick={onClose}>
          明白
        </button>
      </div>
    </div>
  );
}

interface ButtonProps {
  variant?: "primary" | "ghost" | "link";
  label?: string;
}

/** 「加入主畫面」掣：Chrome 系直接彈安裝視窗；iOS 彈出圖文步驟。已安裝就隱藏。 */
export default function InstallButton({ variant = "primary", label = "📲 加入主畫面" }: ButtonProps) {
  const { ready, hidden } = useInstallState();
  const [open, setOpen] = useState(false);

  if (!ready || hidden) return null;

  async function onClick() {
    if (getDeferred()) {
      const outcome = await promptInstall();
      if (outcome !== "unavailable") return;
    }
    setOpen(true);
  }

  const cls =
    variant === "primary"
      ? btnPrimary
      : variant === "ghost"
        ? btnGhost
        : "text-sm font-medium text-teal-800 underline";

  return (
    <>
      <button type="button" className={cls} onClick={() => void onClick()}>
        {label}
      </button>
      {open && <InstallSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** 頁頂提示橫額，可以撳「唔使」收埋（記住喺呢部裝置） */
export function InstallBanner() {
  const { ready, hidden } = useInstallState();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!ready || hidden || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* 私人模式等情況，唔儲存都冇問題 */
    }
  }

  return (
    <div className="rounded-2xl bg-teal-50 p-4 ring-1 ring-teal-200">
      <p className="font-semibold text-teal-900">加入主畫面，一撳就開</p>
      <p className="mt-1 text-sm text-teal-800">加入後先可以收到記錄食物同體重嘅提醒。</p>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1">
          <InstallButton variant="primary" label="📲 加入主畫面" />
        </div>
        <button onClick={dismiss} className="rounded-xl px-3 py-3 text-sm text-slate-500">
          唔使
        </button>
      </div>
    </div>
  );
}

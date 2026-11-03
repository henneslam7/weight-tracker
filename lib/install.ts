// 「加入主畫面」輔助。
// - Chrome / Edge / Android：瀏覽器會發 beforeinstallprompt，我哋攞住佢，之後可以由掣觸發真正嘅安裝視窗。
// - iOS Safari：Apple 冇提供 API，只可以教用戶用「分享 → 加入主畫面」。
//
// 事件可能喺 component 出現之前已經發出，所以喺 module 層面尾住佢。

export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
}

export const getDeferred = () => deferred;
export const wasInstalled = () => installed;

export function subscribeInstall(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

/** 彈出系統安裝視窗（只限支援 beforeinstallprompt 嘅瀏覽器） */
export async function promptInstall(): Promise<InstallOutcome> {
  const ev = deferred;
  if (!ev) return "unavailable";
  deferred = null; // 每個 event 只可以用一次
  notify();
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  return outcome;
}

/** 係咪 iOS 上面嘅 Safari（其他 iOS 瀏覽器／App 內置瀏覽器，加入主畫面嘅步驟唔同） */
export function isIosSafariUa(ua: string, platform = "", maxTouchPoints = 0): boolean {
  const ios = /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
  if (!ios) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line\/|MicroMessenger|WhatsApp/i.test(ua)) {
    return false;
  }
  return /Safari/.test(ua);
}

export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  return isIosSafariUa(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
}

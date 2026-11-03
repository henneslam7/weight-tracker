// 名、icon、顏色嘅單一來源。layout、manifest、測試都用呢度。
//
// 改 icon 或者名之後，將 ASSET_V 加 1：iOS／Safari 會當成新檔案，唔會食舊 cache。
// （iOS「加入主畫面」嗰刻就會鎖死名同 icon，已經加入嘅要刪咗重新加入先會更新。）

export const ASSET_V = "3";
export const THEME_COLOR = "#0f766e";
export const BACKGROUND_COLOR = "#fff8ee";

export const assetUrl = (path: string) => `${path}?v=${ASSET_V}`;

export const ICON_FILES = {
  favicon: "/favicon.ico",
  favicon32: "/favicon-32.png",
  icon192: "/icon-192.png",
  icon512: "/icon-512.png",
  apple: "/apple-touch-icon.png",
} as const;

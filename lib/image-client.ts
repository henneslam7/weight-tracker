// 瀏覽器端：將相機／相簿相片壓縮成細 JPEG，先傳去 server。
// 目的：慳流量、慳 AI token、避開 Vercel 4.5MB body 上限。
import { MAX_IMAGE_BYTES } from "./ai/image.ts";

export interface PreparedImage {
  mimeType: "image/jpeg";
  /** base64，唔包 data: 前綴 */
  data: string;
  /** 預覽用，用完要 URL.revokeObjectURL */
  previewUrl: string;
}

async function decode(file: File): Promise<{ source: CanvasImageSource; w: number; h: number; close: () => void }> {
  try {
    // from-image：按 EXIF 方向轉正（iPhone 直向相片）
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return { source: img, w: img.naturalWidth, h: img.naturalHeight, close: () => {} };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("壓縮相片失敗"))), "image/jpeg", quality),
  );
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) throw new Error("請揀相片檔案");
  if (file.size > 25_000_000) throw new Error("相片太大，請揀細啲嘅相");

  const dec = await decode(file).catch(() => {
    throw new Error("讀取唔到相片，請試下另一張");
  });
  try {
    const attempts: [number, number][] = [
      [1280, 0.8],
      [1280, 0.65],
      [1024, 0.6],
      [800, 0.55],
    ];
    for (const [edge, quality] of attempts) {
      const scale = Math.min(1, edge / Math.max(dec.w, dec.h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(dec.w * scale));
      canvas.height = Math.max(1, Math.round(dec.h * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("瀏覽器唔支援處理相片");
      ctx.fillStyle = "#fff"; // PNG 透明位轉白底
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(dec.source, 0, 0, canvas.width, canvas.height);
      const blob = await toBlob(canvas, quality);
      if (blob.size <= MAX_IMAGE_BYTES) {
        return {
          mimeType: "image/jpeg",
          data: await toBase64(blob),
          previewUrl: URL.createObjectURL(blob),
        };
      }
    }
    throw new Error("相片壓縮後仍然太大，請試下另一張");
  } finally {
    dec.close();
  }
}

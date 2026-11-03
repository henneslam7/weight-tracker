import type { MetadataRoute } from "next";
import { assetUrl, BACKGROUND_COLOR, ICON_FILES, THEME_COLOR } from "../lib/brand.ts";
import { APP_NAME, APP_SHORT_NAME, TAGLINE } from "../lib/copy.ts";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: TAGLINE,
    lang: "zh-HK",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      { src: assetUrl(ICON_FILES.icon192), sizes: "192x192", type: "image/png" },
      { src: assetUrl(ICON_FILES.icon512), sizes: "512x512", type: "image/png" },
      { src: assetUrl(ICON_FILES.icon512), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

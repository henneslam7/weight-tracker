import type { Metadata, Viewport } from "next";
import { assetUrl, ICON_FILES, THEME_COLOR } from "@/lib/brand";
import { APP_NAME, APP_SHORT_NAME, TAGLINE } from "@/lib/copy";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: TAGLINE,
  appleWebApp: { capable: true, title: APP_SHORT_NAME, statusBarStyle: "default" },
  applicationName: APP_NAME,
  icons: {
    icon: [
      { url: assetUrl(ICON_FILES.favicon), sizes: "any" },
      { url: assetUrl(ICON_FILES.favicon32), sizes: "32x32", type: "image/png" },
      { url: assetUrl(ICON_FILES.icon192), sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: assetUrl(ICON_FILES.apple), sizes: "180x180", type: "image/png" }],
  },
  openGraph: { title: APP_NAME, description: TAGLINE, locale: "zh_HK", type: "website" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: THEME_COLOR,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}

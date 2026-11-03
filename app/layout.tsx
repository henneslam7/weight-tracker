import type { Metadata, Viewport } from "next";
import { APP_NAME, APP_SHORT_NAME, TAGLINE } from "@/lib/copy";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: TAGLINE,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: APP_SHORT_NAME, statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#10b981",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}

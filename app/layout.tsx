import type { Metadata, Viewport } from "next";
import { APP_NAME, APP_SHORT_NAME, TAGLINE } from "@/lib/copy";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: TAGLINE,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: APP_SHORT_NAME, statusBarStyle: "default" },
  applicationName: APP_NAME,
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}

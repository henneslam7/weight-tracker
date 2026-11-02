import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fit AI",
  description: "個人健身助手：calories、體重、AI 教練",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Fit AI", statusBarStyle: "default" },
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

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auto Calendar",
  description: "Generate ICS subscription links from natural language schedules.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

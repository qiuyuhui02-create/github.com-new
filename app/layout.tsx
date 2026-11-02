import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "aikari · AI 影视制作工作台",
  description: "从创意到银幕，一站式 AI 影视制作管理",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

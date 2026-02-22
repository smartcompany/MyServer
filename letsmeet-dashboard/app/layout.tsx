import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LetsMeet Bot Dashboard",
  description: "봇 계정 운용 대시보드 프로토타입",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

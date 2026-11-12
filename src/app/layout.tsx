import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stavros RE Office",
  description:
    "Static office viewer for seven floors. BoldTrail, Vulcan 7, Crexi, LoopNet, and Northeast Florida MLS are not connected.",
  referrer: "no-referrer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Script src="/Re-Office/consume-topic.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}

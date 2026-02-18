import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blood on the Clocktower - AI Storyteller",
  description: "AI-powered Blood on the Clocktower Storyteller",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}

import "./globals.css";
import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "AIClips",
  description: "Download segments of YouTube videos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>AIClips</h1>
          {children}
        </main>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InSpace.io — Leadership Dashboard",
  description:
    "Package distribution, Google Search Console client results, and churn per package over time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

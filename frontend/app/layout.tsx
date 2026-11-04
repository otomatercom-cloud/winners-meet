import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui";

export const metadata: Metadata = { title: "Winners Meet", description: "Winners Meet registration, check-in and seating" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#4f46e5" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased"><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}

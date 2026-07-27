import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/shared/Toaster";
import { QueryProvider } from "@/components/shared/QueryProvider";

export const metadata: Metadata = {
  title: "Fixoo - Emergency Repairs in 30 Min",
  description:
    "Tyre puncture? Home breakdown? Fixoo dispatches help in 30 minutes. Available in Kota.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fixoo",
  },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-black text-white antialiased">
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}

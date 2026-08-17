import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";
import { isDesktopRuntime } from "@/lib/desktop/runtime";

const siteUrl = new URL("https://anointed-worship-app.vercel.app");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "Anointed Worship",
    template: "%s | Anointed Worship",
  },
  description: "Private worship team management for setlists, songs, schedules, and ministry communication.",
  applicationName: "Anointed Worship",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Anointed Worship",
    description: "Private worship team management for setlists, songs, schedules, and ministry communication.",
    url: "/",
    siteName: "Anointed Worship",
    images: [
      {
        url: "/brand/anointed-worship-og.png",
        width: 1200,
        height: 630,
        alt: "Anointed Worship logo",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Anointed Worship",
    description: "Private worship team management for setlists, songs, schedules, and ministry communication.",
    images: ["/brand/anointed-worship-og.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Anointed Worship",
  },
};

export const viewport: Viewport = {
  themeColor: "#8b5cf6",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // A per-request CSP nonce is injected by Proxy. Reading headers opts the
  // private application shell into dynamic rendering so Next can attach it to
  // framework scripts instead of requiring unsafe-inline.
  await headers();

  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full bg-[#0d0d10] text-white">
        <PwaRegister enabled={!isDesktopRuntime()} />
        {children}
      </body>
    </html>
  );
}

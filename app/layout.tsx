import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { Toaster } from "@/components/ui/sonner";
import { SyncManager } from "@/components/sync-manager";
import { PwaRegister } from "@/components/pwa-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://cafe-venus.onrender.com"),

  title: {
    default: "certe — Identity Infrastructure & Campus Payments",
    template: "%s | certe",
  },

  description:
    "certe is your identity infrastructure and campus payments platform. Manage student meals, wallets, gate access, and library — all from one place.",

  applicationName: "certe",

  keywords: [
    "certe",
    "campus payments",
    "identity infrastructure",
    "school canteen",
    "student meal ordering",
    "school food ordering",
    "campus management",
  ],

  authors: [{ name: "certe" }],
  creator: "certe",
  publisher: "certe",

  robots: {
    index: true,
    follow: true,
    nocache: false,
  },

  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },

  manifest: "/manifest.json",

  openGraph: {
    type: "website",
    url: "https://cafe-venus.onrender.com",
    title: "certe — Identity Infrastructure & Campus Payments",
    description:
      "Manage student meals, wallets, gate access, and library with certe — your all-in-one campus platform.",
    siteName: "certe",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "certe — Campus Payments Platform",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "certe — Identity Infrastructure & Campus Payments",
    description:
      "Manage student meals, wallets, gate access, and library with certe.",
    images: ["/og-image.png"],
  },

  appleWebApp: {
    capable: true,
    title: "certe",
    statusBarStyle: "default",
  },

  category: "education",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <Navbar />
        <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
        <PwaRegister />
        <SyncManager />
        <Toaster
          richColors
          position="bottom-center"
          toastOptions={{ className: "text-sm" }}
        />
      </body>
    </html>
  );
}
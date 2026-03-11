import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { Toaster } from "@/components/ui/sonner";

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
    default: "Venus Café — School Canteen Pre-Order System",
    template: "%s | Venus Café",
  },

  description:
    "Venus Café allows parents and students of Venus World School to pre-order canteen meals, reduce queue time, and manage student food purchases digitally.",

  applicationName: "Venus Café",

  keywords: [
    "Venus Café",
    "school canteen",
    "canteen pre order",
    "school cafeteria system",
    "student meal ordering",
    "school food ordering",
    "Venus World School",
  ],

  authors: [{ name: "Venus Café Team" }],
  creator: "Venus Café",
  publisher: "Venus World School",

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
    title: "Venus Café — School Canteen Pre-Order System",
    description:
      "Pre-order meals from the Venus World School canteen. Skip queues and manage student meals easily.",
    siteName: "Venus Café",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Venus Café Canteen Ordering System",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "Venus Café — School Canteen Pre-Order System",
    description:
      "Pre-order meals from Venus World School canteen and avoid queues.",
    images: ["/og-image.png"],
  },

  appleWebApp: {
    capable: true,
    title: "Venus Café",
    statusBarStyle: "default",
  },

  category: "food",
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
        <main className="min-h-[calc(100vh-3.5rem)] pb-14 md:pb-0">{children}</main>
        <Toaster
          richColors
          position="top-center"
          toastOptions={{ className: "text-sm" }}
        />
      </body>
    </html>
  );
}
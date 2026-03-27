import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { Toaster } from "@/components/ui/sonner";
import { SyncManager } from "@/components/sync-manager";
import { PwaRegister } from "@/components/pwa-register";
import { ThemeProvider } from "@/components/theme-provider";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://cafe-venus.onrender.com"),

  title: {
    default: "certe — Smart School Canteen, Campus Payments & Student Management",
    template: "%s | certe",
  },

  description:
    "certe is your all-in-one school canteen and campus management platform. Pre-order meals, manage student wallets, track gate attendance, and run a digital library — cashless, real-time, and parent-friendly. Contact us: 9175113313 | eeshanvaidya14@gmail.com",

  applicationName: "certe",

  keywords: [
    "certe",
    "school canteen management",
    "campus payments",
    "student meal ordering",
    "school food pre-order",
    "cashless school canteen",
    "student wallet",
    "school gate attendance",
    "RFID school card",
    "digital school library",
    "parental controls school",
    "school meal subscription",
    "canteen order management",
    "school food ordering app",
    "smart canteen system",
    "campus management platform",
    "identity infrastructure",
  ],

  authors: [{ name: "certe", url: "https://cafe-venus.onrender.com" }],
  creator: "certe",
  publisher: "certe",

  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
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
    title: "certe — Smart School Canteen, Campus Payments & Student Management",
    description:
      "Pre-order meals, manage wallets, track attendance and run a digital library — all from one cashless, real-time platform. Contact: 9175113313 | eeshanvaidya14@gmail.com",
    siteName: "certe",
    locale: "en_IN",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "certe — Smart School Canteen & Campus Payments Platform",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "certe — Smart School Canteen & Campus Payments",
    description:
      "Pre-order meals, cashless wallets, gate attendance & digital library for schools. Contact: 9175113313 | eeshanvaidya14@gmail.com",
    images: ["/og-image.png"],
  },

  appleWebApp: {
    capable: true,
    title: "certe",
    statusBarStyle: "default",
  },

  alternates: {
    canonical: "https://cafe-venus.onrender.com",
  },

  category: "education",

  other: {
    "contact:phone": "9175113313",
    "contact:email": "eeshanvaidya14@gmail.com",
  },
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
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "certe",
              applicationCategory: "EducationalApplication",
              operatingSystem: "Web",
              url: "https://cafe-venus.onrender.com",
              description:
                "Smart school canteen and campus management platform — pre-order meals, cashless wallets, gate attendance, and digital library.",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "INR",
              },
              contactPoint: {
                "@type": "ContactPoint",
                telephone: "+91-9175113313",
                email: "eeshanvaidya14@gmail.com",
                contactType: "customer support",
              },
            }),
          }}
        />
        <link
          href="https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,600,700,800,900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${geistMono.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider>
        <Navbar />
        <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
        <PwaRegister />
        <SyncManager />
        <Toaster
          richColors
          position="top-center"
          toastOptions={{
            className: "text-sm rounded-2xl shadow-lg",
          }}
        />
        </ThemeProvider>
      </body>
    </html>
  );
}
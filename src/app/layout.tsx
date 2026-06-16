import type { Metadata, Viewport } from "next";
import { Geist_Mono, Schibsted_Grotesk } from "next/font/google";

import "./globals.css";
import { walburn } from "@/lib/fonts";
import { NewsDrawer } from "@/components/markets/news-drawer";
import { StockDrawer } from "@/components/markets/stock-drawer";
import { Preloader } from "@/components/preloader";
import { NewsDrawerProvider } from "@/lib/markets/news-drawer-context";
import { StockDrawerProvider } from "@/lib/markets/stock-drawer-context";
import { getSiteUrl, siteDescription, siteName } from "@/lib/site";
import { ThemeProvider, ThemeScript } from "@/lib/theme/theme-context";

/** Body / UI typeface for the whole app (nav, chat, controls). */
const sans = Schibsted_Grotesk({
  variable: "--font-sans-brand",
  subsets: ["latin"],
  display: "swap",
});

/** Monospace for timestamps, tickers, and tabular figures. */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: `%s - ${siteName}`,
  },
  description: siteDescription,
  applicationName: siteName,
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName,
    title: siteName,
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description: siteDescription,
  },
  robots: { index: true, follow: true },
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  // Match the address-bar tint to whichever palette the visitor lands in.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1ede2" },
    { media: "(prefers-color-scheme: dark)", color: "#141416" },
  ],
  width: "device-width",
  initialScale: 1,
  // Draw under the notch/home bar; the app handles env(safe-area-inset-*) itself.
  viewportFit: "cover",
};

function JsonLd() {
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteName,
    url: siteUrl,
    description: siteDescription,
  };
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName,
    url: siteUrl,
    description: siteDescription,
    publisher: { "@type": "Organization", name: siteName, url: siteUrl },
  };
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([org, website]) }} />
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${geistMono.variable} ${walburn.variable}`}
    >
      <body className="h-full font-sans antialiased">
        <ThemeScript />
        <JsonLd />
        <ThemeProvider>
          <Preloader />
          <NewsDrawerProvider>
            <NewsDrawer />
            <StockDrawerProvider>
              <StockDrawer />
              {children}
            </StockDrawerProvider>
          </NewsDrawerProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

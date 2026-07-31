import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

// All three faces are variable, so no weight list is needed: one file per
// style, and next/font's metric-matched fallback keeps the swap from shifting
// layout.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Both styles earn their bytes: normal sets headings, italic sets the wordmark.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

/**
 * Base for resolving relative metadata URLs (the generated OG card, a link's
 * custom preview image) to absolute ones. Runtime URLs come from the request
 * everywhere else; this is the build-time default Next needs in order to
 * serialise og:image, and without it a shared link unfurls pointing at
 * localhost.
 */
function metadataBase(): URL {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")
    .trim()
    .replace(/\/$/, "");
  try {
    return new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`);
  } catch {
    return new URL("http://localhost:3000");
  }
}

const DESCRIPTION = "Share documents and data rooms. See everything.";

export const metadata: Metadata = {
  metadataBase: metadataBase(),
  title: { default: "Foyer", template: "%s · Foyer" },
  description: DESCRIPTION,
  applicationName: "Foyer",
  // Nothing here belongs in a search index: every surface is either an
  // authenticated workspace or a confidential shared link. Unfurling is
  // unaffected, which is what shared links actually need.
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "Foyer",
    title: "Foyer",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#101418" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}

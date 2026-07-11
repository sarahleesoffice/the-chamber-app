import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.the-chamber.app"),
  title: "The Chamber — Trading Intelligence Platform",
  description:
    "AI trading assistant, trade analysis, journal, and performance analytics — built for smart-money execution.",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    url: "https://www.the-chamber.app",
    siteName: "The Chamber",
    title: "The Chamber — Trading Intelligence Platform",
    description:
      "AI trading assistant, trade analysis, journal, and performance analytics — built for smart-money execution.",
    images: [{ url: "/preview.png", width: 1200, height: 630, alt: "The Chamber dashboard" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Chamber — Trading Intelligence Platform",
    description:
      "AI trading assistant, trade analysis, journal, and performance analytics — built for smart-money execution.",
    images: ["/preview.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" rel="stylesheet" />
      </head>
      <body className="min-h-full bg-chamber-bg text-chamber-text">{children}</body>
    </html>
  );
}

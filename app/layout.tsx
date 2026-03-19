import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Chamber",
  description: "Trading Mentor — Based on ICT Concepts",
  icons: {
    icon: "/favicon.svg",
  },
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

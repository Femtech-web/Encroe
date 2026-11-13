import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { JetBrains_Mono, Manrope, Unbounded } from "next/font/google";
import { Nav } from "@/components/site/Nav";
import "./globals.css";

// Self-hosted at build time by next/font: no request ever leaves for a font host.
const display = Unbounded({ subsets: ["latin"], variable: "--font-unbounded", display: "swap" });
const sans = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000"),
  ),
  title: { default: "Encroe: the studio shut down. The game didn't.", template: "%s · Encroe" },
  description:
    "A studio seals its game server into a keyless NEAR contract. Anyone can check it is real; if the studio goes silent, the game goes to its players.",
};

export const viewport: Viewport = { themeColor: "#07040d" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Reading the request's headers renders every page per request, which the nonce-based CSP requires.
  await headers();
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const siteUrl = process.env.SITE_URL ?? "http://localhost:3001";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Ecoase — Control operativo",
  description:
    "Control de pedidos, preparación, logística y entregas de Ecoase.",
  openGraph: {
    title: "Ecoase — Control operativo",
    description: "Pedidos, preparación, logística y entregas en una sola vista.",
    type: "website",
    images: [{ url: "/og.png", width: 1730, height: 909, alt: "Ecoase, control operativo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ecoase — Control operativo",
    description: "Pedidos, preparación, logística y entregas en una sola vista.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const siteUrl = process.env.SITE_URL ?? "http://localhost:3001";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Ecoase — Piloto operativo",
  description:
    "Una pantalla simple para validar cómo un pedido de Ecoase se transforma en una entrega.",
  openGraph: {
    title: "Ecoase — Piloto operativo",
    description: "Cinco decisiones, tres casos verificables y las preguntas que todavía faltan responder.",
    type: "website",
    images: [{ url: "/og.png", width: 1730, height: 909, alt: "Ecoase, piloto operativo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ecoase — Piloto operativo",
    description: "Cinco decisiones para validar el recorrido completo de un pedido.",
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
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { ambiente } from "@/app/configuracao/ambiente";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const cabecalhos = await headers();
  const host = cabecalhos.get("host") ?? "localhost:3000";
  const protocolo = cabecalhos.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const enderecoBase = new URL(`${protocolo}://${host}`);
  const titulo = `${ambiente.nomeAplicacao} | Gestão de cooperativas`;
  const descricao = "Gestão acessível de catadores, cooperativas, pesagens e produção em Belo Horizonte.";
  return {
    metadataBase: enderecoBase,
    title: titulo,
    description: descricao,
    icons: { icon: ambiente.favicon, shortcut: ambiente.favicon },
    openGraph: { title: titulo, description: descricao, type: "website", locale: "pt_BR", images: [{ url: "/og.png", width: 1734, height: 907, alt: "Recicla Belô — Gestão que transforma" }] },
    twitter: { card: "summary_large_image", title: titulo, description: descricao, images: ["/og.png"] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <style>{`:root{--cor-primaria-config:${ambiente.corPrimaria};--cor-primaria-escura-config:${ambiente.corPrimariaEscura};--cor-fundo-config:${ambiente.corFundo}}`}</style>
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { EstruturaAplicacao } from "@/app/componentes/estrutura-aplicacao";
import { ProvedorIdentidadeVisual } from "@/app/configuracao/identidade-visual";

export const metadata: Metadata = {
  title: "Recicla Belô | Painel de gestão",
  description: "Gestão acessível de catadores, pesagens, cooperativas e reciclagem em Belo Horizonte.",
};

export default function PaginaInicial() {
  return <ProvedorIdentidadeVisual><EstruturaAplicacao /></ProvedorIdentidadeVisual>;
}

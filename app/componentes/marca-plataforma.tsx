"use client";

/* eslint-disable @next/next/no-img-element -- o ícone configurável pode ser uma data URL local */

import { useIdentidadeVisual } from "@/app/configuracao/identidade-visual";

export function MarcaPlataforma({ compacta = false }: { compacta?: boolean }) {
  const { identidade } = useIdentidadeVisual();
  return <div className={compacta ? "marca-plataforma compacta" : "marca-plataforma"}>
    <span className="imagem-marca"><img src={identidade.iconeAplicacao} alt="" /></span>
    <div><strong>{identidade.nomeAplicacao}</strong><small>Gestão que transforma</small></div>
  </div>;
}

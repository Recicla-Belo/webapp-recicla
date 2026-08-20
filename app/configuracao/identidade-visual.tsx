"use client";

/* eslint-disable react-hooks/set-state-in-effect -- restaura a identidade persistida somente após a montagem no navegador */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ambiente } from "./ambiente";

export type IdentidadeVisual = {
  nomeAplicacao: string;
  iconeAplicacao: string;
  favicon: string;
  corPrimaria: string;
  corPrimariaEscura: string;
  corFundo: string;
};

const identidadePadrao: IdentidadeVisual = {
  nomeAplicacao: ambiente.nomeAplicacao,
  iconeAplicacao: ambiente.iconeAplicacao,
  favicon: ambiente.favicon,
  corPrimaria: ambiente.corPrimaria,
  corPrimariaEscura: ambiente.corPrimariaEscura,
  corFundo: ambiente.corFundo,
};

const ContextoIdentidade = createContext<{
  identidade: IdentidadeVisual;
  salvarIdentidade: (identidade: IdentidadeVisual) => void;
  restaurarIdentidade: () => void;
} | null>(null);

function aplicarIdentidade(identidade: IdentidadeVisual) {
  const raiz = document.documentElement;
  raiz.style.setProperty("--cor-primaria-config", identidade.corPrimaria);
  raiz.style.setProperty("--cor-primaria-escura-config", identidade.corPrimariaEscura);
  raiz.style.setProperty("--cor-fundo-config", identidade.corFundo);
  document.title = `${identidade.nomeAplicacao} | Gestão de cooperativas`;

  const favicons = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]');
  if (favicons.length) {
    favicons.forEach((favicon) => { favicon.href = identidade.favicon; });
  } else {
    const favicon = document.createElement("link");
    favicon.rel = "icon";
    favicon.href = identidade.favicon;
    document.head.append(favicon);
  }
}

export function ProvedorIdentidadeVisual({ children }: { children: ReactNode }) {
  const [identidade, setIdentidade] = useState(identidadePadrao);

  useEffect(() => {
    const salva = window.localStorage.getItem("reciclabelo-identidade");
    if (!salva) {
      aplicarIdentidade(identidadePadrao);
      return;
    }
    try {
      const restaurada = { ...identidadePadrao, ...JSON.parse(salva) } as IdentidadeVisual;
      setIdentidade(restaurada);
      aplicarIdentidade(restaurada);
    } catch {
      window.localStorage.removeItem("reciclabelo-identidade");
      aplicarIdentidade(identidadePadrao);
    }
  }, []);

  function salvarIdentidade(novaIdentidade: IdentidadeVisual) {
    setIdentidade(novaIdentidade);
    aplicarIdentidade(novaIdentidade);
    window.localStorage.setItem("reciclabelo-identidade", JSON.stringify(novaIdentidade));
  }

  function restaurarIdentidade() {
    window.localStorage.removeItem("reciclabelo-identidade");
    setIdentidade(identidadePadrao);
    aplicarIdentidade(identidadePadrao);
  }

  return <ContextoIdentidade.Provider value={{ identidade, salvarIdentidade, restaurarIdentidade }}>{children}</ContextoIdentidade.Provider>;
}

export function useIdentidadeVisual() {
  const contexto = useContext(ContextoIdentidade);
  if (!contexto) throw new Error("useIdentidadeVisual deve ser usado dentro de ProvedorIdentidadeVisual.");
  return contexto;
}

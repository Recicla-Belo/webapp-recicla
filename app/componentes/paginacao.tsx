"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

type PropriedadesPaginacao = {
  pagina: number;
  total: number;
  itensPorPagina: number;
  aoMudarPagina: (pagina: number) => void;
  aoMudarQuantidade?: (quantidade: number) => void;
  opcoesQuantidade?: number[];
  rotulo?: string;
};

export function Paginacao({ pagina, total, itensPorPagina, aoMudarPagina, aoMudarQuantidade, opcoesQuantidade = [5, 10, 20], rotulo = "registros" }: PropriedadesPaginacao) {
  const totalPaginas = Math.max(Math.ceil(total / itensPorPagina), 1);
  const paginaAtual = Math.min(Math.max(pagina, 1), totalPaginas);
  const inicio = total === 0 ? 0 : (paginaAtual - 1) * itensPorPagina + 1;
  const fim = Math.min(paginaAtual * itensPorPagina, total);
  const paginas = paginasVisiveis(paginaAtual, totalPaginas);

  return <nav className="paginacao" aria-label={`Paginação de ${rotulo}`}>
    <div className="resumo-paginacao"><strong>{inicio}–{fim}</strong><span>de {total.toLocaleString("pt-BR")} {rotulo}</span></div>
    <div className="controles-paginacao">
      <button type="button" onClick={() => aoMudarPagina(paginaAtual - 1)} disabled={paginaAtual <= 1} aria-label="Página anterior"><ChevronLeft /></button>
      <div className="paginas-paginacao">{paginas.map((item, indice) => item === "…" ? <span key={`reticencias-${indice}`}>…</span> : <button type="button" className={item === paginaAtual ? "ativa" : ""} aria-current={item === paginaAtual ? "page" : undefined} onClick={() => aoMudarPagina(item)} key={item}>{item}</button>)}</div>
      <button type="button" onClick={() => aoMudarPagina(paginaAtual + 1)} disabled={paginaAtual >= totalPaginas} aria-label="Próxima página"><ChevronRight /></button>
    </div>
    {aoMudarQuantidade && <label className="quantidade-paginacao">Por página<select value={itensPorPagina} onChange={(evento) => aoMudarQuantidade(Number(evento.target.value))}>{opcoesQuantidade.map((opcao) => <option value={opcao} key={opcao}>{opcao}</option>)}</select></label>}
  </nav>;
}

function paginasVisiveis(atual: number, total: number): Array<number | "…"> {
  if (total <= 5) return Array.from({ length: total }, (_, indice) => indice + 1);
  const paginas = new Set([1, total, atual - 1, atual, atual + 1]);
  const ordenadas = [...paginas].filter((item) => item >= 1 && item <= total).sort((a, b) => a - b);
  const resultado: Array<number | "…"> = [];
  ordenadas.forEach((item, indice) => {
    if (indice > 0 && item - ordenadas[indice - 1]! > 1) resultado.push("…");
    resultado.push(item);
  });
  return resultado;
}

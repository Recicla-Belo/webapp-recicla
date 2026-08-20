"use client";

import { useState } from "react";
import { pesagens } from "@/app/dados/demonstracao";

export function TelaRelatorios() {
  const [busca,setBusca]=useState("");
  const filtradas=pesagens.filter(p=>`${p.catador} ${p.codigo} ${p.material}`.toLowerCase().includes(busca.toLowerCase()));
  return <section className="pagina-interna">
    <div className="resumo-pagina"><div><h2>Produção e pagamentos</h2><p>Consulte cada reciclagem e exporte os dados completos.</p></div><button className="botao-secundario">⇩ Exportar relatório</button></div>
    <div className="grade-resumo-relatorio"><article><span>KG</span><div><small>Peso no período</small><strong>12.480,6 kg</strong></div></article><article><span>R$</span><div><small>Valor gerado</small><strong>R$ 18.940,20</strong></div></article><article><span>№</span><div><small>Pesagens</small><strong>186 registros</strong></div></article></div>
    <div className="barra-ferramentas"><label className="campo-busca"><span>⌕</span><input value={busca} onChange={(e)=>setBusca(e.target.value)} placeholder="Buscar catador, material ou código..."/></label><input className="entrada-filtro" type="date" aria-label="Data inicial"/><input className="entrada-filtro" type="date" aria-label="Data final"/><button className="botao-secundario">Mais filtros</button></div>
    <div className="tabela-responsiva"><table><thead><tr><th>Registro</th><th>Catador</th><th>Material</th><th>Local</th><th>Peso</th><th>Valor</th><th aria-label="Ações"/></tr></thead><tbody>{filtradas.map(p=><tr key={p.uuid}><td><code>{p.codigo}</code><small className="texto-bloco">{p.data}</small></td><td><strong>{p.catador}</strong><small className="texto-bloco">Por {p.responsavel}</small></td><td>{p.material}</td><td>{p.pontoApoio}</td><td><strong>{p.peso.toLocaleString("pt-BR")} kg</strong></td><td><strong className="valor-verde">{p.valor.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</strong></td><td><button className="menu-acoes">•••</button></td></tr>)}</tbody></table></div>
  </section>;
}

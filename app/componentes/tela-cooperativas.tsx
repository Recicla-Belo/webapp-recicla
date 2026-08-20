"use client";

import { useState } from "react";
import { cooperativas } from "@/app/dados/demonstracao";

export function TelaCooperativas() {
  const [modal, setModal] = useState(false);
  return <section className="pagina-interna">
    <div className="resumo-pagina"><div><h2>Cooperativas e associações</h2><p>Organizações parceiras e responsáveis vinculados.</p></div><button className="botao-primario" onClick={()=>setModal(true)}>＋ Nova cooperativa</button></div>
    <div className="grade-cooperativas">{cooperativas.map((item)=><article className="cartao-cooperativa" key={item.uuid}><header><span>{item.nome.slice(0,2).toUpperCase()}</span><button className="menu-acoes">•••</button></header><h3>{item.nome}</h3><p>Responsável</p><strong>{item.responsavel}</strong><div><span><b>{item.catadoresAtivos}</b> catadores ativos</span><span>{item.telefone}</span></div></article>)}</div>
    {modal && <div className="sobreposicao" role="dialog" aria-modal="true"><div className="modal pequeno"><header className="cabecalho-modal"><div><span>NOVO CADASTRO</span><h2>Adicionar cooperativa</h2><p>Cadastre uma organização parceira.</p></div><button onClick={()=>setModal(false)}>×</button></header><form className="formulario"><label className="campo">Referência da Cooperativa / Associação<select defaultValue=""><option value="">Selecionar</option>{["Coopesol Leste","Coopesol Barreiro","Asmare","Copemar","Copemarc","Catunidos","Assoce Recicle","Outras"].map(i=><option key={i}>{i}</option>)}</select></label><label className="campo">Nome do responsável<input placeholder="Nome completo" /></label><label className="campo">Telefone <small>Opcional</small><input placeholder="(31) 99999-9999" /></label></form><footer className="rodape-modal"><button className="botao-secundario" onClick={()=>setModal(false)}>Cancelar</button><button className="botao-primario" onClick={()=>setModal(false)}>Salvar cooperativa</button></footer></div></div>}
  </section>;
}

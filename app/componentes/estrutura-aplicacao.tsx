"use client";

/* eslint-disable react-hooks/set-state-in-effect -- restaura preferências persistidas somente após a montagem no navegador */

import { useEffect, useState } from "react";
import type { Pagina } from "@/app/tipos/dominio";
import { PainelPrincipal } from "./painel-principal";
import { TelaCatadores } from "./tela-catadores";
import { TelaCooperativas } from "./tela-cooperativas";
import { TelaPesagem } from "./tela-pesagem";
import { TelaRelatorios } from "./tela-relatorios";
import { TelaConfiguracoes } from "./tela-configuracoes";
import { TelaLogin } from "./tela-login";
import { MarcaPlataforma } from "./marca-plataforma";

const itens: Array<{ pagina: Pagina; rotulo: string; icone: string }> = [
  { pagina: "painel", rotulo: "Visão geral", icone: "▦" },
  { pagina: "catadores", rotulo: "Catadores", icone: "♙" },
  { pagina: "cooperativas", rotulo: "Cooperativas", icone: "⌂" },
  { pagina: "pesagem", rotulo: "Pesagem e produção", icone: "⚖" },
  { pagina: "relatorios", rotulo: "Relatórios", icone: "▤" },
  { pagina: "configuracoes", rotulo: "Configurações", icone: "⚙" },
];

const titulos: Record<Pagina, { sobrelinha: string; titulo: string }> = {
  painel: { sobrelinha: "QUINTA-FEIRA, 20 DE AGOSTO", titulo: "Olá, Administrador!" },
  catadores: { sobrelinha: "CADASTROS", titulo: "Catadores" },
  cooperativas: { sobrelinha: "CADASTROS", titulo: "Cooperativas e associações" },
  pesagem: { sobrelinha: "PRODUÇÃO", titulo: "Nova pesagem" },
  relatorios: { sobrelinha: "ACOMPANHAMENTO", titulo: "Relatórios" },
  configuracoes: { sobrelinha: "ADMINISTRAÇÃO", titulo: "Configurações" },
};

export function EstruturaAplicacao() {
  const [pagina, setPagina] = useState<Pagina>("painel");
  const [escuro, setEscuro] = useState(false);
  const [autenticado, setAutenticado] = useState(false);

  useEffect(() => {
    const temaSalvo = window.localStorage.getItem("reciclabelo-tema");
    setEscuro(temaSalvo === "escuro");
    const base = process.env.NEXT_PUBLIC_URL_API ?? "http://localhost:3333";
    void fetch(`${base}/api/autenticacao/sessao`, { credentials: "include" })
      .then((resposta) => setAutenticado(resposta.ok))
      .catch(() => setAutenticado(false));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.tema = escuro ? "escuro" : "claro";
    window.localStorage.setItem("reciclabelo-tema", escuro ? "escuro" : "claro");
  }, [escuro]);

  function navegar(destino: Pagina) {
    setPagina(destino);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function autenticar() {
    setAutenticado(true);
  }

  async function sair() {
    const base = process.env.NEXT_PUBLIC_URL_API ?? "http://localhost:3333";
    await fetch(`${base}/api/autenticacao/sair`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}", credentials: "include" }).catch(() => undefined);
    setAutenticado(false);
  }

  if (!autenticado) return <TelaLogin onAutenticado={autenticar} />;

  return (
    <main className="aplicacao">
      <aside className="barra-lateral" aria-label="Navegação principal">
        <button className="marca" type="button" onClick={() => navegar("painel")} aria-label="Ir para visão geral">
          <MarcaPlataforma compacta />
        </button>
        <nav>
          {itens.map((item) => (
            <button className={pagina === item.pagina ? "item-menu ativo" : "item-menu"} key={item.pagina} onClick={() => navegar(item.pagina)} type="button">
              <span className="icone-menu" aria-hidden="true">{item.icone}</span>{item.rotulo}
            </button>
          ))}
        </nav>
        <div className="apoio-menu"><span>?</span><div><strong>Precisa de ajuda?</strong><small>Acesse o guia do sistema</small></div></div>
        <button className="usuario" type="button" onClick={sair} title="Sair do sistema"><span>AD</span><div><strong>Administrador</strong><small>admin@reciclabelo</small></div><b>↪</b></button>
      </aside>

      <section className="conteudo">
        <header className="cabecalho">
          <div><p>{titulos[pagina].sobrelinha}</p><h1>{titulos[pagina].titulo}</h1></div>
          <div className="acoes-cabecalho">
            <button className="botao-icone" onClick={() => setEscuro((valor) => !valor)} aria-label={escuro ? "Ativar tema claro" : "Ativar tema escuro"}>{escuro ? "☀" : "◐"}</button>
            <button className="botao-icone" aria-label="Notificações">♢<i /></button>
            {pagina !== "pesagem" && <button className="botao-primario" type="button" onClick={() => navegar("pesagem")}><span>＋</span> Nova pesagem</button>}
          </div>
        </header>

        {pagina === "painel" && <PainelPrincipal onNovaPesagem={() => navegar("pesagem")} />}
        {pagina === "catadores" && <TelaCatadores />}
        {pagina === "cooperativas" && <TelaCooperativas />}
        {pagina === "pesagem" && <TelaPesagem />}
        {pagina === "relatorios" && <TelaRelatorios />}
        {pagina === "configuracoes" && <TelaConfiguracoes />}
      </section>
    </main>
  );
}

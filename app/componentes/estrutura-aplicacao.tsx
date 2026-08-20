"use client";

/* eslint-disable react-hooks/set-state-in-effect -- restaura preferências persistidas somente após a montagem no navegador */

import { useEffect, useState } from "react";
import {
  Bell,
  Building2,
  CheckCheck,
  FileChartColumn,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Moon,
  Plus,
  Recycle,
  Scale,
  Settings,
  Sun,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Pagina } from "@/app/tipos/dominio";
import { PainelPrincipal } from "./painel-principal";
import { TelaCatadores } from "./tela-catadores";
import { TelaCooperativas } from "./tela-cooperativas";
import { TelaPesagem } from "./tela-pesagem";
import { TelaRelatorios } from "./tela-relatorios";
import { TelaConfiguracoes } from "./tela-configuracoes";
import { TelaLogin } from "./tela-login";
import { MarcaPlataforma } from "./marca-plataforma";

const itens: Array<{ pagina: Pagina; rotulo: string; icone: LucideIcon }> = [
  { pagina: "painel", rotulo: "Visão geral", icone: LayoutDashboard },
  { pagina: "catadores", rotulo: "Catadores", icone: UsersRound },
  { pagina: "cooperativas", rotulo: "Cooperativas", icone: Building2 },
  { pagina: "pesagem", rotulo: "Pesagem e produção", icone: Scale },
  { pagina: "relatorios", rotulo: "Relatórios", icone: FileChartColumn },
  { pagina: "configuracoes", rotulo: "Configurações", icone: Settings },
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
  const [notificacoesAbertas, setNotificacoesAbertas] = useState(false);
  const [notificacoesNaoLidas, setNotificacoesNaoLidas] = useState(3);

  useEffect(() => {
    const temaSalvo = window.localStorage.getItem("reciclabelo-tema");
    setEscuro(temaSalvo === "escuro");
    const base = process.env.NEXT_PUBLIC_URL_API ?? "http://localhost:3333";
    void fetch(`${base}/api/autenticacao/sessao`, { credentials: "include" })
      .then(async (resposta) => {
        if (!resposta.ok) return setAutenticado(false);
        const dados = await resposta.json() as { autenticado?: boolean };
        setAutenticado(dados.autenticado === true);
      })
      .catch(() => setAutenticado(false));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.tema = escuro ? "escuro" : "claro";
    window.localStorage.setItem("reciclabelo-tema", escuro ? "escuro" : "claro");
  }, [escuro]);

  function navegar(destino: Pagina) {
    setPagina(destino);
    setNotificacoesAbertas(false);
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
              <span className="icone-menu" aria-hidden="true"><item.icone /></span><span>{item.rotulo}</span>
            </button>
          ))}
        </nav>
        <div className="apoio-menu"><span><LifeBuoy aria-hidden="true" /></span><div><strong>Precisa de ajuda?</strong><small>Acesse o guia do sistema</small></div></div>
        <button className="usuario" type="button" onClick={sair} title="Sair do sistema"><span>AD</span><div><strong>Administrador</strong><small>admin@reciclabelo</small></div><LogOut aria-hidden="true" /></button>
      </aside>

      <section className="conteudo">
        <header className="cabecalho">
          <div className="titulo-cabecalho"><span className="selo-pagina" aria-hidden="true"><Recycle /></span><div><p>{titulos[pagina].sobrelinha}</p><h1>{titulos[pagina].titulo}</h1></div></div>
          <div className="acoes-cabecalho">
            <button className="botao-icone" onClick={() => setEscuro((valor) => !valor)} aria-label={escuro ? "Ativar tema claro" : "Ativar tema escuro"} title={escuro ? "Ativar tema claro" : "Ativar tema escuro"}>{escuro ? <Sun /> : <Moon />}</button>
            <div className="area-notificacoes">
              <button className="botao-icone botao-notificacoes" type="button" onClick={() => setNotificacoesAbertas((abertas) => !abertas)} aria-label={`Notificações: ${notificacoesNaoLidas} não lidas`} aria-expanded={notificacoesAbertas} aria-controls="painel-notificacoes"><Bell />{notificacoesNaoLidas > 0 && <span className="contador-notificacoes">{notificacoesNaoLidas}</span>}</button>
              {notificacoesAbertas && <section className="painel-notificacoes" id="painel-notificacoes" aria-label="Central de notificações">
                <header><div><span>ATUALIZAÇÕES</span><h2>Notificações</h2></div><button type="button" onClick={() => setNotificacoesAbertas(false)} aria-label="Fechar notificações"><X /></button></header>
                <div className="lista-notificacoes">
                  <article className={notificacoesNaoLidas > 0 ? "nao-lida" : ""}><span><Scale /></span><div><strong>Nova pesagem registrada</strong><p>José Santos entregou 42,8 kg de latinhas.</p><small>Há 8 minutos</small></div></article>
                  <article className={notificacoesNaoLidas > 0 ? "nao-lida" : ""}><span><UsersRound /></span><div><strong>Cadastro atualizado</strong><p>Os dados de Maria Conceição foram revisados.</p><small>Há 35 minutos</small></div></article>
                  <article className={notificacoesNaoLidas > 0 ? "nao-lida" : ""}><span><Building2 /></span><div><strong>Resumo da cooperativa</strong><p>A Coopesol Leste atingiu a meta semanal.</p><small>Hoje, 09:10</small></div></article>
                </div>
                <button className="marcar-notificacoes" type="button" onClick={() => setNotificacoesNaoLidas(0)} disabled={notificacoesNaoLidas === 0}><CheckCheck />{notificacoesNaoLidas === 0 ? "Tudo lido" : "Marcar todas como lidas"}</button>
              </section>}
            </div>
            <button className="botao-icone botao-sair-mobile" type="button" onClick={sair} aria-label="Sair do sistema" title="Sair do sistema"><LogOut /></button>
            {pagina !== "pesagem" && <button className="botao-primario botao-nova-pesagem" type="button" onClick={() => navegar("pesagem")}><Plus /> <span>Nova pesagem</span></button>}
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

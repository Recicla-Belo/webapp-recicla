"use client";

/* eslint-disable react-hooks/set-state-in-effect -- restaura preferências persistidas somente após a montagem no navegador */

import { useCallback, useEffect, useRef, useState, type UIEvent } from "react";
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
  Trash2,
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
import { requisitarApi, type NotificacaoApi } from "@/app/dados/api";

const itens: Array<{ pagina: Pagina; rotulo: string; icone: LucideIcon }> = [
  { pagina: "painel", rotulo: "Visão geral", icone: LayoutDashboard },
  { pagina: "catadores", rotulo: "Catadores", icone: UsersRound },
  { pagina: "cooperativas", rotulo: "Cooperativas", icone: Building2 },
  { pagina: "pesagem", rotulo: "Pesagem e produção", icone: Scale },
  { pagina: "relatorios", rotulo: "Relatórios", icone: FileChartColumn },
  { pagina: "configuracoes", rotulo: "Configurações", icone: Settings },
];

const titulos: Record<Pagina, { sobrelinha: string; titulo: string }> = {
  painel: { sobrelinha: "VISÃO GERAL", titulo: "Olá, Administrador!" },
  catadores: { sobrelinha: "CADASTROS", titulo: "Catadores" },
  cooperativas: { sobrelinha: "CADASTROS", titulo: "Cooperativas e associações" },
  pesagem: { sobrelinha: "PRODUÇÃO", titulo: "Nova pesagem" },
  relatorios: { sobrelinha: "ACOMPANHAMENTO", titulo: "Relatórios" },
  configuracoes: { sobrelinha: "ADMINISTRAÇÃO", titulo: "Configurações" },
};

function mensagemFalha(falha: unknown, alternativa: string) {
  return falha instanceof Error ? falha.message : alternativa;
}

function paginaDaNotificacao(entidade: string | null): Pagina {
  if (entidade === "pesagens") return "relatorios";
  if (entidade === "catadores" || entidade === "caixas_catador") return "catadores";
  if (entidade === "cooperativas") return "cooperativas";
  if (entidade === "materiais") return "configuracoes";
  return "painel";
}

type CursorNotificacoes = { criadoEm: string; uuid: string };
type RespostaNotificacoes = {
  dados: NotificacaoApi[];
  total: number;
  naoLidas: number;
  proximoCursor: CursorNotificacoes | null;
};

export function EstruturaAplicacao() {
  const [pagina, setPagina] = useState<Pagina>("painel");
  const [escuro, setEscuro] = useState(false);
  const [autenticado, setAutenticado] = useState<boolean | null>(null);
  const [notificacoesAbertas, setNotificacoesAbertas] = useState(false);
  const [notificacoes, setNotificacoes] = useState<NotificacaoApi[]>([]);
  const [erroNotificacoes, setErroNotificacoes] = useState("");
  const [acaoNotificacao, setAcaoNotificacao] = useState<string | null>(null);
  const [carregandoNotificacoes, setCarregandoNotificacoes] = useState(false);
  const [carregandoMaisNotificacoes, setCarregandoMaisNotificacoes] = useState(false);
  const [totalNotificacoes, setTotalNotificacoes] = useState(0);
  const [notificacoesNaoLidas, setNotificacoesNaoLidas] = useState(0);
  const [proximoCursorNotificacoes, setProximoCursorNotificacoes] = useState<CursorNotificacoes | null>(null);
  const carregamentoMaisEmCurso = useRef(false);

  const carregarNotificacoes = useCallback(async (cursor?: CursorNotificacoes) => {
    const acumular = Boolean(cursor);
    if (acumular && carregamentoMaisEmCurso.current) return;
    if (acumular) {
      carregamentoMaisEmCurso.current = true;
      setCarregandoMaisNotificacoes(true);
    }
    else setCarregandoNotificacoes(true);
    try {
      const parametros = new URLSearchParams({ limite: "10" });
      if (cursor) {
        parametros.set("cursorData", cursor.criadoEm);
        parametros.set("cursorUuid", cursor.uuid);
      }
      const resposta = await requisitarApi<RespostaNotificacoes>(`/api/notificacoes?${parametros.toString()}`);
      setNotificacoes((listaAtual) => {
        if (!acumular) return resposta.dados;
        const unicas = new Map(listaAtual.map((item) => [item.uuid, item]));
        resposta.dados.forEach((item) => unicas.set(item.uuid, item));
        return [...unicas.values()];
      });
      setTotalNotificacoes(resposta.total);
      setNotificacoesNaoLidas(resposta.naoLidas);
      setProximoCursorNotificacoes(resposta.proximoCursor);
      setErroNotificacoes("");
    } catch (falha) {
      setErroNotificacoes(mensagemFalha(falha, "Não foi possível carregar as notificações."));
    } finally {
      if (acumular) {
        carregamentoMaisEmCurso.current = false;
        setCarregandoMaisNotificacoes(false);
      }
      else setCarregandoNotificacoes(false);
    }
  }, []);

  useEffect(() => {
    const temaSalvo = window.localStorage.getItem("reciclabelo-tema");
    setEscuro(temaSalvo === "escuro");
    void requisitarApi<{ autenticado: boolean }>("/api/autenticacao/sessao")
      .then((dados) => setAutenticado(dados.autenticado === true))
      .catch(() => setAutenticado(false));
    const expirar = () => setAutenticado(false);
    window.addEventListener("reciclabelo:sessao-expirada", expirar);
    return () => window.removeEventListener("reciclabelo:sessao-expirada", expirar);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.tema = escuro ? "escuro" : "claro";
    window.localStorage.setItem("reciclabelo-tema", escuro ? "escuro" : "claro");
  }, [escuro]);

  useEffect(() => {
    if (!autenticado) {
      setNotificacoes([]);
      setTotalNotificacoes(0);
      setNotificacoesNaoLidas(0);
      setProximoCursorNotificacoes(null);
      setErroNotificacoes("");
      return;
    }
    void carregarNotificacoes();
  }, [autenticado, carregarNotificacoes]);

  function navegar(destino: Pagina) {
    setPagina(destino);
    setNotificacoesAbertas(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function autenticar() {
    setAutenticado(true);
  }

  function alternarNotificacoes() {
    const abrir = !notificacoesAbertas;
    setNotificacoesAbertas(abrir);
    if (abrir) void carregarNotificacoes();
  }

  async function marcarTodasComoLidas() {
    setAcaoNotificacao("todas"); setErroNotificacoes("");
    try {
      await requisitarApi<void>("/api/notificacoes/lidas", { method: "PATCH" });
      const agora = new Date().toISOString();
      setNotificacoes((lista) => lista.map((item) => ({ ...item, lida_em: item.lida_em ?? agora })));
      setNotificacoesNaoLidas(0);
    } catch (falha) {
      setErroNotificacoes(mensagemFalha(falha, "Não foi possível marcar as notificações como lidas."));
    } finally { setAcaoNotificacao(null); }
  }

  async function abrirNotificacao(item: NotificacaoApi) {
    setAcaoNotificacao(item.uuid); setErroNotificacoes("");
    try {
      if (!item.lida_em) {
        await requisitarApi<void>(`/api/notificacoes/${item.uuid}/lida`, { method: "PATCH" });
        setNotificacoesNaoLidas((total) => Math.max(0, total - 1));
      }
      setNotificacoes((lista) => lista.map((notificacao) => notificacao.uuid === item.uuid ? { ...notificacao, lida_em: notificacao.lida_em ?? new Date().toISOString() } : notificacao));
      navegar(paginaDaNotificacao(item.entidade));
    } catch (falha) {
      setErroNotificacoes(mensagemFalha(falha, "Não foi possível abrir esta notificação."));
    } finally { setAcaoNotificacao(null); }
  }

  async function excluirNotificacao(item: NotificacaoApi) {
    setAcaoNotificacao(item.uuid); setErroNotificacoes("");
    try {
      await requisitarApi<void>(`/api/notificacoes/${item.uuid}`, { method: "DELETE" });
      setNotificacoes((lista) => lista.filter((notificacao) => notificacao.uuid !== item.uuid));
      setTotalNotificacoes((total) => Math.max(0, total - 1));
      if (!item.lida_em) setNotificacoesNaoLidas((total) => Math.max(0, total - 1));
      if (proximoCursorNotificacoes) void carregarNotificacoes(proximoCursorNotificacoes);
    } catch (falha) {
      setErroNotificacoes(mensagemFalha(falha, "Não foi possível excluir a notificação."));
    } finally { setAcaoNotificacao(null); }
  }

  async function limparNotificacoes() {
    setAcaoNotificacao("limpar"); setErroNotificacoes("");
    try {
      await requisitarApi<void>("/api/notificacoes", { method: "DELETE" });
      setNotificacoes([]);
      setTotalNotificacoes(0);
      setNotificacoesNaoLidas(0);
      setProximoCursorNotificacoes(null);
    } catch (falha) {
      setErroNotificacoes(mensagemFalha(falha, "Não foi possível limpar as notificações."));
    } finally { setAcaoNotificacao(null); }
  }

  async function sair() {
    await requisitarApi<void>("/api/autenticacao/sair", { method: "POST", body: "{}" }).catch(() => undefined);
    setAutenticado(false);
  }

  function carregarAoRolar(evento: UIEvent<HTMLDivElement>) {
    const lista = evento.currentTarget;
    const pertoDoFim = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 96;
    if (pertoDoFim && proximoCursorNotificacoes && !carregandoNotificacoes && !carregandoMaisNotificacoes) {
      void carregarNotificacoes(proximoCursorNotificacoes);
    }
  }

  if (autenticado === null) return <main className="pagina-login"><div className="cenario-login" aria-hidden="true"><span className="orbe-login orbe-um" /><span className="orbe-login orbe-dois" /><span className="malha-login" /></div><section className="login-central carregando-sessao" aria-live="polite"><MarcaPlataforma /><p>Carregando seu painel...</p></section></main>;
  if (!autenticado) return <TelaLogin onAutenticado={autenticar} />;

  return (
    <main className="aplicacao">
      <aside className="barra-lateral" aria-label="Navegação principal">
        <div className="conteudo-barra-lateral">
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
        </div>
      </aside>

      <section className="conteudo">
        <header className="cabecalho">
          <div className="titulo-cabecalho"><span className="selo-pagina" aria-hidden="true"><Recycle /></span><div><p>{titulos[pagina].sobrelinha}</p><h1>{titulos[pagina].titulo}</h1></div></div>
          <div className="acoes-cabecalho">
            <button className="botao-icone" onClick={() => setEscuro((valor) => !valor)} aria-label={escuro ? "Ativar tema claro" : "Ativar tema escuro"} title={escuro ? "Ativar tema claro" : "Ativar tema escuro"}>{escuro ? <Sun /> : <Moon />}</button>
            <div className="area-notificacoes">
              <button className="botao-icone botao-notificacoes" type="button" onClick={alternarNotificacoes} aria-label={`Notificações: ${notificacoesNaoLidas} não lidas`} aria-expanded={notificacoesAbertas} aria-controls="painel-notificacoes"><Bell />{notificacoesNaoLidas > 0 && <span className="contador-notificacoes">{notificacoesNaoLidas}</span>}</button>
              {notificacoesAbertas && <section className="painel-notificacoes" id="painel-notificacoes" aria-label="Central de notificações">
                <header><div><span>ATUALIZAÇÕES</span><h2>Notificações</h2><small>{totalNotificacoes === 1 ? "1 registro" : `${totalNotificacoes} registros`}</small></div><button type="button" onClick={() => setNotificacoesAbertas(false)} aria-label="Fechar notificações"><X /></button></header>
                {erroNotificacoes && <div className="erro-notificacoes" role="alert"><p>{erroNotificacoes}</p><button type="button" onClick={() => void carregarNotificacoes()} disabled={carregandoNotificacoes}>{carregandoNotificacoes ? "Tentando..." : "Tentar novamente"}</button></div>}
                <div className="lista-notificacoes" onScroll={carregarAoRolar} aria-busy={carregandoNotificacoes || carregandoMaisNotificacoes}>
                  {carregandoNotificacoes && notificacoes.length === 0 ? <p className="notificacoes-vazias">Carregando notificações...</p> : notificacoes.length === 0 ? <p className="notificacoes-vazias">Nenhuma notificação registrada.</p> : notificacoes.map((item) => <article className={item.lida_em ? "" : "nao-lida"} key={item.uuid}><span>{item.tipo === "pesagem" || item.tipo === "meta" ? <Scale /> : item.tipo === "catador" || item.tipo === "caixa" ? <UsersRound /> : <Building2 />}</span><button className="conteudo-notificacao" type="button" onClick={() => void abrirNotificacao(item)} disabled={acaoNotificacao !== null}><strong>{item.titulo}</strong><p>{item.mensagem}</p><small>{new Date(item.criado_em).toLocaleString("pt-BR")}</small></button><button className="excluir-notificacao" type="button" onClick={() => void excluirNotificacao(item)} disabled={acaoNotificacao !== null} aria-label={`Excluir notificação: ${item.titulo}`}><Trash2 /></button></article>)}
                  {carregandoMaisNotificacoes && <p className="carregando-mais-notificacoes">Carregando mais...</p>}
                </div>
                <footer className="acoes-notificacoes"><button className="marcar-notificacoes" type="button" onClick={() => void marcarTodasComoLidas()} disabled={notificacoesNaoLidas === 0 || acaoNotificacao !== null}><CheckCheck />{acaoNotificacao === "todas" ? "Marcando..." : notificacoesNaoLidas === 0 ? "Tudo lido" : "Marcar como lidas"}</button><button className="limpar-notificacoes" type="button" onClick={() => void limparNotificacoes()} disabled={totalNotificacoes === 0 || acaoNotificacao !== null}><Trash2 />{acaoNotificacao === "limpar" ? "Limpando..." : "Limpar"}</button></footer>
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

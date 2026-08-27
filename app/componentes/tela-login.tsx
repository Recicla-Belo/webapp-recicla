"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useIdentidadeVisual } from "@/app/configuracao/identidade-visual";
import { MarcaPlataforma } from "./marca-plataforma";
import type { AdministradorApi } from "@/app/dados/api";

const CHAVE_EMAIL_LEMBRADO = "recicla-belo:email-lembrado";

function IconeOlho({ visivel }: { visivel: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    {visivel ? <>
      <path d="M2.5 12s3.4-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.4 5.5-9.5 5.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </> : <>
      <path d="M4.2 4.2 19.8 19.8" />
      <path d="M9.4 6.8A10.7 10.7 0 0 1 12 6.5c6.1 0 9.5 5.5 9.5 5.5a16.5 16.5 0 0 1-2.7 3.3" />
      <path d="M6.1 8.1A16.7 16.7 0 0 0 2.5 12s3.4 5.5 9.5 5.5a10.7 10.7 0 0 0 3.1-.4" />
      <path d="M10.2 10.2a2.75 2.75 0 0 0 3.6 3.6" />
    </>}
  </svg>;
}

export function TelaLogin({ onAutenticado }: { onAutenticado: (usuario: AdministradorApi) => void }) {
  const { identidade } = useIdentidadeVisual();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [lembrarAcesso, setLembrarAcesso] = useState(false);
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      const emailLembrado = window.localStorage.getItem(CHAVE_EMAIL_LEMBRADO);
      if (emailLembrado) {
        setEmail(emailLembrado);
        setLembrarAcesso(true);
      }
    }, 0);
    return () => window.clearTimeout(temporizador);
  }, []);

  function alterarLembrarAcesso(lembrar: boolean) {
    setLembrarAcesso(lembrar);
    if (!lembrar) window.localStorage.removeItem(CHAVE_EMAIL_LEMBRADO);
  }

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const base = process.env.NEXT_PUBLIC_URL_API ?? "http://localhost:3333";
      const resposta = await fetch(`${base}/api/autenticacao/entrar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, senha }),
      });
      const dados = await resposta.json() as { autenticado?: boolean; usuario?: AdministradorApi; mensagem?: string };
      if (!resposta.ok || !dados.autenticado || !dados.usuario) throw new Error(dados.mensagem ?? "Não foi possível entrar.");
      if (lembrarAcesso) window.localStorage.setItem(CHAVE_EMAIL_LEMBRADO, email.trim().toLowerCase());
      else window.localStorage.removeItem(CHAVE_EMAIL_LEMBRADO);
      onAutenticado(dados.usuario);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível entrar. Verifique a inicialização da aplicação.");
    } finally {
      setEnviando(false);
    }
  }

  return <main className="pagina-login">
    <div className="cenario-login" aria-hidden="true">
      <span className="orbe-login orbe-um" />
      <span className="orbe-login orbe-dois" />
      <span className="orbe-login orbe-tres" />
      <span className="malha-login" />
    </div>

    <section className="login-central" aria-labelledby="titulo-login">
      <MarcaPlataforma />
      <div className="cartao-login">
        <div className="selo-login"><span aria-hidden="true">✓</span> Ambiente administrativo seguro</div>
        <h1 id="titulo-login">Bem-vindo de volta</h1>
        <p>Entre para gerenciar cooperativas, catadores e pesagens em Belo Horizonte.</p>

        <form onSubmit={entrar}>
          <label className="campo campo-login">E-mail
            <input type="email" name="email" inputMode="email" autoComplete="username" value={email} onChange={(evento) => setEmail(evento.target.value)} placeholder="Digite seu e-mail" required />
          </label>
          <label className="campo campo-login">Senha
            <div className="campo-senha">
              <input type={senhaVisivel ? "text" : "password"} name="senha" autoComplete="current-password" value={senha} onChange={(evento) => setSenha(evento.target.value)} placeholder="Digite sua senha" required />
              <button type="button" onClick={() => setSenhaVisivel((visivel) => !visivel)} aria-pressed={senhaVisivel} aria-label={senhaVisivel ? "Ocultar senha" : "Visualizar senha"} title={senhaVisivel ? "Ocultar senha" : "Visualizar senha"}><IconeOlho visivel={senhaVisivel} /></button>
            </div>
          </label>
          <label className="interruptor interruptor-login" htmlFor="lembrar-acesso" aria-label="Lembrar meu acesso neste dispositivo">
            <input id="lembrar-acesso" type="checkbox" checked={lembrarAcesso} onChange={(evento) => alterarLembrarAcesso(evento.target.checked)} />
            <span aria-hidden="true" />
            <div><strong>Lembrar meu acesso</strong><small>Salva somente o e-mail neste dispositivo</small></div>
          </label>
          {erro && <div className="erro-login" role="alert">{erro}</div>}
          <button className="botao-primario botao-entrar" disabled={enviando}>{enviando ? "Verificando acesso..." : `Entrar no ${identidade.nomeAplicacao}`}</button>
        </form>
        <div className="rodape-login"><span aria-hidden="true">●</span> Acesso exclusivo do administrador</div>
      </div>
    </section>
  </main>;
}

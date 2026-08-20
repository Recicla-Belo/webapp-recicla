"use client";

import { useState, type FormEvent } from "react";

function IconeOlho({ visivel }: { visivel: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
    {!visivel && <path d="m4 4 16 16" />}
  </svg>;
}

export function TelaLogin({ onAutenticado }: { onAutenticado: (token: string) => void }) {
  const [email, setEmail] = useState("admin@reciclabelo");
  const [senha, setSenha] = useState("");
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const base = process.env.NEXT_PUBLIC_URL_API ?? "http://localhost:3333";
      const resposta = await fetch(`${base}/api/autenticacao/entrar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      const dados = await resposta.json() as { token?: string; mensagem?: string };
      if (!resposta.ok || !dados.token) throw new Error(dados.mensagem ?? "Não foi possível entrar.");
      onAutenticado(dados.token);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível entrar. Verifique a inicialização da aplicação.");
    } finally {
      setEnviando(false);
    }
  }

  return <main className="pagina-login">
    <section className="apresentacao-login">
      <div className="marca-login"><span>RB</span><div><strong>Recicla Belô</strong><small>Gestão que transforma</small></div></div>
      <div className="texto-login"><span>GESTÃO COOPERATIVA</span><h1>Cada pesagem conta.<br/><em>Cada pessoa importa.</em></h1><p>Informação simples e segura para fortalecer quem transforma resíduos em futuro para Belo Horizonte.</p></div>
      <div className="rodape-apresentacao"><b>BH</b><span>Feito para cooperativas e<br/>associações de Belo Horizonte</span></div>
    </section>
    <section className="acesso-login">
      <form onSubmit={entrar}>
        <span className="icone-acesso">↻</span>
        <h2>Bem-vindo de volta</h2>
        <p>Entre com o acesso administrativo para continuar.</p>
        <label className="campo">E-mail<input type="email" autoComplete="username" value={email} onChange={(evento) => setEmail(evento.target.value)} required /></label>
        <label className="campo">Senha
          <div className="campo-senha">
            <input type={senhaVisivel ? "text" : "password"} autoComplete="current-password" value={senha} onChange={(evento) => setSenha(evento.target.value)} placeholder="Digite sua senha" required />
            <button type="button" onClick={() => setSenhaVisivel((visivel) => !visivel)} aria-label={senhaVisivel ? "Ocultar senha" : "Visualizar senha"} title={senhaVisivel ? "Ocultar senha" : "Visualizar senha"}><IconeOlho visivel={senhaVisivel} /></button>
          </div>
        </label>
        {erro && <div className="erro-login" role="alert">{erro}</div>}
        <button className="botao-primario botao-entrar" disabled={enviando}>{enviando ? "Entrando..." : "Entrar no Recicla Belô →"}</button>
        <small>Acesso exclusivo do administrador. Não há cadastro público.</small>
      </form>
    </section>
  </main>;
}

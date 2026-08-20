"use client";

import { useState, type FormEvent } from "react";

export function TelaLogin({ onAutenticado }: { onAutenticado: (token: string) => void }) {
  const [email,setEmail]=useState("admin@reciclabelo");
  const [senha,setSenha]=useState("");
  const [erro,setErro]=useState("");
  const [enviando,setEnviando]=useState(false);

  async function entrar(evento: FormEvent) {
    evento.preventDefault(); setErro(""); setEnviando(true);
    try {
      const base=process.env.NEXT_PUBLIC_URL_API ?? "http://localhost:3333";
      const resposta=await fetch(`${base}/api/autenticacao/entrar`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,senha})});
      const dados=await resposta.json() as {token?:string;mensagem?:string};
      if(!resposta.ok||!dados.token) throw new Error(dados.mensagem ?? "Não foi possível entrar.");
      onAutenticado(dados.token);
    } catch (falha) { setErro(falha instanceof Error ? falha.message : "Não foi possível entrar. Verifique se a API está ativa."); }
    finally { setEnviando(false); }
  }

  return <main className="pagina-login"><section className="apresentacao-login"><div className="marca-login"><span>RB</span><div><strong>Recicla Belô</strong><small>Gestão que transforma</small></div></div><div className="texto-login"><span>GESTÃO COOPERATIVA</span><h1>Cada pesagem conta.<br/><em>Cada pessoa importa.</em></h1><p>Informação simples e segura para fortalecer quem transforma resíduos em futuro para Belo Horizonte.</p></div><div className="rodape-apresentacao"><b>BH</b><span>Feito para cooperativas e<br/>associações de Belo Horizonte</span></div></section><section className="acesso-login"><form onSubmit={entrar}><span className="icone-acesso">↻</span><h2>Bem-vindo de volta</h2><p>Entre com o acesso administrativo para continuar.</p><label className="campo">E-mail<input type="email" autoComplete="username" value={email} onChange={(e)=>setEmail(e.target.value)} required /></label><label className="campo">Senha<input type="password" autoComplete="current-password" value={senha} onChange={(e)=>setSenha(e.target.value)} placeholder="Digite sua senha" required /></label>{erro&&<div className="erro-login" role="alert">{erro}</div>}<button className="botao-primario botao-entrar" disabled={enviando}>{enviando?"Entrando...":"Entrar no Recicla Belô →"}</button><small>Acesso exclusivo do administrador. Não há cadastro público.</small></form></section></main>;
}

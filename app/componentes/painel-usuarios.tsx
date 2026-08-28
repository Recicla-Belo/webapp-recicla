"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Pencil, Plus, ShieldCheck, UserRound, X } from "lucide-react";
import { requisitarApi, type UsuarioContaApi } from "@/app/dados/api";
import { Paginacao } from "@/app/componentes/paginacao";

const formularioInicial = { nome: "", email: "", senha: "", confirmarSenha: "", ativo: true };

function senhaSegura(senha: string) {
  return senha.length >= 12 && /[a-z]/.test(senha) && /[A-Z]/.test(senha) && /\d/.test(senha) && /[^A-Za-z0-9]/.test(senha);
}

export function PainelUsuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioContaApi[]>([]);
  const [usuarioEdicao, setUsuarioEdicao] = useState<UsuarioContaApi | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [formulario, setFormulario] = useState(formularioInicial);
  const [mensagem, setMensagem] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [pagina, setPagina] = useState(1);
  const itensPorPagina = 6;

  const carregar = useCallback(async () => {
    try {
      const resposta = await requisitarApi<{ dados: UsuarioContaApi[] }>("/api/usuarios");
      setUsuarios(resposta.dados);
      setPagina((atual) => Math.min(atual, Math.max(1, Math.ceil(resposta.dados.length / itensPorPagina))));
      setMensagem("");
    } catch (erro) {
      setMensagem(erro instanceof Error ? erro.message : "Não foi possível carregar as contas.");
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  function abrir(usuario?: UsuarioContaApi) {
    setUsuarioEdicao(usuario ?? null);
    setFormulario(usuario ? { nome: usuario.nome, email: usuario.email, senha: "", confirmarSenha: "", ativo: usuario.ativo } : formularioInicial);
    setMensagem("");
    setModalAberto(true);
  }

  function fechar() {
    if (salvando) return;
    setModalAberto(false);
    setUsuarioEdicao(null);
    setFormulario(formularioInicial);
  }

  async function salvar() {
    const senhaInformada = formulario.senha.length > 0;
    if (formulario.nome.trim().length < 2 || !formulario.email.includes("@")) return setMensagem("Informe nome e e-mail válidos.");
    if ((!usuarioEdicao || senhaInformada) && !senhaSegura(formulario.senha)) return setMensagem("A senha deve ter 12 caracteres e incluir maiúscula, minúscula, número e símbolo.");
    if ((!usuarioEdicao || senhaInformada) && formulario.senha !== formulario.confirmarSenha) return setMensagem("A confirmação da senha não corresponde.");
    setSalvando(true); setMensagem("");
    try {
      const corpo = { nome: formulario.nome.trim(), email: formulario.email.trim(), ativo: formulario.ativo, ...(senhaInformada ? { senha: formulario.senha } : {}) };
      await requisitarApi(usuarioEdicao ? `/api/usuarios/${usuarioEdicao.uuid}` : "/api/usuarios", { method: usuarioEdicao ? "PATCH" : "POST", body: JSON.stringify(corpo) });
      setModalAberto(false);
      setUsuarioEdicao(null);
      setFormulario(formularioInicial);
      await carregar();
      setMensagem(usuarioEdicao ? "Conta restrita atualizada e sessões anteriores revogadas." : "Conta restrita criada com sucesso.");
    } catch (erro) {
      setMensagem(erro instanceof Error ? erro.message : "Não foi possível salvar a conta.");
    } finally { setSalvando(false); }
  }

  const paginados = useMemo(() => usuarios.slice((pagina - 1) * itensPorPagina, pagina * itensPorPagina), [pagina, usuarios]);

  return <section className="painel painel-usuarios">
    <div className="resumo-pagina"><div><h2>Usuários e permissões</h2><p>Crie acessos operacionais sem conceder poder para alterar, excluir ou configurar o sistema.</p></div><button type="button" className="botao-primario" onClick={() => abrir()}><Plus /> Nova conta restrita</button></div>
    <div className="resumo-permissoes"><ShieldCheck /><div><strong>Proteção aplicada também no servidor</strong><p>Contas restritas podem consultar e cadastrar catadores, cooperativas e pesagens. Edição, exclusão, caixas, materiais, responsáveis, metas e configurações administrativas são bloqueados.</p></div></div>
    {mensagem && <p className="mensagem-configuracao" role="status">{mensagem}</p>}
    <div className="lista-usuarios">{paginados.map((usuario) => <article key={usuario.uuid}>
      <span className="avatar-usuario"><UserRound /></span>
      <div className="dados-usuario"><strong>{usuario.nome}</strong><small>{usuario.email}</small><small>{usuario.ultimo_acesso_em ? `Último acesso: ${new Date(usuario.ultimo_acesso_em).toLocaleString("pt-BR")}` : "Ainda não acessou"}</small></div>
      <em className={`perfil-acesso ${usuario.administrador ? "administrador" : "restrito"}`}>{usuario.administrador ? "Administrador" : "Cadastro restrito"}</em>
      <span className={usuario.ativo ? "status ativo" : "status"}>● {usuario.ativo ? "ativo" : "bloqueado"}</span>
      {usuario.perfil === "operador_cadastro" ? <button type="button" className="botao-secundario" onClick={() => abrir(usuario)}><Pencil /> Gerenciar</button> : <span className="conta-principal"><ShieldCheck /> Conta principal</span>}
    </article>)}</div>
    <Paginacao pagina={pagina} total={usuarios.length} itensPorPagina={itensPorPagina} aoMudarPagina={setPagina} rotulo="usuários" />

    {modalAberto && <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-usuario"><div className="modal pequeno modal-usuario">
      <header className="cabecalho-modal"><div><span>ACESSO RESTRITO</span><h2 id="titulo-usuario">{usuarioEdicao ? "Gerenciar conta" : "Criar conta restrita"}</h2><p>Esta conta poderá inserir dados, mas nunca alterar ou excluir registros.</p></div><button type="button" onClick={fechar} aria-label="Fechar"><X /></button></header>
      <form className="formulario" onSubmit={(evento) => evento.preventDefault()}>
        <label className="campo">Nome completo<input autoFocus value={formulario.nome} maxLength={160} onChange={(evento) => setFormulario((atual) => ({ ...atual, nome: evento.target.value }))} /></label>
        <label className="campo">E-mail de acesso<input type="email" autoComplete="off" value={formulario.email} maxLength={254} onChange={(evento) => setFormulario((atual) => ({ ...atual, email: evento.target.value }))} /></label>
        <label className="campo">{usuarioEdicao ? "Nova senha (opcional)" : "Senha inicial"}<span className="campo-com-icone"><KeyRound /><input type="password" autoComplete="new-password" value={formulario.senha} minLength={12} maxLength={128} onChange={(evento) => setFormulario((atual) => ({ ...atual, senha: evento.target.value }))} /></span><small className="dica">12 caracteres, com maiúscula, minúscula, número e símbolo.</small></label>
        <label className="campo">Confirmar senha<input type="password" autoComplete="new-password" value={formulario.confirmarSenha} minLength={12} maxLength={128} onChange={(evento) => setFormulario((atual) => ({ ...atual, confirmarSenha: evento.target.value }))} /></label>
        <label className="interruptor compacto"><input type="checkbox" checked={formulario.ativo} onChange={(evento) => setFormulario((atual) => ({ ...atual, ativo: evento.target.checked }))} /><span /><div><strong>{formulario.ativo ? "Acesso liberado" : "Acesso bloqueado"}</strong><small>Ao bloquear ou salvar alterações, as sessões anteriores serão revogadas.</small></div></label>
      </form>
      {mensagem && <p className="mensagem-configuracao" role="alert">{mensagem}</p>}
      <footer className="rodape-modal"><button type="button" className="botao-secundario" onClick={fechar} disabled={salvando}>Cancelar</button><button type="button" className="botao-primario" onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando..." : usuarioEdicao ? "Salvar e revogar sessões" : "Criar conta"}</button></footer>
    </div></div>}
  </section>;
}

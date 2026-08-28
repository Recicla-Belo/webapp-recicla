"use client";

/* eslint-disable jsx-a11y/label-has-associated-control -- os controles possuem texto visível e inputs aninhados */

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Pencil, Plus, ShieldCheck, UserRound, X } from "lucide-react";
import { requisitarApi, type PermissaoCatalogoApi, type PermissaoUsuario, type UsuarioContaApi } from "@/app/dados/api";
import { Paginacao } from "@/app/componentes/paginacao";

const formularioInicial = { nome: "", email: "", senha: "", confirmarSenha: "", ativo: true, permissoes: [] as PermissaoUsuario[] };
const dependencias: Partial<Record<PermissaoUsuario, PermissaoUsuario>> = {
  catadores_cadastrar: "catadores_visualizar", catadores_editar: "catadores_visualizar", catadores_excluir: "catadores_visualizar", catadores_gerenciar_caixa: "catadores_visualizar",
  cooperativas_cadastrar: "cooperativas_visualizar", cooperativas_editar: "cooperativas_visualizar", cooperativas_excluir: "cooperativas_visualizar",
  pesagens_editar: "relatorios_visualizar", pesagens_excluir: "relatorios_visualizar",
};

function senhaSegura(senha: string) {
  return senha.length >= 12 && /[a-z]/.test(senha) && /[A-Z]/.test(senha) && /\d/.test(senha) && /[^A-Za-z0-9]/.test(senha);
}

export function PainelUsuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioContaApi[]>([]);
  const [catalogo, setCatalogo] = useState<PermissaoCatalogoApi[]>([]);
  const [usuarioEdicao, setUsuarioEdicao] = useState<UsuarioContaApi | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [formulario, setFormulario] = useState(formularioInicial);
  const [mensagem, setMensagem] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [pagina, setPagina] = useState(1);
  const itensPorPagina = 6;

  const carregar = useCallback(async () => {
    try {
      const [respostaUsuarios, respostaPermissoes] = await Promise.all([
        requisitarApi<{ dados: UsuarioContaApi[] }>("/api/usuarios"),
        requisitarApi<{ dados: PermissaoCatalogoApi[] }>("/api/permissoes"),
      ]);
      setUsuarios(respostaUsuarios.dados); setCatalogo(respostaPermissoes.dados);
      setPagina((atual) => Math.min(atual, Math.max(1, Math.ceil(respostaUsuarios.dados.length / itensPorPagina))));
      setMensagem("");
    } catch (erro) { setMensagem(erro instanceof Error ? erro.message : "Não foi possível carregar as contas e permissões."); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega dados persistidos ao abrir o painel
  useEffect(() => { void carregar(); }, [carregar]);

  function abrir(usuario?: UsuarioContaApi) {
    setUsuarioEdicao(usuario ?? null);
    setFormulario(usuario ? { nome: usuario.nome, email: usuario.email, senha: "", confirmarSenha: "", ativo: usuario.ativo, permissoes: usuario.permissoes } : formularioInicial);
    setMensagem(""); setModalAberto(true);
  }

  function fechar() {
    if (salvando) return;
    setModalAberto(false); setUsuarioEdicao(null); setFormulario(formularioInicial);
  }

  function alterarPermissao(chave: PermissaoUsuario, marcada: boolean) {
    setFormulario((atual) => {
      const selecionadas = new Set(atual.permissoes);
      if (marcada) {
        selecionadas.add(chave);
        const dependencia = dependencias[chave];
        if (dependencia) selecionadas.add(dependencia);
      } else {
        selecionadas.delete(chave);
        for (const [permissao, dependencia] of Object.entries(dependencias) as Array<[PermissaoUsuario, PermissaoUsuario]>) if (dependencia === chave) selecionadas.delete(permissao);
      }
      return { ...atual, permissoes: catalogo.map((item) => item.chave).filter((item) => selecionadas.has(item)) };
    });
  }

  async function salvar() {
    const senhaInformada = formulario.senha.length > 0;
    if (formulario.nome.trim().length < 2 || !formulario.email.includes("@")) return setMensagem("Informe nome e e-mail válidos.");
    if (formulario.permissoes.length === 0) return setMensagem("Selecione ao menos uma permissão para esta conta.");
    if ((!usuarioEdicao || senhaInformada) && !senhaSegura(formulario.senha)) return setMensagem("A senha deve ter 12 caracteres e incluir maiúscula, minúscula, número e símbolo.");
    if ((!usuarioEdicao || senhaInformada) && formulario.senha !== formulario.confirmarSenha) return setMensagem("A confirmação da senha não corresponde.");
    setSalvando(true); setMensagem("");
    try {
      const corpo = { nome: formulario.nome.trim(), email: formulario.email.trim(), ativo: formulario.ativo, permissoes: formulario.permissoes, ...(senhaInformada ? { senha: formulario.senha } : {}) };
      await requisitarApi(usuarioEdicao ? `/api/usuarios/${usuarioEdicao.uuid}` : "/api/usuarios", { method: usuarioEdicao ? "PATCH" : "POST", body: JSON.stringify(corpo) });
      const editando = Boolean(usuarioEdicao);
      setModalAberto(false); setUsuarioEdicao(null); setFormulario(formularioInicial);
      await carregar();
      setMensagem(editando ? "Conta e permissões atualizadas; sessões anteriores foram revogadas." : "Conta criada com as permissões selecionadas.");
    } catch (erro) { setMensagem(erro instanceof Error ? erro.message : "Não foi possível salvar a conta."); }
    finally { setSalvando(false); }
  }

  const grupos = useMemo(() => {
    const agrupados = new Map<string, PermissaoCatalogoApi[]>();
    catalogo.forEach((item) => agrupados.set(item.grupo, [...(agrupados.get(item.grupo) ?? []), item]));
    return [...agrupados.entries()];
  }, [catalogo]);
  const paginados = useMemo(() => usuarios.slice((pagina - 1) * itensPorPagina, pagina * itensPorPagina), [pagina, usuarios]);

  return <section className="painel painel-usuarios">
    <div className="resumo-pagina"><div><h2>Usuários e permissões</h2><p>Defina exatamente o que cada conta pode consultar ou alterar.</p></div><button type="button" className="botao-primario" onClick={() => abrir()}><Plus /> Nova conta</button></div>
    <div className="resumo-permissoes"><ShieldCheck /><div><strong>Permissões validadas no servidor</strong><p>Nenhum acesso operacional é presumido. Rotas administrativas e operações não concedidas continuam bloqueadas mesmo quando chamadas diretamente.</p></div></div>
    {mensagem && <p className="mensagem-configuracao" role="status">{mensagem}</p>}
    <div className="lista-usuarios">{paginados.map((usuario) => <article key={usuario.uuid}>
      <span className="avatar-usuario"><UserRound /></span><div className="dados-usuario"><strong>{usuario.nome}</strong><small>{usuario.email}</small><small>{usuario.ultimo_acesso_em ? `Último acesso: ${new Date(usuario.ultimo_acesso_em).toLocaleString("pt-BR")}` : "Ainda não acessou"}</small></div>
      <em className={`perfil-acesso ${usuario.administrador ? "administrador" : "restrito"}`}>{usuario.administrador ? "Administrador" : `${usuario.permissoes.length} permissões`}</em><span className={usuario.ativo ? "status ativo" : "status"}>● {usuario.ativo ? "ativo" : "bloqueado"}</span>
      {usuario.perfil === "operador_cadastro" ? <button type="button" className="botao-secundario" onClick={() => abrir(usuario)}><Pencil /> Gerenciar</button> : <span className="conta-principal"><ShieldCheck /> Conta principal</span>}
    </article>)}</div>
    <Paginacao pagina={pagina} total={usuarios.length} itensPorPagina={itensPorPagina} aoMudarPagina={setPagina} rotulo="usuários" />

    {modalAberto && <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-usuario"><div className="modal modal-usuario">
      <header className="cabecalho-modal"><div><span>CONTROLE DE ACESSO</span><h2 id="titulo-usuario">{usuarioEdicao ? "Gerenciar conta" : "Criar conta"}</h2><p>Escolha as permissões necessárias para a função desta pessoa.</p></div><button type="button" onClick={fechar} aria-label="Fechar"><X /></button></header>
      <form className="formulario" onSubmit={(evento) => evento.preventDefault()}>
        <div className="grade-formulario"><label className="campo">Nome completo<input value={formulario.nome} maxLength={160} onChange={(evento) => setFormulario((atual) => ({ ...atual, nome: evento.target.value }))} /></label><label className="campo">E-mail de acesso<input type="email" autoComplete="off" value={formulario.email} maxLength={254} onChange={(evento) => setFormulario((atual) => ({ ...atual, email: evento.target.value }))} /></label></div>
        <div className="grade-formulario"><label className="campo">{usuarioEdicao ? "Nova senha (opcional)" : "Senha inicial"}<span className="campo-com-icone"><KeyRound /><input type="password" autoComplete="new-password" value={formulario.senha} minLength={12} maxLength={128} onChange={(evento) => setFormulario((atual) => ({ ...atual, senha: evento.target.value }))} /></span><small className="dica">12 caracteres, com maiúscula, minúscula, número e símbolo.</small></label><label className="campo">Confirmar senha<input type="password" autoComplete="new-password" value={formulario.confirmarSenha} minLength={12} maxLength={128} onChange={(evento) => setFormulario((atual) => ({ ...atual, confirmarSenha: evento.target.value }))} /></label></div>
        <fieldset className="seletor-permissoes"><legend>Permissões da conta <small>{formulario.permissoes.length} selecionadas</small></legend>{grupos.map(([grupo, permissoes]) => <section key={grupo}><h3>{grupo}</h3><div>{permissoes.map((permissao) => <label key={permissao.chave} className="opcao-permissao"><input type="checkbox" checked={formulario.permissoes.includes(permissao.chave)} onChange={(evento) => alterarPermissao(permissao.chave, evento.target.checked)} /><span><strong>{permissao.nome}</strong><small>{permissao.descricao}</small></span></label>)}</div></section>)}</fieldset>
        <label className="interruptor compacto" aria-label="Acesso da conta"><input type="checkbox" checked={formulario.ativo} onChange={(evento) => setFormulario((atual) => ({ ...atual, ativo: evento.target.checked }))} /><span /><div><strong>Acesso da conta</strong><small>{formulario.ativo ? "Liberado" : "Bloqueado"}. Alterações revogam as sessões anteriores.</small></div></label>
      </form>
      {mensagem && <p className="mensagem-configuracao mensagem-modal-usuario" role="alert">{mensagem}</p>}
      <footer className="rodape-modal"><button type="button" className="botao-secundario" onClick={fechar} disabled={salvando}>Cancelar</button><button type="button" className="botao-primario" onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando..." : usuarioEdicao ? "Salvar e revogar sessões" : "Criar conta"}</button></footer>
    </div></div>}
  </section>;
}

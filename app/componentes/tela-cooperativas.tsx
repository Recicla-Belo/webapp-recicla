"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { requisitarApi, type CooperativaApi } from "@/app/dados/api";

const formularioVazio = { nome: "", nomeResponsavel: "", telefone: "", observacao: "", ativa: true };

export function TelaCooperativas() {
  const [cooperativas, setCooperativas] = useState<CooperativaApi[]>([]);
  const [modal, setModal] = useState(false);
  const [edicao, setEdicao] = useState<CooperativaApi | null>(null);
  const [formulario, setFormulario] = useState(formularioVazio);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const dados = await requisitarApi<{ dados: CooperativaApi[] }>("/api/cooperativas");
      setCooperativas(dados.dados);
      setErro("");
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível carregar as cooperativas.");
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void carregar(); }, [carregar]);

  function abrir(item?: CooperativaApi) {
    setEdicao(item ?? null);
    setFormulario(item ? {
      nome: item.nome,
      nomeResponsavel: item.nome_responsavel,
      telefone: item.telefone ?? "",
      observacao: item.observacao ?? "",
      ativa: item.status === "ativo",
    } : formularioVazio);
    setModal(true);
  }

  async function salvar() {
    try {
      await requisitarApi(edicao ? `/api/cooperativas/${edicao.uuid}` : "/api/cooperativas", {
        method: edicao ? "PUT" : "POST",
        body: JSON.stringify(formulario),
      });
      setModal(false);
      await carregar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível salvar.");
    }
  }

  async function excluir(item: CooperativaApi) {
    if (!window.confirm(`Excluir ${item.nome}? Os catadores vinculados ficarão sem cooperativa.`)) return;
    try {
      await requisitarApi(`/api/cooperativas/${item.uuid}`, { method: "DELETE" });
      await carregar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível excluir.");
    }
  }

  return (
    <section className="pagina-interna">
      <div className="resumo-pagina">
        <div><h2>Cooperativas e associações</h2><p>{cooperativas.length} organizações cadastradas no PostgreSQL.</p></div>
        <button type="button" className="botao-primario" onClick={() => abrir()}><Plus /> Nova cooperativa</button>
      </div>
      {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
      <div className="grade-cooperativas">
        {cooperativas.map((item) => (
          <article className="cartao-cooperativa" key={item.uuid}>
            <header><span>{item.nome.slice(0, 2).toUpperCase()}</span><div className="acoes-cartao">
              <button type="button" className="menu-acoes" onClick={() => abrir(item)} aria-label={`Editar ${item.nome}`}><Pencil /></button>
              <button type="button" className="menu-acoes perigoso" onClick={() => void excluir(item)} aria-label={`Excluir ${item.nome}`}><Trash2 /></button>
            </div></header>
            <h3>{item.nome}</h3><p>Responsável</p><strong>{item.nome_responsavel}</strong>
            <div><span><b>{item.catadores_ativos}</b> catadores ativos</span><span>{item.telefone ?? "Sem telefone"}</span></div>
          </article>
        ))}
      </div>
      {cooperativas.length === 0 && <p className="estado-vazio painel">Nenhuma cooperativa cadastrada.</p>}

      {modal && <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-cooperativa"><div className="modal pequeno">
        <header className="cabecalho-modal"><div><span>CADASTRO</span><h2 id="titulo-cooperativa">{edicao ? "Editar cooperativa" : "Adicionar cooperativa"}</h2><p>As alterações serão salvas no banco de dados.</p></div><button type="button" onClick={() => setModal(false)} aria-label="Fechar">×</button></header>
        <form className="formulario" onSubmit={(evento) => evento.preventDefault()}>
          <label className="campo">Nome da cooperativa<input value={formulario.nome} onChange={(e) => setFormulario((f) => ({ ...f, nome: e.target.value }))} /></label>
          <label className="campo">Nome do responsável<input value={formulario.nomeResponsavel} onChange={(e) => setFormulario((f) => ({ ...f, nomeResponsavel: e.target.value }))} /></label>
          <label className="campo">Telefone <small>Opcional</small><input value={formulario.telefone} onChange={(e) => setFormulario((f) => ({ ...f, telefone: e.target.value }))} /></label>
          <label className="campo">Observação <small>Opcional</small><textarea value={formulario.observacao} onChange={(e) => setFormulario((f) => ({ ...f, observacao: e.target.value }))} /></label>
          <label className="interruptor compacto" aria-label="Cooperativa ativa"><input type="checkbox" checked={formulario.ativa} onChange={(e) => setFormulario((f) => ({ ...f, ativa: e.target.checked }))} /><span aria-hidden="true" /><div><strong>Cooperativa ativa</strong></div></label>
        </form>
        <footer className="rodape-modal"><button type="button" className="botao-secundario" onClick={() => setModal(false)}>Cancelar</button><button type="button" className="botao-primario" onClick={() => void salvar()}>Salvar cooperativa</button></footer>
      </div></div>}
    </section>
  );
}

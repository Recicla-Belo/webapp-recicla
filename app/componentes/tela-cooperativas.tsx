"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { requisitarApi, type CooperativaApi } from "@/app/dados/api";
import { Paginacao } from "@/app/componentes/paginacao";
import { ModalConfirmacao } from "@/app/componentes/modal-confirmacao";
import { useTermoBusca } from "@/app/utilitarios/use-termo-busca";

const formularioVazio = { nome: "", nomeResponsavel: "", telefone: "", observacao: "", ativa: true };

export function TelaCooperativas({ acessos }: { acessos: { cadastrar: boolean; editar: boolean; excluir: boolean } }) {
  const [cooperativas, setCooperativas] = useState<CooperativaApi[]>([]);
  const [modal, setModal] = useState(false);
  const [edicao, setEdicao] = useState<CooperativaApi | null>(null);
  const [formulario, setFormulario] = useState(formularioVazio);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [itensPorPagina, setItensPorPagina] = useState(8);
  const [total, setTotal] = useState(0);
  const [excluindo, setExcluindo] = useState<CooperativaApi | null>(null);
  const termoBusca = useTermoBusca(busca);

  const carregar = useCallback(async () => {
    try {
      const dados = await requisitarApi<{ dados: CooperativaApi[]; total: number }>(`/api/cooperativas?busca=${encodeURIComponent(termoBusca)}&limite=${itensPorPagina}&deslocamento=${(pagina - 1) * itensPorPagina}`);
      setCooperativas(dados.dados);
      setTotal(dados.total);
      setErro("");
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível carregar as cooperativas.");
    }
  }, [itensPorPagina, pagina, termoBusca]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void carregar(); }, [carregar]);

  function abrir(item?: CooperativaApi) {
    if (item && !acessos.editar) return;
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
    try {
      await requisitarApi(`/api/cooperativas/${item.uuid}`, { method: "DELETE" });
      setExcluindo(null);
      await carregar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível excluir.");
    }
  }

  return (
    <section className="pagina-interna">
      <div className="resumo-pagina">
        <div><h2>Cooperativas e associações</h2><p>{total} organizações encontradas no PostgreSQL.</p></div>
        {acessos.cadastrar && <button type="button" className="botao-primario" onClick={() => abrir()}><Plus /> Nova cooperativa</button>}
      </div>
      {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
      <div className="barra-ferramentas"><label className="campo-busca"><Search /><input value={busca} onChange={(evento) => { setBusca(evento.target.value); setPagina(1); }} placeholder="Buscar por cooperativa, responsável ou telefone..." /></label></div>
      <div className="grade-cooperativas">
        {cooperativas.map((item) => (
          <article className="cartao-cooperativa" key={item.uuid}>
            <header><span>{item.nome.slice(0, 2).toUpperCase()}</span>{(acessos.editar || acessos.excluir) && <div className="acoes-cartao">
              {acessos.editar && <button type="button" className="menu-acoes" onClick={() => abrir(item)} aria-label={`Editar ${item.nome}`}><Pencil /></button>}
              {acessos.excluir && <button type="button" className="menu-acoes perigoso" onClick={() => setExcluindo(item)} aria-label={`Excluir ${item.nome}`}><Trash2 /></button>}
            </div>}</header>
            <h3>{item.nome}</h3><p>Responsável</p><strong>{item.nome_responsavel}</strong>
            <div><span><b>{item.catadores_ativos}</b> catadores ativos</span><span>{item.telefone ?? "Sem telefone"}</span></div>
          </article>
        ))}
      </div>
      {cooperativas.length === 0 && <p className="estado-vazio painel">Nenhuma cooperativa cadastrada.</p>}
      <Paginacao pagina={pagina} total={total} itensPorPagina={itensPorPagina} aoMudarPagina={setPagina} aoMudarQuantidade={(quantidade) => { setItensPorPagina(quantidade); setPagina(1); }} opcoesQuantidade={[4, 8, 12]} rotulo="organizações" />

      {modal && ((edicao && acessos.editar) || (!edicao && acessos.cadastrar)) && <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-cooperativa"><div className="modal pequeno">
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
      <ModalConfirmacao aberto={acessos.excluir && Boolean(excluindo)} titulo={`Excluir ${excluindo?.nome ?? "cooperativa"}?`} descricao="Os catadores vinculados ficarão sem cooperativa. Esta ação não poderá ser desfeita." textoConfirmar="Excluir cooperativa" perigoso aoFechar={() => setExcluindo(null)} aoConfirmar={() => excluindo && void excluir(excluindo)} />
    </section>
  );
}

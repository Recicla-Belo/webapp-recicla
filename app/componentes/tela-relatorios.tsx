"use client";

/* eslint-disable jsx-a11y/label-has-associated-control -- controles compostos usam texto visível e input aninhado */

import { useCallback, useEffect, useState } from "react";
import { Download, History, LockKeyhole, Pencil, Search, Trash2, X } from "lucide-react";
import { requisitarApi, type CatadorApi, type CooperativaApi, type MaterialApi } from "@/app/dados/api";
import { Paginacao } from "@/app/componentes/paginacao";
import { useTermoBusca } from "@/app/utilitarios/use-termo-busca";

type Referencia = { uuid: string; nome: string };
type StatusPesagem = "concluida" | "agendada" | "cancelada";
type EventoAuditoria = { uuid: string; acao: "criacao" | "alteracao" | "exclusao_logica"; dados: { motivo?: string; antes?: Record<string, unknown>; depois?: Record<string, unknown> }; criado_em: string };
type PesagemApi = {
  uuid: string; codigo: string; criado_em: string; data_hora: string; atualizado_em: string; peso_total: number; valor_total: number;
  status: StatusPesagem; observacao: string | null; excluida_em: string | null; motivo_exclusao: string | null;
  catador_uuid: string; codigo_catador: string; catador: string; material_uuid: string; material: string;
  cooperativa_uuid: string; cooperativa: string | null; meta_diaria: number; percentual_meta: number; tipo_meta: "geral" | "material" | "fora_meta"; contabiliza_meta: boolean; guardar_excedente_meta: boolean; valor_bruto: number; status_caixa: "aberto" | "fechado" | null;
  peso_meta_aplicado: number; peso_excedente_pago: number; peso_excedente_credito: number; valor_premio_meta: number; valor_excedente_material: number;
  ponto_apoio_uuid: string; ponto_apoio: string; responsavel_pesagem_uuid: string | null; responsavel_outro: string | null; responsavel: string;
  historico: EventoAuditoria[];
};

const rotulosStatus: Record<StatusPesagem, string> = { concluida: "Concluída", agendada: "Agendada", cancelada: "Cancelada" };
function paraDataHoraLocal(valor: string) { const data = new Date(valor); return new Date(data.getTime() - data.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
function BarraMetaRelatorio({ percentual, meta }: { percentual: number; meta: number }) { return <div className="barra-meta-compacta"><div><i style={{ width: `${Math.min(Math.max(percentual, 0), 100)}%` }} /></div><small>Meta {meta.toLocaleString("pt-BR")} kg · {Math.round(percentual)}%</small></div>; }
function alteracoesEvento(evento: EventoAuditoria) {
  if (evento.acao !== "alteracao") return [];
  const antes = evento.dados.antes ?? {}; const depois = evento.dados.depois ?? {};
  const campos: Array<[string, unknown, unknown, string?]> = [["Peso", antes.item_peso, depois.peso, " kg"], ["Valor", antes.valor_total, depois.valorTotal], ["Regra da meta", antes.contabiliza_meta, depois.contabilizarNaMeta], ["Status", antes.status, depois.status], ["Data e hora", antes.data_hora, depois.dataHora], ["Observação", antes.observacao, depois.observacao]];
  return campos.filter(([, de, para]) => para !== undefined && String(de ?? "") !== String(para ?? "")).map(([nome, de, para, sufixo]) => {
    const formatar = (valor: unknown) => nome === "Valor" ? Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : nome === "Data e hora" && valor ? new Date(String(valor)).toLocaleString("pt-BR") : `${String(valor ?? "não informado")}${sufixo ?? ""}`;
    return `${nome}: ${formatar(de)} → ${formatar(para)}`;
  });
}

export function TelaRelatorios({ podeGerenciar = true }: { podeGerenciar?: boolean }) {
  const [pesagens, setPesagens] = useState<PesagemApi[]>([]);
  const [catadores, setCatadores] = useState<CatadorApi[]>([]);
  const [materiais, setMateriais] = useState<MaterialApi[]>([]);
  const [cooperativas, setCooperativas] = useState<CooperativaApi[]>([]);
  const [pontos, setPontos] = useState<Referencia[]>([]);
  const [responsaveis, setResponsaveis] = useState<Referencia[]>([]);
  const [busca, setBusca] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [pagina, setPagina] = useState(1);
  const [itensPorPagina, setItensPorPagina] = useState(10);
  const [total, setTotal] = useState(0);
  const [totais, setTotais] = useState({ peso: 0, valor: 0 });
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<PesagemApi | null>(null);
  const [excluindo, setExcluindo] = useState<PesagemApi | null>(null);
  const [historicoAberto, setHistoricoAberto] = useState<PesagemApi | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [motivoExclusao, setMotivoExclusao] = useState("");
  const [formulario, setFormulario] = useState({ catadorUuid: "", cooperativaUuid: "", pontoApoioUuid: "", responsavelUuid: "", responsavelOutro: "", materialUuid: "", contabilizarNaMeta: true, guardarExcedenteMeta: false, peso: "", dataHora: "", status: "concluida" as StatusPesagem, observacao: "", motivoAlteracao: "" });
  const termoBusca = useTermoBusca(busca);

  const carregar = useCallback(async () => {
    try {
      const consulta = new URLSearchParams({ limite: String(itensPorPagina), deslocamento: String((pagina - 1) * itensPorPagina) });
      if (inicio) consulta.set("inicio", inicio);
      if (fim) consulta.set("fim", fim);
      if (termoBusca) consulta.set("busca", termoBusca);
      const dados = await requisitarApi<{ dados: PesagemApi[]; total: number; totais: { peso: number; valor: number } }>(`/api/relatorios/pesagens?${consulta}`);
      if (dados.dados.length === 0 && dados.total > 0 && pagina > 1) {
        setPagina((atual) => atual - 1);
        return;
      }
      setPesagens(dados.dados);
      setTotal(dados.total);
      setTotais({ peso: Number(dados.totais.peso), valor: Number(dados.totais.valor) });
      setErro("");
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível carregar os relatórios.");
    }
  }, [fim, inicio, itensPorPagina, pagina, termoBusca]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    void Promise.all([
      requisitarApi<{ dados: CatadorApi[] }>("/api/catadores?limite=100"),
      requisitarApi<{ dados: CooperativaApi[] }>("/api/cooperativas"),
      requisitarApi<{ dados: MaterialApi[] }>("/api/materiais"),
      requisitarApi<{ dados: Referencia[] }>("/api/pontos-apoio"),
      requisitarApi<{ dados: Referencia[] }>("/api/responsaveis-pesagem"),
    ]).then(([c, co, m, p, r]) => { setCatadores(c.dados); setCooperativas(co.dados); setMateriais(m.dados); setPontos(p.dados); setResponsaveis(r.dados); }).catch(() => undefined);
  }, []);

  function abrirEdicao(item: PesagemApi) {
    setEditando(item);
    setFormulario({ catadorUuid: item.catador_uuid, cooperativaUuid: item.cooperativa_uuid, pontoApoioUuid: item.ponto_apoio_uuid, responsavelUuid: item.responsavel_pesagem_uuid ?? "outro", responsavelOutro: item.responsavel_outro ?? "", materialUuid: item.material_uuid, contabilizarNaMeta: item.contabiliza_meta, guardarExcedenteMeta: item.guardar_excedente_meta, peso: String(item.peso_total), dataHora: paraDataHoraLocal(item.data_hora), status: item.status, observacao: item.observacao ?? "", motivoAlteracao: "" });
  }

  async function salvarEdicao() {
    if (!editando) return;
    const peso = Number(formulario.peso.replace(",", "."));
    if (peso <= 0 || !formulario.motivoAlteracao.trim()) return setErro("Informe um peso válido e o motivo da alteração.");
    setSalvando(true); setErro("");
    try {
      await requisitarApi(`/api/pesagens/${editando.uuid}`, { method: "PUT", body: JSON.stringify({
        catadorUuid: formulario.catadorUuid,
        cooperativaUuid: formulario.cooperativaUuid,
        pontoApoioUuid: formulario.pontoApoioUuid,
        responsavelPesagemUuid: formulario.responsavelUuid === "outro" ? undefined : formulario.responsavelUuid,
        responsavelOutro: formulario.responsavelUuid === "outro" ? formulario.responsavelOutro.trim() : undefined,
        materialUuid: formulario.materialUuid,
        contabilizarNaMeta: formulario.contabilizarNaMeta,
        guardarExcedenteMeta: formulario.contabilizarNaMeta && formulario.guardarExcedenteMeta,
        peso,
        dataHora: new Date(formulario.dataHora).toISOString(),
        status: formulario.status,
        observacao: formulario.observacao.trim() || undefined,
        motivoAlteracao: formulario.motivoAlteracao.trim(),
      }) });
      setEditando(null);
      await carregar();
    } catch (falha) { setErro(falha instanceof Error ? falha.message : "Não foi possível alterar a pesagem."); }
    finally { setSalvando(false); }
  }

  async function confirmarExclusao() {
    if (!excluindo || motivoExclusao.trim().length < 3) return setErro("Informe o motivo da exclusão.");
    setSalvando(true); setErro("");
    try {
      await requisitarApi(`/api/pesagens/${excluindo.uuid}`, { method: "DELETE", body: JSON.stringify({ motivo: motivoExclusao.trim() }) });
      setExcluindo(null); setMotivoExclusao("");
      await carregar();
    } catch (falha) { setErro(falha instanceof Error ? falha.message : "Não foi possível excluir a pesagem."); }
    finally { setSalvando(false); }
  }

  function exportar() {
    const linhas = [["Código", "Data e hora", "Código catador", "Catador", "Material", "Regra de pagamento", "Ponto", "Responsável", "Peso", "Valor", "Status", "Excluída", "Motivo exclusão"], ...pesagens.map((p) => [p.codigo, new Date(p.data_hora).toLocaleString("pt-BR"), p.codigo_catador, p.catador, p.material, p.contabiliza_meta ? "Contabiliza na meta" : "Fora da meta — pagamento imediato", p.ponto_apoio, p.responsavel, String(p.peso_total), String(p.valor_total), rotulosStatus[p.status], p.excluida_em ? "Sim" : "Não", p.motivo_exclusao ?? ""])];
    const csv = linhas.map((linha) => linha.map((campo) => `"${String(campo).replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "relatorio-pesagens.csv"; link.click(); URL.revokeObjectURL(url);
  }

  return <section className={`pagina-interna${podeGerenciar ? "" : " somente-cadastro"}`}>
    <div className="resumo-pagina"><div><h2>Produção, pagamentos e auditoria</h2><p>Registros ativos, alterados e excluídos logicamente.</p></div><button type="button" className="botao-secundario" onClick={exportar} disabled={pesagens.length === 0}><Download /> Exportar página</button></div>
    {!podeGerenciar && <p className="aviso-permissao"><LockKeyhole /> Sua conta pode consultar e exportar relatórios, mas não pode corrigir nem excluir pesagens.</p>}
    {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
    <div className="grade-resumo-relatorio"><article><span>KG</span><div><small>Peso concluído</small><strong>{totais.peso.toLocaleString("pt-BR")} kg</strong></div></article><article><span>R$</span><div><small>Valor concluído</small><strong>{totais.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div></article><article><span>№</span><div><small>Registros no relatório</small><strong>{total.toLocaleString("pt-BR")}</strong></div></article></div>
    <div className="barra-ferramentas"><label className="campo-busca"><Search /><input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} placeholder="Buscar catador, material, código ou status..." aria-label="Buscar no relatório" /></label><input className="entrada-filtro" type="date" value={inicio} onChange={(e) => { setInicio(e.target.value); setPagina(1); }} aria-label="Data inicial" /><input className="entrada-filtro" type="date" value={fim} onChange={(e) => { setFim(e.target.value); setPagina(1); }} aria-label="Data final" /></div>
    <div className="tabela-responsiva"><table><thead><tr><th>Registro</th><th>Catador</th><th>Material</th><th>Cooperativa / ponto</th><th>Peso e valor</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{pesagens.map((p) => { const valorLiberado = !p.contabiliza_meta || Number(p.valor_total) > 0 || Number(p.meta_diaria) <= 0 || Number(p.percentual_meta) >= 100; return <tr key={p.uuid} className={p.excluida_em ? "registro-excluido" : ""}><td><code>{p.codigo}</code><small className="texto-bloco">{new Date(p.data_hora).toLocaleString("pt-BR")}</small></td><td><strong>{p.catador}</strong><small className="texto-bloco">{p.codigo_catador} · Por {p.responsavel}</small></td><td>{p.material}<small className={p.contabiliza_meta ? "texto-bloco" : "texto-bloco aviso-auditoria"}>{p.contabiliza_meta ? `Meta ${p.tipo_meta === "geral" ? "geral" : "do material"}` : "Fora da meta · pagamento imediato"}</small></td><td>{p.cooperativa ?? "—"}<small className="texto-bloco">{p.ponto_apoio}</small></td><td><strong>{Number(p.peso_total).toLocaleString("pt-BR")} kg</strong>{valorLiberado ? <small className="texto-bloco valor-verde">{Number(p.valor_total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</small> : <small className="texto-bloco aviso-auditoria">Valor sujeito à meta</small>}{p.contabiliza_meta && <BarraMetaRelatorio percentual={Number(p.percentual_meta)} meta={Number(p.meta_diaria)} />}</td><td><span className={`status-pesagem ${p.excluida_em ? "excluida" : p.status}`}>{p.excluida_em ? "Excluída" : rotulosStatus[p.status]}</span><small className="texto-bloco">Caixa {p.status_caixa ?? "não aberto"}</small>{p.historico.some((evento) => evento.acao === "alteracao") && <small className="texto-bloco aviso-auditoria">Registro alterado</small>}{p.excluida_em && <small className="texto-bloco">{p.motivo_exclusao}</small>}</td><td><div className="acoes-tabela"><button type="button" onClick={() => setHistoricoAberto(p)} aria-label={`Ver histórico de ${p.codigo}`} title="Histórico"><History /></button><button type="button" onClick={() => abrirEdicao(p)} disabled={Boolean(p.excluida_em)} aria-label={`Editar ${p.codigo}`} title="Editar"><Pencil /></button><button type="button" className="perigoso" onClick={() => { setExcluindo(p); setMotivoExclusao(""); }} disabled={Boolean(p.excluida_em)} aria-label={`Excluir ${p.codigo}`} title="Excluir"><Trash2 /></button></div></td></tr>; })}</tbody></table>{pesagens.length === 0 && <p className="estado-vazio">Nenhuma pesagem encontrada.</p>}</div>
    <Paginacao pagina={pagina} total={total} itensPorPagina={itensPorPagina} aoMudarPagina={setPagina} aoMudarQuantidade={(quantidade) => { setItensPorPagina(quantidade); setPagina(1); }} opcoesQuantidade={[5, 10, 20, 50]} rotulo="pesagens" />

    {editando && <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-editar-pesagem"><div className="modal cadastro"><header className="cabecalho-modal"><div><span>CORREÇÃO AUDITÁVEL</span><h2 id="titulo-editar-pesagem">Editar {editando.codigo}</h2><p>O valor anterior e o novo serão preservados no histórico.</p></div><button type="button" onClick={() => setEditando(null)} aria-label="Fechar"><X /></button></header><form className="formulario" onSubmit={(e) => e.preventDefault()}><div className="grade-formulario"><label className="campo campo-largo">Cooperativa / associação<select value={formulario.cooperativaUuid} onChange={(e) => setFormulario((f) => ({ ...f, cooperativaUuid: e.target.value }))}>{cooperativas.map((co) => <option key={co.uuid} value={co.uuid}>{co.nome}</option>)}</select></label><label className="campo campo-largo">Catador<select value={formulario.catadorUuid} onChange={(e) => setFormulario((f) => ({ ...f, catadorUuid: e.target.value }))}>{catadores.map((c) => <option key={c.uuid} value={c.uuid}>{c.codigo} — {c.nome_completo}</option>)}</select></label><label className="campo">Central / ponto<select value={formulario.pontoApoioUuid} onChange={(e) => setFormulario((f) => ({ ...f, pontoApoioUuid: e.target.value }))}>{pontos.map((p) => <option key={p.uuid} value={p.uuid}>{p.nome}</option>)}</select></label><label className="campo">Responsável<select value={formulario.responsavelUuid} onChange={(e) => setFormulario((f) => ({ ...f, responsavelUuid: e.target.value }))}>{responsaveis.map((r) => <option key={r.uuid} value={r.uuid}>{r.nome}</option>)}<option value="outro">Outro</option></select></label>{formulario.responsavelUuid === "outro" && <label className="campo campo-largo">Nome do responsável<input value={formulario.responsavelOutro} onChange={(e) => setFormulario((f) => ({ ...f, responsavelOutro: e.target.value }))} /></label>}<label className="campo">Material<select value={formulario.materialUuid} onChange={(e) => { const selecionado = materiais.find((m) => m.uuid === e.target.value); setFormulario((f) => ({ ...f, materialUuid: e.target.value, contabilizarNaMeta: Boolean(selecionado?.contabiliza_meta) })); }}>{materiais.map((m) => <option key={m.uuid} value={m.uuid}>{m.nome}</option>)}</select></label><label className="campo">Peso<input inputMode="decimal" value={formulario.peso} onChange={(e) => setFormulario((f) => ({ ...f, peso: e.target.value }))} /></label><label className="campo">Data e hora<input type="datetime-local" value={formulario.dataHora} onChange={(e) => setFormulario((f) => ({ ...f, dataHora: e.target.value }))} /></label><label className="campo">Status<select value={formulario.status} onChange={(e) => setFormulario((f) => ({ ...f, status: e.target.value as StatusPesagem }))}><option value="concluida">Concluída</option><option value="agendada">Agendada</option><option value="cancelada">Cancelada</option></select></label><label className="interruptor campo-largo opcao-meta-pesagem"><input type="checkbox" disabled={!materiais.find((m) => m.uuid === formulario.materialUuid)?.contabiliza_meta} checked={formulario.contabilizarNaMeta} onChange={(e) => setFormulario((f) => ({ ...f, contabilizarNaMeta: e.target.checked }))} /><span /><div><strong>Contabilizar esta entrega na meta</strong><small>{materiais.find((m) => m.uuid === formulario.materialUuid)?.contabiliza_meta ? "Desmarque para corrigir como pagamento imediato fora da meta." : "Este material não pode compor metas."}</small></div></label><label className="campo campo-largo">Observação <small>Opcional</small><textarea value={formulario.observacao} onChange={(e) => setFormulario((f) => ({ ...f, observacao: e.target.value }))} /></label><label className="campo campo-largo">Motivo da alteração<textarea required value={formulario.motivoAlteracao} onChange={(e) => setFormulario((f) => ({ ...f, motivoAlteracao: e.target.value }))} placeholder="Ex.: peso digitado incorretamente" /></label></div></form><footer className="rodape-modal"><button type="button" className="botao-secundario" onClick={() => setEditando(null)}>Cancelar</button><button type="button" className="botao-primario" onClick={() => void salvarEdicao()} disabled={salvando}>{salvando ? "Salvando..." : "Salvar correção"}</button></footer></div></div>}

    {excluindo && <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-excluir-pesagem"><div className="modal pequeno"><header className="cabecalho-modal"><div><span>EXCLUSÃO AUDITÁVEL</span><h2 id="titulo-excluir-pesagem">Excluir {excluindo.codigo}?</h2><p>O registro continuará no relatório, marcado como excluído.</p></div><button type="button" onClick={() => setExcluindo(null)} aria-label="Fechar"><X /></button></header><label className="campo">Motivo da exclusão<textarea value={motivoExclusao} onChange={(e) => setMotivoExclusao(e.target.value)} placeholder="Descreva o erro encontrado" /></label><footer className="rodape-modal"><button type="button" className="botao-secundario" onClick={() => setExcluindo(null)}>Cancelar</button><button type="button" className="botao-perigo" onClick={() => void confirmarExclusao()} disabled={salvando}>{salvando ? "Excluindo..." : "Confirmar exclusão"}</button></footer></div></div>}

    {historicoAberto && <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-historico"><div className="modal pequeno"><header className="cabecalho-modal"><div><span>AUDITORIA</span><h2 id="titulo-historico">Histórico de {historicoAberto.codigo}</h2><p>{historicoAberto.historico.length} ocorrência(s) preservada(s).</p></div><button type="button" onClick={() => setHistoricoAberto(null)} aria-label="Fechar"><X /></button></header><div className="linha-tempo-auditoria">{historicoAberto.historico.map((evento) => { const alteracoes = alteracoesEvento(evento); return <article key={evento.uuid}><span /><div><strong>{evento.acao === "criacao" ? "Registro criado" : evento.acao === "alteracao" ? "Dados alterados" : "Registro excluído"}</strong><small>{new Date(evento.criado_em).toLocaleString("pt-BR")}</small>{evento.dados.motivo && <p>Motivo: {evento.dados.motivo}</p>}{alteracoes.length > 0 && <ul className="lista-alteracoes-auditoria">{alteracoes.map((item) => <li key={item}>{item}</li>)}</ul>}</div></article>; })}</div><footer className="rodape-modal"><button type="button" className="botao-secundario" onClick={() => setHistoricoAberto(null)}>Fechar</button></footer></div></div>}
  </section>;
}

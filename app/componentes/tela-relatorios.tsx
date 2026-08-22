"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, History, Pencil, Search, Trash2, X } from "lucide-react";
import { requisitarApi, type CatadorApi, type CooperativaApi, type MaterialApi } from "@/app/dados/api";

type Referencia = { uuid: string; nome: string };
type StatusPesagem = "concluida" | "agendada" | "cancelada";
type EventoAuditoria = { uuid: string; acao: "criacao" | "alteracao" | "exclusao_logica"; dados: { motivo?: string }; criado_em: string };
type PesagemApi = {
  uuid: string; codigo: string; criado_em: string; data_hora: string; atualizado_em: string; peso_total: number; valor_total: number;
  status: StatusPesagem; observacao: string | null; excluida_em: string | null; motivo_exclusao: string | null;
  catador_uuid: string; codigo_catador: string; catador: string; material_uuid: string; material: string;
  cooperativa_uuid: string; cooperativa: string | null; meta_diaria: number; percentual_meta: number; status_caixa: "aberto" | "fechado" | null;
  ponto_apoio_uuid: string; ponto_apoio: string; responsavel_pesagem_uuid: string | null; responsavel_outro: string | null; responsavel: string;
  historico: EventoAuditoria[];
};

const rotulosStatus: Record<StatusPesagem, string> = { concluida: "Concluída", agendada: "Agendada", cancelada: "Cancelada" };
function paraDataHoraLocal(valor: string) { const data = new Date(valor); return new Date(data.getTime() - data.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
function BarraMetaRelatorio({ percentual, meta }: { percentual: number; meta: number }) { return <div className="barra-meta-compacta"><div><i style={{ width: `${Math.min(Math.max(percentual, 0), 100)}%` }} /></div><small>Meta {meta.toLocaleString("pt-BR")} kg · {Math.round(percentual)}%</small></div>; }

export function TelaRelatorios() {
  const [pesagens, setPesagens] = useState<PesagemApi[]>([]);
  const [catadores, setCatadores] = useState<CatadorApi[]>([]);
  const [materiais, setMateriais] = useState<MaterialApi[]>([]);
  const [cooperativas, setCooperativas] = useState<CooperativaApi[]>([]);
  const [pontos, setPontos] = useState<Referencia[]>([]);
  const [responsaveis, setResponsaveis] = useState<Referencia[]>([]);
  const [busca, setBusca] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<PesagemApi | null>(null);
  const [excluindo, setExcluindo] = useState<PesagemApi | null>(null);
  const [historicoAberto, setHistoricoAberto] = useState<PesagemApi | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [motivoExclusao, setMotivoExclusao] = useState("");
  const [formulario, setFormulario] = useState({ catadorUuid: "", cooperativaUuid: "", pontoApoioUuid: "", responsavelUuid: "", responsavelOutro: "", materialUuid: "", peso: "", dataHora: "", status: "concluida" as StatusPesagem, observacao: "", motivoAlteracao: "" });

  const carregar = useCallback(async () => {
    try {
      const consulta = new URLSearchParams({ limite: "200" });
      if (inicio) consulta.set("inicio", inicio);
      if (fim) consulta.set("fim", fim);
      const dados = await requisitarApi<{ dados: PesagemApi[] }>(`/api/relatorios/pesagens?${consulta}`);
      setPesagens(dados.dados);
      setErro("");
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível carregar os relatórios.");
    }
  }, [fim, inicio]);

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

  const filtradas = useMemo(() => pesagens.filter((item) => `${item.catador} ${item.codigo_catador} ${item.codigo} ${item.material} ${item.status}`.toLowerCase().includes(busca.toLowerCase())), [busca, pesagens]);
  const contabilizadas = filtradas.filter((item) => !item.excluida_em && item.status === "concluida");
  const totais = useMemo(() => contabilizadas.reduce((acc, item) => ({ peso: acc.peso + Number(item.peso_total), valor: acc.valor + Number(item.valor_total) }), { peso: 0, valor: 0 }), [contabilizadas]);

  function abrirEdicao(item: PesagemApi) {
    setEditando(item);
    setFormulario({ catadorUuid: item.catador_uuid, cooperativaUuid: item.cooperativa_uuid, pontoApoioUuid: item.ponto_apoio_uuid, responsavelUuid: item.responsavel_pesagem_uuid ?? "outro", responsavelOutro: item.responsavel_outro ?? "", materialUuid: item.material_uuid, peso: String(item.peso_total), dataHora: paraDataHoraLocal(item.data_hora), status: item.status, observacao: item.observacao ?? "", motivoAlteracao: "" });
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
    const linhas = [["Código", "Data e hora", "Código catador", "Catador", "Material", "Ponto", "Responsável", "Peso", "Valor", "Status", "Excluída", "Motivo exclusão"], ...filtradas.map((p) => [p.codigo, new Date(p.data_hora).toLocaleString("pt-BR"), p.codigo_catador, p.catador, p.material, p.ponto_apoio, p.responsavel, String(p.peso_total), String(p.valor_total), rotulosStatus[p.status], p.excluida_em ? "Sim" : "Não", p.motivo_exclusao ?? ""])];
    const csv = linhas.map((linha) => linha.map((campo) => `"${String(campo).replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "relatorio-pesagens.csv"; link.click(); URL.revokeObjectURL(url);
  }

  return <section className="pagina-interna">
    <div className="resumo-pagina"><div><h2>Produção, pagamentos e auditoria</h2><p>Registros ativos, alterados e excluídos logicamente.</p></div><button type="button" className="botao-secundario" onClick={exportar} disabled={filtradas.length === 0}><Download /> Exportar relatório</button></div>
    {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
    <div className="grade-resumo-relatorio"><article><span>KG</span><div><small>Peso concluído</small><strong>{totais.peso.toLocaleString("pt-BR")} kg</strong></div></article><article><span>R$</span><div><small>Valor concluído</small><strong>{totais.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div></article><article><span>№</span><div><small>Registros no relatório</small><strong>{filtradas.length}</strong></div></article></div>
    <div className="barra-ferramentas"><label className="campo-busca"><Search /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar catador, material, código ou status..." aria-label="Buscar no relatório" /></label><input className="entrada-filtro" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} aria-label="Data inicial" /><input className="entrada-filtro" type="date" value={fim} onChange={(e) => setFim(e.target.value)} aria-label="Data final" /></div>
    <div className="tabela-responsiva"><table><thead><tr><th>Registro</th><th>Catador</th><th>Material</th><th>Cooperativa / ponto</th><th>Peso e valor</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{filtradas.map((p) => <tr key={p.uuid} className={p.excluida_em ? "registro-excluido" : ""}><td><code>{p.codigo}</code><small className="texto-bloco">{new Date(p.data_hora).toLocaleString("pt-BR")}</small></td><td><strong>{p.catador}</strong><small className="texto-bloco">{p.codigo_catador} · Por {p.responsavel}</small></td><td>{p.material}</td><td>{p.cooperativa ?? "—"}<small className="texto-bloco">{p.ponto_apoio}</small></td><td><strong>{Number(p.peso_total).toLocaleString("pt-BR")} kg</strong><small className="texto-bloco valor-verde">{Number(p.valor_total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</small><BarraMetaRelatorio percentual={Number(p.percentual_meta)} meta={Number(p.meta_diaria)} /></td><td><span className={`status-pesagem ${p.excluida_em ? "excluida" : p.status}`}>{p.excluida_em ? "Excluída" : rotulosStatus[p.status]}</span><small className="texto-bloco">Caixa {p.status_caixa ?? "não aberto"}</small>{p.historico.some((evento) => evento.acao === "alteracao") && <small className="texto-bloco aviso-auditoria">Registro alterado</small>}{p.excluida_em && <small className="texto-bloco">{p.motivo_exclusao}</small>}</td><td><div className="acoes-tabela"><button type="button" onClick={() => setHistoricoAberto(p)} aria-label={`Ver histórico de ${p.codigo}`} title="Histórico"><History /></button><button type="button" onClick={() => abrirEdicao(p)} disabled={Boolean(p.excluida_em)} aria-label={`Editar ${p.codigo}`} title="Editar"><Pencil /></button><button type="button" className="perigoso" onClick={() => { setExcluindo(p); setMotivoExclusao(""); }} disabled={Boolean(p.excluida_em)} aria-label={`Excluir ${p.codigo}`} title="Excluir"><Trash2 /></button></div></td></tr>)}</tbody></table>{filtradas.length === 0 && <p className="estado-vazio">Nenhuma pesagem encontrada.</p>}</div>

    {editando && <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-editar-pesagem"><div className="modal cadastro"><header className="cabecalho-modal"><div><span>CORREÇÃO AUDITÁVEL</span><h2 id="titulo-editar-pesagem">Editar {editando.codigo}</h2><p>O valor anterior e o novo serão preservados no histórico.</p></div><button type="button" onClick={() => setEditando(null)} aria-label="Fechar"><X /></button></header><form className="formulario" onSubmit={(e) => e.preventDefault()}><div className="grade-formulario"><label className="campo campo-largo">Cooperativa / associação<select value={formulario.cooperativaUuid} onChange={(e) => setFormulario((f) => ({ ...f, cooperativaUuid: e.target.value }))}>{cooperativas.map((co) => <option key={co.uuid} value={co.uuid}>{co.nome}</option>)}</select></label><label className="campo campo-largo">Catador<select value={formulario.catadorUuid} onChange={(e) => setFormulario((f) => ({ ...f, catadorUuid: e.target.value }))}>{catadores.map((c) => <option key={c.uuid} value={c.uuid}>{c.codigo} — {c.nome_completo}</option>)}</select></label><label className="campo">Central / ponto<select value={formulario.pontoApoioUuid} onChange={(e) => setFormulario((f) => ({ ...f, pontoApoioUuid: e.target.value }))}>{pontos.map((p) => <option key={p.uuid} value={p.uuid}>{p.nome}</option>)}</select></label><label className="campo">Responsável<select value={formulario.responsavelUuid} onChange={(e) => setFormulario((f) => ({ ...f, responsavelUuid: e.target.value }))}>{responsaveis.map((r) => <option key={r.uuid} value={r.uuid}>{r.nome}</option>)}<option value="outro">Outro</option></select></label>{formulario.responsavelUuid === "outro" && <label className="campo campo-largo">Nome do responsável<input value={formulario.responsavelOutro} onChange={(e) => setFormulario((f) => ({ ...f, responsavelOutro: e.target.value }))} /></label>}<label className="campo">Material<select value={formulario.materialUuid} onChange={(e) => setFormulario((f) => ({ ...f, materialUuid: e.target.value }))}>{materiais.map((m) => <option key={m.uuid} value={m.uuid}>{m.nome}</option>)}</select></label><label className="campo">Peso<input inputMode="decimal" value={formulario.peso} onChange={(e) => setFormulario((f) => ({ ...f, peso: e.target.value }))} /></label><label className="campo">Data e hora<input type="datetime-local" value={formulario.dataHora} onChange={(e) => setFormulario((f) => ({ ...f, dataHora: e.target.value }))} /></label><label className="campo">Status<select value={formulario.status} onChange={(e) => setFormulario((f) => ({ ...f, status: e.target.value as StatusPesagem }))}><option value="concluida">Concluída</option><option value="agendada">Agendada</option><option value="cancelada">Cancelada</option></select></label><label className="campo campo-largo">Observação <small>Opcional</small><textarea value={formulario.observacao} onChange={(e) => setFormulario((f) => ({ ...f, observacao: e.target.value }))} /></label><label className="campo campo-largo">Motivo da alteração<textarea required value={formulario.motivoAlteracao} onChange={(e) => setFormulario((f) => ({ ...f, motivoAlteracao: e.target.value }))} placeholder="Ex.: peso digitado incorretamente" /></label></div></form><footer className="rodape-modal"><button type="button" className="botao-secundario" onClick={() => setEditando(null)}>Cancelar</button><button type="button" className="botao-primario" onClick={() => void salvarEdicao()} disabled={salvando}>{salvando ? "Salvando..." : "Salvar correção"}</button></footer></div></div>}

    {excluindo && <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-excluir-pesagem"><div className="modal pequeno"><header className="cabecalho-modal"><div><span>EXCLUSÃO AUDITÁVEL</span><h2 id="titulo-excluir-pesagem">Excluir {excluindo.codigo}?</h2><p>O registro continuará no relatório, marcado como excluído.</p></div><button type="button" onClick={() => setExcluindo(null)} aria-label="Fechar"><X /></button></header><label className="campo">Motivo da exclusão<textarea value={motivoExclusao} onChange={(e) => setMotivoExclusao(e.target.value)} placeholder="Descreva o erro encontrado" /></label><footer className="rodape-modal"><button type="button" className="botao-secundario" onClick={() => setExcluindo(null)}>Cancelar</button><button type="button" className="botao-perigo" onClick={() => void confirmarExclusao()} disabled={salvando}>{salvando ? "Excluindo..." : "Confirmar exclusão"}</button></footer></div></div>}

    {historicoAberto && <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-historico"><div className="modal pequeno"><header className="cabecalho-modal"><div><span>AUDITORIA</span><h2 id="titulo-historico">Histórico de {historicoAberto.codigo}</h2><p>{historicoAberto.historico.length} ocorrência(s) preservada(s).</p></div><button type="button" onClick={() => setHistoricoAberto(null)} aria-label="Fechar"><X /></button></header><div className="linha-tempo-auditoria">{historicoAberto.historico.map((evento) => <article key={evento.uuid}><span /><div><strong>{evento.acao === "criacao" ? "Registro criado" : evento.acao === "alteracao" ? "Dados alterados" : "Registro excluído"}</strong><small>{new Date(evento.criado_em).toLocaleString("pt-BR")}</small>{evento.dados.motivo && <p>Motivo: {evento.dados.motivo}</p>}</div></article>)}</div><footer className="rodape-modal"><button type="button" className="botao-secundario" onClick={() => setHistoricoAberto(null)}>Fechar</button></footer></div></div>}
  </section>;
}

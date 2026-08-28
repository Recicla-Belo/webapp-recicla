"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, LockKeyhole, Search, ShieldCheck, X } from "lucide-react";
import { baixarArquivoApi, requisitarApi, type CooperativaApi, type MaterialApi } from "@/app/dados/api";
import { Paginacao } from "@/app/componentes/paginacao";
import { useTermoBusca } from "@/app/utilitarios/use-termo-busca";

type AbaRelatorio = "resumo" | "pesagens" | "auditoria";
type StatusPesagem = "concluida" | "agendada" | "cancelada";
type EventoAuditoriaPesagem = { uuid: string; acao: string; dados: Record<string, unknown>; criado_em: string; usuario: string | null; email: string | null; endereco_ip: string | null };
type PesagemRelatorio = {
  uuid: string; codigo: string; criado_em: string; data_hora: string; confirmada_em: string | null; atualizado_em: string; peso_total: number; valor_total: number;
  status: StatusPesagem; observacao: string | null; excluida_em: string | null; motivo_exclusao: string | null;
  catador_uuid: string; codigo_catador: string; catador: string; cpf_catador: string | null; contatos_catador: string | null;
  material_uuid: string; material: string; tipo_material: string; unidade: string; quantidade_referencia: number; valor_referencia: number;
  cooperativa_uuid: string; cooperativa: string | null; ponto_apoio: string; responsavel: string; criado_por: string | null; criado_por_email: string | null; excluido_por: string | null; excluido_por_email: string | null;
  meta_diaria: number; percentual_meta: number; tipo_meta: "geral" | "material" | "fora_meta"; contabiliza_meta: boolean; guardar_excedente_meta: boolean; valor_bruto: number; status_caixa: "aberto" | "fechado" | null;
  peso_meta_aplicado: number; peso_excedente_pago: number; peso_excedente_credito: number; valor_premio_meta: number; valor_excedente_material: number;
  historico: EventoAuditoriaPesagem[];
};
type ResumoDiario = { data_operacao: string; total_coletado: number; valor_total_pagar: number; media_por_catador: number; coletas_realizadas: number; catadores_atendidos: number; catadores_meta_atingida: number };
type EventoAuditoria = { uuid: string; acao: string; entidade: string; entidade_uuid: string | null; dados: Record<string, unknown>; endereco_ip: string | null; criado_em: string; usuario: string | null; usuario_email: string | null };
type OpcaoCampo = { chave: string; rotulo: string };

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
const inicioMes = () => `${hoje().slice(0, 8)}01`;
const dinheiro = (valor: number) => Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numero = (valor: number, casas = 3) => Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: casas });
const rotulosStatus: Record<StatusPesagem, string> = { concluida: "Concluída", agendada: "Agendada", cancelada: "Cancelada" };
const criarCampos = (itens: string[][]) => itens.map(([chave, rotulo]) => ({ chave, rotulo }));
const camposExportacao: Record<AbaRelatorio, OpcaoCampo[]> = {
  resumo: criarCampos([["data_operacao", "Data"], ["total_coletado", "Total coletado"], ["valor_total_pagar", "Valor total a pagar"], ["media_por_catador", "Média por catador"], ["coletas_realizadas", "Coletas realizadas"], ["catadores_atendidos", "Catadores atendidos"], ["catadores_meta_atingida", "Catadores que bateram meta"]]),
  pesagens: criarCampos([
    ["protocolo", "Protocolo UUID"], ["codigo", "Código da pesagem"], ["data_hora", "Data e hora"], ["criado_em", "Registrada em"], ["atualizado_em", "Última atualização"],
    ["codigo_catador", "Código do catador"], ["catador", "Catador"], ["cpf_catador", "CPF"], ["contatos_catador", "Contatos"], ["cooperativa", "Cooperativa"], ["ponto_apoio", "Central / ponto"], ["responsavel", "Responsável"],
    ["material", "Material"], ["tipo_material", "Tipo de material"], ["unidade", "Unidade"], ["peso_total", "Peso"], ["quantidade_referencia", "Quantidade de referência"], ["valor_referencia", "Valor de referência"], ["valor_bruto", "Valor bruto"], ["valor_total", "Valor liberado"],
    ["regra_meta", "Regra da meta"], ["meta_diaria", "Meta diária"], ["peso_meta_aplicado", "Peso aplicado na meta"], ["peso_excedente_pago", "Excedente pago"], ["peso_excedente_credito", "Excedente guardado"], ["valor_premio_meta", "Prêmio da meta"], ["valor_excedente_material", "Valor do excedente"],
    ["status", "Status"], ["status_caixa", "Status do caixa"], ["observacao", "Observação"], ["criada_por", "Registrada por"], ["excluida_em", "Excluída em"], ["excluido_por", "Excluída por"], ["motivo_exclusao", "Motivo da exclusão"], ["historico", "Histórico completo de auditoria"],
  ]),
  auditoria: criarCampos([["protocolo", "Protocolo UUID"], ["criado_em", "Data e hora"], ["usuario", "Usuário"], ["usuario_email", "E-mail do usuário"], ["acao", "Ação"], ["entidade", "Entidade"], ["entidade_uuid", "UUID da entidade"], ["endereco_ip", "Endereço IP"], ["dados", "Dados completos do evento"]]),
};

export function TelaRelatorios() {
  const [aba, setAba] = useState<AbaRelatorio>("resumo");
  const [inicio, setInicio] = useState(inicioMes);
  const [fim, setFim] = useState(hoje);
  const [busca, setBusca] = useState("");
  const [materialUuid, setMaterialUuid] = useState("");
  const [cooperativaUuid, setCooperativaUuid] = useState("");
  const [status, setStatus] = useState("");
  const [entidade, setEntidade] = useState("");
  const [acao, setAcao] = useState("");
  const [pagina, setPagina] = useState(1);
  const [itensPorPagina, setItensPorPagina] = useState(10);
  const [total, setTotal] = useState(0);
  const [pesagens, setPesagens] = useState<PesagemRelatorio[]>([]);
  const [resumos, setResumos] = useState<ResumoDiario[]>([]);
  const [auditorias, setAuditorias] = useState<EventoAuditoria[]>([]);
  const [totais, setTotais] = useState({ peso: 0, valor: 0, catadores: 0, coletas: 0, media: 0 });
  const [materiais, setMateriais] = useState<MaterialApi[]>([]);
  const [cooperativas, setCooperativas] = useState<CooperativaApi[]>([]);
  const [opcoesAuditoria, setOpcoesAuditoria] = useState({ entidades: [] as string[], acoes: [] as string[] });
  const [detalhePesagem, setDetalhePesagem] = useState<PesagemRelatorio | null>(null);
  const [detalheAuditoria, setDetalheAuditoria] = useState<EventoAuditoria | null>(null);
  const [exportacaoAberta, setExportacaoAberta] = useState(false);
  const [camposSelecionados, setCamposSelecionados] = useState<string[]>(camposExportacao.resumo.map((campo) => campo.chave));
  const [exportando, setExportando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const termoBusca = useTermoBusca(busca);

  useEffect(() => {
    void Promise.all([
      requisitarApi<{ dados: MaterialApi[] }>("/api/materiais"),
      requisitarApi<{ dados: CooperativaApi[] }>("/api/cooperativas"),
    ]).then(([m, c]) => { setMateriais(m.dados); setCooperativas(c.dados); }).catch(() => undefined);
  }, []);

  const parametros = useMemo(() => {
    const consulta = new URLSearchParams({ limite: String(itensPorPagina), deslocamento: String((pagina - 1) * itensPorPagina) });
    if (inicio) consulta.set("inicio", inicio);
    if (fim) consulta.set("fim", fim);
    if (termoBusca) consulta.set("busca", termoBusca);
    if (aba === "pesagens") {
      if (materialUuid) consulta.set("materialUuid", materialUuid);
      if (cooperativaUuid) consulta.set("cooperativaUuid", cooperativaUuid);
      if (status) consulta.set("status", status);
    }
    if (aba === "auditoria") {
      if (entidade) consulta.set("entidade", entidade);
      if (acao) consulta.set("acao", acao);
    }
    return consulta;
  }, [aba, acao, cooperativaUuid, entidade, fim, inicio, itensPorPagina, materialUuid, pagina, status, termoBusca]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      if (aba === "pesagens") {
        const resposta = await requisitarApi<{ dados: PesagemRelatorio[]; total: number; totais: typeof totais }>(`/api/relatorios/pesagens?${parametros}`);
        setPesagens(resposta.dados); setTotal(resposta.total);
        setTotais({ peso: Number(resposta.totais.peso), valor: Number(resposta.totais.valor), catadores: Number(resposta.totais.catadores), coletas: Number(resposta.totais.coletas), media: Number(resposta.totais.media) });
      } else if (aba === "resumo") {
        const resposta = await requisitarApi<{ dados: ResumoDiario[]; total: number }>(`/api/relatorios/resumo-diario?${parametros}`);
        setResumos(resposta.dados); setTotal(resposta.total);
      } else {
        const resposta = await requisitarApi<{ dados: EventoAuditoria[]; total: number; opcoes: { entidades: string[]; acoes: string[] } }>(`/api/relatorios/auditoria?${parametros}`);
        setAuditorias(resposta.dados); setTotal(resposta.total); setOpcoesAuditoria(resposta.opcoes);
      }
      setErro("");
    } catch (falha) { setErro(falha instanceof Error ? falha.message : "Não foi possível carregar os relatórios."); }
    finally { setCarregando(false); }
  }, [aba, parametros]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza a página e os filtros com o relatório persistido
  useEffect(() => { void carregar(); }, [carregar]);

  function mudarAba(novaAba: AbaRelatorio) {
    setAba(novaAba); setPagina(1); setBusca(""); setCamposSelecionados(camposExportacao[novaAba].map((campo) => campo.chave));
  }
  async function exportar() {
    if (!inicio || !fim) return setErro("Informe a data inicial e final para exportar com segurança.");
    if (!camposSelecionados.length) return setErro("Selecione pelo menos uma informação para exportar.");
    const consulta = new URLSearchParams({ tipo: aba, inicio, fim, campos: camposSelecionados.join(",") });
    if (termoBusca) consulta.set("busca", termoBusca);
    if (materialUuid) consulta.set("materialUuid", materialUuid);
    if (cooperativaUuid) consulta.set("cooperativaUuid", cooperativaUuid);
    if (status) consulta.set("status", status);
    if (entidade) consulta.set("entidade", entidade);
    if (acao) consulta.set("acao", acao);
    setExportando(true); setErro("");
    try {
      const { arquivo, nome } = await baixarArquivoApi(`/api/relatorios/exportar?${consulta}`);
      const url = URL.createObjectURL(arquivo); const link = document.createElement("a"); link.href = url; link.download = nome; link.click(); URL.revokeObjectURL(url); setExportacaoAberta(false);
    } catch (falha) { setErro(falha instanceof Error ? falha.message : "Não foi possível exportar o relatório."); }
    finally { setExportando(false); }
  }

  return <section className="pagina-interna pagina-relatorios">
    <div className="resumo-pagina"><div><h2>Relatórios e auditoria</h2><p>Histórico completo, somente leitura e reproduzível diretamente do PostgreSQL.</p></div><button type="button" className="botao-secundario" onClick={() => { setCamposSelecionados(camposExportacao[aba].map((campo) => campo.chave)); setExportacaoAberta(true); setErro(""); }}><Download /> Exportar informações</button></div>
    <div className="aviso-relatorio-imutavel"><ShieldCheck /><div><strong>Registros protegidos</strong><p>Nada pode ser alterado nesta página. Correções operacionais geram novos eventos e preservam os valores anteriores no livro de auditoria.</p></div></div>
    <nav className="abas-relatorios" aria-label="Tipos de relatório">{(["resumo", "pesagens", "auditoria"] as AbaRelatorio[]).map((item) => <button type="button" className={aba === item ? "ativo" : ""} onClick={() => mudarAba(item)} key={item}>{item === "resumo" ? "Resumo diário" : item === "pesagens" ? "Pesagens detalhadas" : "Livro de auditoria"}</button>)}</nav>
    {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
    {aba === "pesagens" && <div className="grade-resumo-relatorio grade-resumo-completa"><article><span>KG</span><div><small>Peso no período</small><strong>{numero(totais.peso)} kg</strong></div></article><article><span>R$</span><div><small>Valor liberado</small><strong>{dinheiro(totais.valor)}</strong></div></article><article><span>№</span><div><small>Coletas concluídas</small><strong>{totais.coletas}</strong></div></article><article><span>CT</span><div><small>Catadores atendidos</small><strong>{totais.catadores}</strong></div></article><article><span>Ø</span><div><small>Média por catador</small><strong>{numero(totais.media)} kg</strong></div></article></div>}
    <div className="barra-ferramentas filtros-relatorios">
      {aba !== "resumo" && <label className="campo-busca"><Search /><input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} placeholder={aba === "pesagens" ? "Buscar catador, material, código ou status..." : "Buscar usuário, ação, entidade ou protocolo..."} aria-label="Buscar no relatório" /></label>}
      <label className="filtro-com-rotulo"><span>De</span><input className="entrada-filtro" type="date" value={inicio} onChange={(e) => { setInicio(e.target.value); setPagina(1); }} /></label>
      <label className="filtro-com-rotulo"><span>Até</span><input className="entrada-filtro" type="date" value={fim} onChange={(e) => { setFim(e.target.value); setPagina(1); }} /></label>
      {aba === "pesagens" && <>
        <select className="entrada-filtro" value={materialUuid} onChange={(e) => { setMaterialUuid(e.target.value); setPagina(1); }} aria-label="Filtrar material"><option value="">Todos os materiais</option>{materiais.map((m) => <option value={m.uuid} key={m.uuid}>{m.nome}</option>)}</select>
        <select className="entrada-filtro" value={cooperativaUuid} onChange={(e) => { setCooperativaUuid(e.target.value); setPagina(1); }} aria-label="Filtrar cooperativa"><option value="">Todas as cooperativas</option>{cooperativas.map((c) => <option value={c.uuid} key={c.uuid}>{c.nome}</option>)}</select>
        <select className="entrada-filtro" value={status} onChange={(e) => { setStatus(e.target.value); setPagina(1); }} aria-label="Filtrar status"><option value="">Todos os status</option><option value="concluida">Concluída</option><option value="agendada">Agendada</option><option value="cancelada">Cancelada</option><option value="excluida">Excluída</option></select>
      </>}
      {aba === "auditoria" && <>
        <select className="entrada-filtro" value={entidade} onChange={(e) => { setEntidade(e.target.value); setPagina(1); }} aria-label="Filtrar entidade"><option value="">Todas as entidades</option>{opcoesAuditoria.entidades.map((item) => <option value={item} key={item}>{item.replaceAll("_", " ")}</option>)}</select>
        <select className="entrada-filtro" value={acao} onChange={(e) => { setAcao(e.target.value); setPagina(1); }} aria-label="Filtrar ação"><option value="">Todas as ações</option>{opcoesAuditoria.acoes.map((item) => <option value={item} key={item}>{item.replaceAll("_", " ")}</option>)}</select>
      </>}
    </div>
    {carregando ? <div className="painel estado-pagina" role="status">Carregando relatório...</div> : <>
      {aba === "resumo" && <TabelaResumo dados={resumos} />}
      {aba === "pesagens" && <TabelaPesagens dados={pesagens} aoDetalhar={setDetalhePesagem} />}
      {aba === "auditoria" && <TabelaAuditoria dados={auditorias} aoDetalhar={setDetalheAuditoria} />}
      <Paginacao pagina={pagina} total={total} itensPorPagina={itensPorPagina} aoMudarPagina={setPagina} aoMudarQuantidade={(quantidade) => { setItensPorPagina(quantidade); setPagina(1); }} opcoesQuantidade={[5, 10, 20, 50]} rotulo={aba === "resumo" ? "dias" : aba === "pesagens" ? "pesagens" : "eventos"} />
    </>}
    {detalhePesagem && <ModalPesagem pesagem={detalhePesagem} aoFechar={() => setDetalhePesagem(null)} />}
    {detalheAuditoria && <ModalAuditoria evento={detalheAuditoria} aoFechar={() => setDetalheAuditoria(null)} />}
    {exportacaoAberta && <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-exportacao"><div className="modal exportacao-relatorio"><header className="cabecalho-modal"><div><span>EXPORTAÇÃO SEGURA</span><h2 id="titulo-exportacao">Escolha as informações</h2><p>Serão exportados todos os registros filtrados do período, não apenas esta página.</p></div><button type="button" onClick={() => setExportacaoAberta(false)} aria-label="Fechar"><X /></button></header><div className="corpo-exportacao"><div className="acoes-selecao-campos"><button type="button" onClick={() => setCamposSelecionados(camposExportacao[aba].map((campo) => campo.chave))}>Selecionar todas</button><button type="button" onClick={() => setCamposSelecionados([])}>Limpar seleção</button></div><div className="grade-campos-exportacao">{camposExportacao[aba].map((campo) => <label key={campo.chave}><input type="checkbox" checked={camposSelecionados.includes(campo.chave)} onChange={(e) => setCamposSelecionados((atuais) => e.target.checked ? [...atuais, campo.chave] : atuais.filter((item) => item !== campo.chave))} /><span>{campo.rotulo}</span></label>)}</div></div><footer className="rodape-modal"><span>{camposSelecionados.length} campo(s) selecionado(s)</span><button type="button" className="botao-secundario" onClick={() => setExportacaoAberta(false)}>Cancelar</button><button type="button" className="botao-primario" disabled={exportando || !camposSelecionados.length} onClick={() => void exportar()}>{exportando ? "Gerando..." : "Baixar CSV completo"}</button></footer></div></div>}
  </section>;
}

function TabelaResumo({ dados }: { dados: ResumoDiario[] }) {
  return <div className="tabela-responsiva"><table><thead><tr><th>Data</th><th>Total coletado</th><th>Valor a pagar</th><th>Média / catador</th><th>Coletas</th><th>Catadores</th><th>Metas batidas</th></tr></thead><tbody>{dados.map((item) => <tr key={item.data_operacao}><td><strong>{new Date(`${item.data_operacao}T12:00:00`).toLocaleDateString("pt-BR")}</strong></td><td>{numero(item.total_coletado)} kg</td><td className="valor-verde">{dinheiro(item.valor_total_pagar)}</td><td>{numero(item.media_por_catador)} kg</td><td>{item.coletas_realizadas}</td><td>{item.catadores_atendidos}</td><td>{item.catadores_meta_atingida}</td></tr>)}</tbody></table>{!dados.length && <p className="estado-vazio">Nenhuma operação concluída no período.</p>}</div>;
}

function TabelaPesagens({ dados, aoDetalhar }: { dados: PesagemRelatorio[]; aoDetalhar: (item: PesagemRelatorio) => void }) {
  return <div className="tabela-responsiva"><table><thead><tr><th>Protocolo</th><th>Catador</th><th>Material</th><th>Operação</th><th>Meta e pagamento</th><th>Situação</th><th>Detalhes</th></tr></thead><tbody>{dados.map((p) => <tr key={p.uuid} className={p.excluida_em ? "registro-excluido" : ""}><td><code>{p.codigo}</code><small className="texto-bloco">{new Date(p.data_hora).toLocaleString("pt-BR")}</small><small className="texto-bloco protocolo-curto" title={p.uuid}>{p.uuid}</small></td><td><strong>{p.catador}</strong><small className="texto-bloco">{p.codigo_catador}</small><small className="texto-bloco">{p.contatos_catador || "Sem contato"}</small></td><td><strong>{p.material}</strong><small className="texto-bloco">{p.tipo_material} · {p.unidade}</small></td><td>{p.cooperativa ?? "—"}<small className="texto-bloco">{p.ponto_apoio}</small><small className="texto-bloco">Por {p.responsavel}</small></td><td><strong>{numero(p.peso_total)} {p.unidade}</strong><small className="texto-bloco valor-verde">{dinheiro(p.valor_total)}</small><small className="texto-bloco">{p.contabiliza_meta ? `Meta ${p.tipo_meta === "geral" ? "geral" : "do material"} · ${Math.round(Number(p.percentual_meta))}%` : "Fora da meta · pagamento imediato"}</small></td><td><span className={`status-pesagem ${p.excluida_em ? "excluida" : p.status}`}>{p.excluida_em ? "Excluída" : rotulosStatus[p.status]}</span><small className="texto-bloco">Caixa {p.status_caixa ?? "não aberto"}</small>{p.historico.some((evento) => evento.acao === "alteracao") && <small className="texto-bloco aviso-auditoria">Alterada · histórico preservado</small>}</td><td><button type="button" className="menu-acoes" onClick={() => aoDetalhar(p)} aria-label={`Ver ficha completa de ${p.codigo}`} title="Ver ficha completa"><Eye /></button></td></tr>)}</tbody></table>{!dados.length && <p className="estado-vazio">Nenhuma pesagem encontrada.</p>}</div>;
}

function TabelaAuditoria({ dados, aoDetalhar }: { dados: EventoAuditoria[]; aoDetalhar: (item: EventoAuditoria) => void }) {
  return <div className="tabela-responsiva"><table><thead><tr><th>Data e protocolo</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>Origem</th><th>Detalhes</th></tr></thead><tbody>{dados.map((item) => <tr key={item.uuid}><td><strong>{new Date(item.criado_em).toLocaleString("pt-BR")}</strong><small className="texto-bloco protocolo-curto" title={item.uuid}>{item.uuid}</small></td><td>{item.usuario ?? "Usuário removido"}<small className="texto-bloco">{item.usuario_email ?? "—"}</small></td><td><span className="selo-auditoria">{item.acao.replaceAll("_", " ")}</span></td><td>{item.entidade.replaceAll("_", " ")}<small className="texto-bloco protocolo-curto">{item.entidade_uuid ?? "Sem vínculo"}</small></td><td>{item.endereco_ip ?? "Não informado"}</td><td><button type="button" className="menu-acoes" onClick={() => aoDetalhar(item)} aria-label="Ver dados completos do evento" title="Ver evento"><Eye /></button></td></tr>)}</tbody></table>{!dados.length && <p className="estado-vazio">Nenhum evento de auditoria encontrado.</p>}</div>;
}

function ModalPesagem({ pesagem, aoFechar }: { pesagem: PesagemRelatorio; aoFechar: () => void }) {
  const linhas: Array<[string, string]> = [
    ["Protocolo UUID", pesagem.uuid], ["Código", pesagem.codigo], ["Data e hora", new Date(pesagem.data_hora).toLocaleString("pt-BR")], ["Catador", `${pesagem.codigo_catador} — ${pesagem.catador}`], ["CPF", pesagem.cpf_catador ?? "Não informado"], ["Contatos", pesagem.contatos_catador ?? "Não informados"],
    ["Cooperativa / ponto", `${pesagem.cooperativa ?? "—"} · ${pesagem.ponto_apoio}`], ["Responsável", pesagem.responsavel], ["Material", `${pesagem.material} · ${pesagem.tipo_material}`], ["Peso", `${numero(pesagem.peso_total)} ${pesagem.unidade}`], ["Preço de referência", `${dinheiro(pesagem.valor_referencia)} a cada ${numero(pesagem.quantidade_referencia)} ${pesagem.unidade}`], ["Valor bruto", dinheiro(pesagem.valor_bruto)], ["Valor liberado", dinheiro(pesagem.valor_total)],
    ["Regra", pesagem.contabiliza_meta ? `Meta ${pesagem.tipo_meta === "geral" ? "geral" : "do material"}` : "Fora da meta"], ["Peso aplicado na meta", `${numero(pesagem.peso_meta_aplicado)} ${pesagem.unidade}`], ["Excedente pago / guardado", `${numero(pesagem.peso_excedente_pago)} / ${numero(pesagem.peso_excedente_credito)} ${pesagem.unidade}`], ["Prêmio / valor excedente", `${dinheiro(pesagem.valor_premio_meta)} / ${dinheiro(pesagem.valor_excedente_material)}`],
    ["Status", pesagem.excluida_em ? "Excluída" : rotulosStatus[pesagem.status]], ["Caixa", pesagem.status_caixa ?? "Não aberto"], ["Observação", pesagem.observacao ?? "Não informada"], ["Registrada por", `${pesagem.criado_por ?? "Usuário removido"}${pesagem.criado_por_email ? ` · ${pesagem.criado_por_email}` : ""}`], ["Criada / atualizada", `${new Date(pesagem.criado_em).toLocaleString("pt-BR")} / ${new Date(pesagem.atualizado_em).toLocaleString("pt-BR")}`], ["Exclusão", pesagem.excluida_em ? `${new Date(pesagem.excluida_em).toLocaleString("pt-BR")} · ${pesagem.excluido_por ?? "usuário removido"} · ${pesagem.motivo_exclusao ?? "sem motivo"}` : "Não excluída"],
  ];
  return <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-ficha-pesagem"><div className="modal cadastro"><header className="cabecalho-modal"><div><span>FICHA SOMENTE LEITURA</span><h2 id="titulo-ficha-pesagem">{pesagem.codigo}</h2><p>Informações operacionais, financeiras e de auditoria preservadas.</p></div><button type="button" onClick={aoFechar} aria-label="Fechar"><X /></button></header><div className="corpo-detalhe-relatorio"><dl className="grade-detalhes-relatorio">{linhas.map(([rotulo, valor]) => <div key={rotulo}><dt>{rotulo}</dt><dd>{valor}</dd></div>)}</dl><h3><LockKeyhole /> Histórico imutável</h3><div className="linha-tempo-auditoria">{pesagem.historico.map((evento) => <article key={evento.uuid}><span /><div><strong>{evento.acao.replaceAll("_", " ")}</strong><small>{new Date(evento.criado_em).toLocaleString("pt-BR")} · {evento.usuario ?? "usuário removido"} · IP {evento.endereco_ip ?? "não informado"}</small>{typeof evento.dados.motivo === "string" && <p>Motivo: {evento.dados.motivo}</p>}<code title={evento.uuid}>{evento.uuid}</code></div></article>)}</div></div><footer className="rodape-modal"><button type="button" className="botao-secundario" onClick={aoFechar}>Fechar</button></footer></div></div>;
}

function ModalAuditoria({ evento, aoFechar }: { evento: EventoAuditoria; aoFechar: () => void }) {
  return <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-evento-auditoria"><div className="modal pequeno"><header className="cabecalho-modal"><div><span>EVENTO IMUTÁVEL</span><h2 id="titulo-evento-auditoria">{evento.acao.replaceAll("_", " ")}</h2><p>{new Date(evento.criado_em).toLocaleString("pt-BR")}</p></div><button type="button" onClick={aoFechar} aria-label="Fechar"><X /></button></header><div className="corpo-detalhe-relatorio"><dl className="grade-detalhes-relatorio"><div><dt>Protocolo</dt><dd>{evento.uuid}</dd></div><div><dt>Usuário</dt><dd>{evento.usuario ?? "Usuário removido"} · {evento.usuario_email ?? "—"}</dd></div><div><dt>Entidade</dt><dd>{evento.entidade} · {evento.entidade_uuid ?? "sem vínculo"}</dd></div><div><dt>Endereço IP</dt><dd>{evento.endereco_ip ?? "Não informado"}</dd></div></dl><h3>Dados preservados</h3><pre className="dados-auditoria-completos">{JSON.stringify(evento.dados, null, 2)}</pre></div><footer className="rodape-modal"><button type="button" className="botao-secundario" onClick={aoFechar}>Fechar</button></footer></div></div>;
}

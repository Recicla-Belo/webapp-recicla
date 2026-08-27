"use client";

/* eslint-disable @next/next/no-img-element -- fotos privadas são servidas pela API autenticada */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Gauge, Recycle, Scale, Target, UsersRound, WalletCards, type LucideIcon } from "lucide-react";
import { requisitarApi, URL_API } from "@/app/dados/api";
import { Paginacao } from "@/app/componentes/paginacao";

type DadosAuditoria = { motivo?: string; antes?: Record<string, unknown>; depois?: Record<string, unknown> };
type AtividadeApi = {
  uuid: string; acao: string; entidade: string; criado_em: string; dados: DadosAuditoria;
  codigo: string | null; peso_total: number | null; valor_total: number | null; status: string | null;
  catador_uuid: string | null; codigo_catador: string | null; catador: string | null; tem_foto: boolean;
  contato_catador: string | null; endereco_catador: string | null; cooperativa_catador: string | null;
  material: string | null; meta_diaria: number | null; contabiliza_meta: boolean | null; cooperativa: string | null; ponto_apoio: string | null;
  responsavel: string | null; data_caixa: string | null; peso_caixa: number; valor_caixa: number;
  movimentacoes_caixa: number; motivo: string | null;
};
type DadosPainel = {
  indicadores: { catadores_ativos: number; catadores_meta_atingida: number; total_coletado: number; valor_total_pagar: number; coletas_realizadas: number; media_por_catador: number };
  producaoSemanal: Array<{ data: string; peso: number }>;
  atividades: AtividadeApi[];
  paginacaoAtividades: { pagina: number; limite: number; total: number };
};

const estadoVazio: DadosPainel = { indicadores: { catadores_ativos: 0, catadores_meta_atingida: 0, total_coletado: 0, valor_total_pagar: 0, coletas_realizadas: 0, media_por_catador: 0 }, producaoSemanal: [], atividades: [], paginacaoAtividades: { pagina: 1, limite: 5, total: 0 } };
const dinheiro = (valor: number) => Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function rotuloDia(valor: string) {
  const dataIso = String(valor).slice(0, 10);
  const data = new Date(`${dataIso}T12:00:00`);
  return Number.isNaN(data.getTime()) ? "—" : data.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
}

export function PainelPrincipal({ onNovaPesagem }: { onNovaPesagem: () => void }) {
  const [dados, setDados] = useState<DadosPainel>(estadoVazio);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [paginaAtividades, setPaginaAtividades] = useState(1);
  const [limiteAtividades, setLimiteAtividades] = useState(5);

  const carregar = useCallback(async () => {
    try { setDados(await requisitarApi<DadosPainel>(`/api/painel?paginaAtividades=${paginaAtividades}&limiteAtividades=${limiteAtividades}`)); setErro(""); }
    catch (falha) { setErro(falha instanceof Error ? falha.message : "Não foi possível carregar o painel."); }
    finally { setCarregando(false); }
  }, [limiteAtividades, paginaAtividades]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza a página de atividades com a API
  useEffect(() => { void carregar(); }, [carregar]);

  const indicadores = useMemo<Array<{ rotulo: string; valor: string; icone: LucideIcon }>>(() => [
    { rotulo: "Catadores ativos", valor: dados.indicadores.catadores_ativos.toLocaleString("pt-BR"), icone: UsersRound },
    { rotulo: "Total coletado", valor: `${dados.indicadores.total_coletado.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`, icone: Scale },
    { rotulo: "Valor total a pagar", valor: dinheiro(dados.indicadores.valor_total_pagar), icone: WalletCards },
    { rotulo: "Média por catador", valor: `${dados.indicadores.media_por_catador.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`, icone: Gauge },
    { rotulo: "Coletas realizadas", valor: dados.indicadores.coletas_realizadas.toLocaleString("pt-BR"), icone: Recycle },
    { rotulo: "Catadores que bateram meta hoje", valor: dados.indicadores.catadores_meta_atingida.toLocaleString("pt-BR"), icone: Target },
  ], [dados]);
  const maiorPeso = Math.max(...dados.producaoSemanal.map((item) => Number(item.peso)), 1);

  if (carregando) return <div className="painel estado-pagina" role="status">Carregando dados do PostgreSQL...</div>;
  if (erro) return <div className="painel estado-pagina erro-pagina" role="alert">{erro}</div>;

  return <section className="painel-principal">
    <section className="secao-indicadores sem-chamada">
      <div className="titulo-secao"><div><h2>Indicadores principais</h2><p>Dados calculados a partir dos registros do mês atual</p></div></div>
      <div className="grade-indicadores">{indicadores.map((item, indice) => <article className="cartao-indicador" key={item.rotulo}><div className={`icone-indicador cor-${indice}`}><item.icone /></div><p>{item.rotulo}</p><strong>{item.valor}</strong></article>)}</div>
    </section>
    <div className="grade-inferior">
      <section className="painel"><div className="titulo-secao"><div><h2>Produção dos últimos 7 dias</h2><p>Volume confirmado no banco de dados</p></div></div><div className="grafico" aria-label="Gráfico de produção dos últimos sete dias">{dados.producaoSemanal.map((item) => <div className="barra-grupo" key={item.data}><div className="barra" title={`${Number(item.peso).toLocaleString("pt-BR")} kg`} style={{ height: `${Math.max((Number(item.peso) / maiorPeso) * 100, Number(item.peso) > 0 ? 6 : 1)}%` }} /><span>{rotuloDia(item.data)}</span></div>)}</div></section>
      <section className="painel atividade">
        <div className="titulo-secao"><div><h2>Atividade recente</h2><p>Todas as ações auditadas, organizadas em páginas</p></div><button type="button" onClick={onNovaPesagem}>Registrar nova</button></div>
        {dados.atividades.length === 0 ? <p className="estado-vazio">Nenhuma movimentação registrada.</p> : dados.atividades.map((atividade) => <AtividadeRecente atividade={atividade} key={atividade.uuid} />)}
        <Paginacao pagina={paginaAtividades} total={dados.paginacaoAtividades.total} itensPorPagina={limiteAtividades} aoMudarPagina={setPaginaAtividades} aoMudarQuantidade={(quantidade) => { setLimiteAtividades(quantidade); setPaginaAtividades(1); }} opcoesQuantidade={[5, 10, 20]} rotulo="atividades" />
      </section>
    </div>
  </section>;
}

function AtividadeRecente({ atividade }: { atividade: AtividadeApi }) {
  const caixa = atividade.entidade === "caixas_catador";
  const alteracoes = atividade.acao === "alteracao" ? resumirAlteracoes(atividade.dados) : [];
  return <article className="linha-atividade atividade-detalhada">
    <div className="avatar-atividade">{atividade.catador_uuid && atividade.tem_foto ? <img src={`${URL_API}/api/catadores/${atividade.catador_uuid}/foto`} alt={`Foto de ${atividade.catador}`} /> : <span>{iniciais(atividade.catador || atividade.entidade)}</span>}</div>
    <div className="conteudo-atividade">
      <strong>{rotuloAtividade(atividade.acao, atividade.entidade)}{atividade.catador ? ` · ${atividade.codigo_catador} — ${atividade.catador}` : ""}</strong>
      {atividade.catador && <small className="dados-catador-atividade">{[atividade.cooperativa_catador, atividade.contato_catador, atividade.endereco_catador].filter(Boolean).join(" · ")}</small>}
      {caixa ? <small>{[
        atividade.data_caixa ? `Caixa de ${new Date(`${atividade.data_caixa}T12:00:00`).toLocaleDateString("pt-BR")}` : null,
        `${Number(atividade.peso_caixa).toLocaleString("pt-BR")} kg`, dinheiro(atividade.valor_caixa), `${atividade.movimentacoes_caixa} movimentação(ões)`,
      ].filter(Boolean).join(" · ")}</small> : <small>{[
        atividade.codigo, atividade.material, atividade.peso_total != null ? `${Number(atividade.peso_total).toLocaleString("pt-BR")} kg` : null,
        atividade.valor_total != null ? dinheiro(atividade.valor_total) : null,
        atividade.contabiliza_meta === false ? "fora da meta · pagamento imediato" : atividade.meta_diaria != null ? `meta ${Number(atividade.meta_diaria).toLocaleString("pt-BR")} kg` : null,
        atividade.cooperativa, atividade.ponto_apoio, atividade.responsavel ? `por ${atividade.responsavel}` : null,
      ].filter(Boolean).join(" · ") || "Ação administrativa registrada"}</small>}
      {alteracoes.length > 0 && <ul className="alteracoes-atividade">{alteracoes.map((item) => <li key={item}>{item}</li>)}</ul>}
      {(atividade.motivo || atividade.dados?.motivo) && <em className="motivo-atividade">Motivo: {atividade.motivo || atividade.dados.motivo}</em>}
      <time dateTime={atividade.criado_em}>{new Date(atividade.criado_em).toLocaleString("pt-BR")}</time>
    </div>
    <b className="selo-acao">{atividade.acao.replaceAll("_", " ")}</b>
  </article>;
}

function iniciais(nome: string) { return nome.split(/\s+/).slice(0, 2).map((parte) => parte[0]).join("").toUpperCase(); }

function resumirAlteracoes(dados: DadosAuditoria) {
  const antes = dados.antes ?? {};
  const depois = dados.depois ?? {};
  const pares: Array<[string, unknown, unknown, string?]> = [
    ["Peso", antes.item_peso, depois.peso, " kg"], ["Valor", antes.valor_total, depois.valorTotal],
    ["Regra da meta", antes.contabiliza_meta, depois.contabilizarNaMeta], ["Status", antes.status, depois.status], ["Data", antes.data_hora, depois.dataHora], ["Observação", antes.observacao, depois.observacao],
  ];
  return pares.filter(([, anterior, novo]) => novo !== undefined && String(anterior ?? "") !== String(novo ?? "")).map(([rotulo, anterior, novo, sufixo]) => {
    const formatar = (valor: unknown) => rotulo === "Valor" ? dinheiro(Number(valor ?? 0)) : rotulo === "Data" && valor ? new Date(String(valor)).toLocaleString("pt-BR") : `${String(valor ?? "não informado")}${sufixo ?? ""}`;
    return `${rotulo}: ${formatar(anterior)} → ${formatar(novo)}`;
  });
}

function rotuloAtividade(acao: string, entidade: string) {
  if (entidade === "caixas_catador") return acao === "fechamento" ? "Caixa individual fechado" : acao === "reabertura" ? "Caixa individual reaberto" : "Caixa individual aberto";
  if (entidade === "pesagens") return acao === "criacao" ? "Pesagem registrada" : acao === "alteracao" ? "Pesagem corrigida" : "Pesagem excluída";
  if (entidade === "catadores") return acao === "criacao" ? "Catador cadastrado" : acao === "alteracao" ? "Cadastro do catador atualizado" : acao === "exclusao_definitiva" ? "Catador e dados vinculados excluídos" : "Ação no cadastro do catador";
  if (entidade === "materiais") return acao === "criacao" ? "Material cadastrado" : "Material atualizado";
  if (entidade === "cooperativas") return acao === "criacao" ? "Cooperativa cadastrada" : "Cooperativa atualizada";
  return "Ação registrada";
}

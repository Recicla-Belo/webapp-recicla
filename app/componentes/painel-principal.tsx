"use client";

import { useEffect, useMemo, useState } from "react";
import { Gauge, Recycle, Scale, UsersRound, WalletCards, type LucideIcon } from "lucide-react";
import { requisitarApi } from "@/app/dados/api";

type DadosPainel = {
  indicadores: { catadores_ativos: number; total_coletado: number; valor_total_pagar: number; coletas_realizadas: number; media_por_catador: number };
  producaoSemanal: Array<{ data: string; peso: number }>;
  atividades: Array<{ uuid: string; codigo: string; criado_em: string; peso_total: number; valor_total: number; catador: string; material: string }>;
};

const estadoVazio: DadosPainel = { indicadores: { catadores_ativos: 0, total_coletado: 0, valor_total_pagar: 0, coletas_realizadas: 0, media_por_catador: 0 }, producaoSemanal: [], atividades: [] };

export function PainelPrincipal({ onNovaPesagem }: { onNovaPesagem: () => void }) {
  const [dados, setDados] = useState<DadosPainel>(estadoVazio);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    void requisitarApi<DadosPainel>("/api/painel")
      .then(setDados)
      .catch((falha) => setErro(falha instanceof Error ? falha.message : "Não foi possível carregar o painel."))
      .finally(() => setCarregando(false));
  }, []);

  const indicadores = useMemo<Array<{ rotulo: string; valor: string; icone: LucideIcon }>>(() => [
    { rotulo: "Catadores ativos", valor: dados.indicadores.catadores_ativos.toLocaleString("pt-BR"), icone: UsersRound },
    { rotulo: "Total coletado", valor: `${dados.indicadores.total_coletado.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`, icone: Scale },
    { rotulo: "Valor total a pagar", valor: dados.indicadores.valor_total_pagar.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), icone: WalletCards },
    { rotulo: "Média por catador", valor: `${dados.indicadores.media_por_catador.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`, icone: Gauge },
    { rotulo: "Coletas realizadas", valor: dados.indicadores.coletas_realizadas.toLocaleString("pt-BR"), icone: Recycle },
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
      <section className="painel"><div className="titulo-secao"><div><h2>Produção dos últimos 7 dias</h2><p>Volume confirmado no banco de dados</p></div></div><div className="grafico" aria-label="Gráfico de produção dos últimos sete dias">{dados.producaoSemanal.map((item) => <div className="barra-grupo" key={item.data}><div className="barra" title={`${Number(item.peso).toLocaleString("pt-BR")} kg`} style={{ height: `${Math.max((Number(item.peso) / maiorPeso) * 100, Number(item.peso) > 0 ? 6 : 1)}%` }} /><span>{new Date(`${item.data}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</span></div>)}</div></section>
      <section className="painel atividade"><div className="titulo-secao"><div><h2>Atividade recente</h2><p>Últimas pesagens confirmadas</p></div><button type="button" onClick={onNovaPesagem}>Registrar nova</button></div>{dados.atividades.length === 0 ? <p className="estado-vazio">Nenhuma pesagem registrada.</p> : dados.atividades.map((atividade) => <div className="linha-atividade" key={atividade.uuid}><span>{atividade.catador.split(/\s+/).slice(0, 2).map((parte) => parte[0]).join("").toUpperCase()}</span><div><strong>{atividade.catador}</strong><small>{atividade.material} · {Number(atividade.peso_total).toLocaleString("pt-BR")} kg</small></div><b>{Number(atividade.valor_total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b></div>)}</section>
    </div>
  </section>;
}

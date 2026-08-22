"use client";

/* eslint-disable @next/next/no-img-element -- foto autenticada fornecida pela API */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import { requisitarApi, URL_API, type CatadorApi, type CooperativaApi, type MaterialApi, type ProgressoMetaApi } from "@/app/dados/api";

type Referencia = { uuid: string; nome: string };
type StatusPesagem = "concluida" | "agendada" | "cancelada";
type CaixaDia = { status: "aberto" | "fechado"; data_caixa: string; peso: number; valor: number };
type RespostaPesagem = { codigo: string; valorTotal: number; metaAtingidaAgora: boolean; progressoMeta: { peso: number; ganho: number; metaDiaria: number; percentual: number; falta: number; atingida: boolean } | null };

function dataHoraLocalAtual() {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const rotulosStatus: Record<StatusPesagem, string> = { concluida: "Concluída", agendada: "Agendada", cancelada: "Cancelada" };
const dinheiro = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function TelaPesagem() {
  const [etapa, setEtapa] = useState(0);
  const [catadores, setCatadores] = useState<CatadorApi[]>([]);
  const [cooperativas, setCooperativas] = useState<CooperativaApi[]>([]);
  const [materiais, setMateriais] = useState<MaterialApi[]>([]);
  const [pontos, setPontos] = useState<Referencia[]>([]);
  const [responsaveis, setResponsaveis] = useState<Referencia[]>([]);
  const [cooperativaUuid, setCooperativaUuid] = useState("");
  const [pontoUuid, setPontoUuid] = useState("");
  const [responsavelUuid, setResponsavelUuid] = useState("");
  const [responsavelOutro, setResponsavelOutro] = useState("");
  const [buscaCatador, setBuscaCatador] = useState("");
  const [catadorUuid, setCatadorUuid] = useState("");
  const [materialUuid, setMaterialUuid] = useState("");
  const [metas, setMetas] = useState<ProgressoMetaApi[]>([]);
  const [caixa, setCaixa] = useState<CaixaDia | null>(null);
  const [peso, setPeso] = useState("");
  const [observacao, setObservacao] = useState("");
  const [dataHora, setDataHora] = useState(dataHoraLocalAtual);
  const [status, setStatus] = useState<StatusPesagem>("concluida");
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const [registro, setRegistro] = useState<RespostaPesagem | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    void Promise.all([
      requisitarApi<{ dados: CatadorApi[] }>("/api/catadores?limite=100"),
      requisitarApi<{ dados: CooperativaApi[] }>("/api/cooperativas"),
      requisitarApi<{ dados: MaterialApi[] }>("/api/materiais"),
      requisitarApi<{ dados: Referencia[] }>("/api/pontos-apoio"),
      requisitarApi<{ dados: Referencia[] }>("/api/responsaveis-pesagem"),
    ]).then(([c, co, m, p, r]) => {
      setCatadores(c.dados.filter((item) => item.status === "ativo"));
      setCooperativas(co.dados.filter((item) => item.status === "ativo"));
      setMateriais(m.dados.filter((item) => item.status === "ativo"));
      setPontos(p.dados); setResponsaveis(r.dados);
      setCooperativaUuid(co.dados.find((item) => item.status === "ativo")?.uuid ?? "");
      setPontoUuid(p.dados[0]?.uuid ?? "");
    }).catch((falha) => setErro(falha instanceof Error ? falha.message : "Não foi possível carregar os dados."));
  }, []);

  const carregarMetas = useCallback(async () => {
    if (!catadorUuid || !dataHora) return;
    const dados = await requisitarApi<{ metas: ProgressoMetaApi[]; caixa: CaixaDia }>(`/api/catadores/${catadorUuid}/metas?data=${dataHora.slice(0, 10)}`);
    setMetas(dados.metas); setCaixa(dados.caixa);
  }, [catadorUuid, dataHora]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza meta e caixa do catador/data selecionados
  useEffect(() => { void carregarMetas().catch((falha) => setErro(falha instanceof Error ? falha.message : "Não foi possível carregar a meta.")); }, [carregarMetas]);

  const catador = catadores.find((item) => item.uuid === catadorUuid);
  const material = materiais.find((item) => item.uuid === materialUuid);
  const cooperativa = cooperativas.find((item) => item.uuid === cooperativaUuid);
  const ponto = pontos.find((item) => item.uuid === pontoUuid);
  const metaAtual = metas.find((item) => item.material_uuid === materialUuid);
  const pesoNumero = Number(peso.replace(",", "."));
  const valor = useMemo(() => material && pesoNumero > 0 ? pesoNumero / Number(material.quantidade_referencia) * Number(material.valor_referencia) : 0, [material, pesoNumero]);
  const pesoDiaDepois = Number(metaAtual?.peso ?? 0) + (status === "concluida" ? Math.max(pesoNumero, 0) : 0);
  const metaDiaria = Number(metaAtual?.meta ?? material?.meta_diaria ?? 20);
  const percentualDepois = Math.min(metaDiaria > 0 ? (pesoDiaDepois / metaDiaria) * 100 : 0, 100);
  const faltaDepois = Math.max(metaDiaria - pesoDiaDepois, 0);
  const ganhoDiaDepois = Number(metaAtual?.ganho ?? 0) + (status === "concluida" ? valor : 0);
  const responsavelValido = responsavelUuid === "outro" ? responsavelOutro.trim().length >= 2 : Boolean(responsavelUuid);
  const dataHoraValida = Boolean(dataHora) && !Number.isNaN(new Date(dataHora).getTime());
  const caixaBloqueado = status === "concluida" && caixa?.status === "fechado";
  const catadoresFiltrados = catadores.filter((item) => `${item.codigo} ${item.nome_completo} ${item.apelido ?? ""}`.toLowerCase().includes(buscaCatador.toLowerCase())).slice(0, 8);

  async function registrar() {
    if (!catador || !material || !cooperativaUuid || !pontoUuid || !responsavelValido || pesoNumero <= 0 || !dataHoraValida || caixaBloqueado) return;
    setSalvando(true); setErro("");
    try {
      const resposta = await requisitarApi<RespostaPesagem>("/api/pesagens", { method: "POST", body: JSON.stringify({
        catadorUuid, cooperativaUuid, pontoApoioUuid: pontoUuid,
        responsavelPesagemUuid: responsavelUuid === "outro" ? undefined : responsavelUuid,
        responsavelOutro: responsavelUuid === "outro" ? responsavelOutro.trim() : undefined,
        materialUuid, peso: pesoNumero, observacao: observacao.trim() || undefined,
        dataHora: new Date(dataHora).toISOString(), status,
      }) });
      setConfirmacaoAberta(false); setRegistro(resposta);
    } catch (falha) { setErro(falha instanceof Error ? falha.message : "Não foi possível registrar a pesagem."); }
    finally { setSalvando(false); }
  }

  function reiniciar() {
    setEtapa(0); setCatadorUuid(""); setBuscaCatador(""); setMaterialUuid(""); setMetas([]); setCaixa(null);
    setPeso(""); setObservacao(""); setDataHora(dataHoraLocalAtual()); setStatus("concluida"); setRegistro(null);
  }

  if (registro) return <div className={registro.metaAtingidaAgora ? "painel sucesso-pesagem comemoracao-meta" : "painel sucesso-pesagem"}>
    {registro.metaAtingidaAgora && <div className="confetes" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} />)}</div>}
    <span>{registro.metaAtingidaAgora ? <Sparkles /> : <Check />}</span>
    <h2>{registro.metaAtingidaAgora ? `${catador?.nome_completo} bateu a meta!` : "Pesagem registrada com sucesso!"}</h2>
    <p>Registro <strong>{registro.codigo}</strong> salvo como <strong>{rotulosStatus[status]}</strong>.</p>
    {registro.progressoMeta && <div className="placar-meta"><strong>{registro.progressoMeta.peso.toLocaleString("pt-BR")} kg de {registro.progressoMeta.metaDiaria.toLocaleString("pt-BR")} kg</strong><span>Ganho diário neste material: {dinheiro(registro.progressoMeta.ganho)}</span></div>}
    <button type="button" className="botao-secundario" onClick={reiniciar}>Registrar outra pesagem</button>
  </div>;

  const podeContinuar = !((etapa === 0 && (!cooperativaUuid || !pontoUuid || !responsavelValido)) || (etapa === 1 && !catador) || (etapa === 2 && (!material || pesoNumero <= 0 || !dataHoraValida || caixaBloqueado)));

  return <section className="pagina-interna pesagem">
    <div className="progresso-pesagem">{["Operação", "Confirmar catador", "Material e meta", "Revisar"].map((item, i) => <div className={i === etapa ? "atual" : i < etapa ? "feito" : ""} key={item}><span>{i < etapa ? "✓" : i + 1}</span><small>{item}</small></div>)}</div>
    <div className="painel formulario-pesagem">
      {etapa === 0 && <div className="animar-etapa"><span className="sobrelinha">ETAPA 1 DE 4</span><h2>Dados da operação</h2><p>Identifique a cooperativa, o local e quem realizou a pesagem.</p><div className="grade-formulario espacada"><label className="campo">Cooperativa / associação<select value={cooperativaUuid} onChange={(e) => setCooperativaUuid(e.target.value)}><option value="">Selecionar</option>{cooperativas.map((item) => <option value={item.uuid} key={item.uuid}>{item.nome}</option>)}</select></label><label className="campo">Central / ponto de apoio<select value={pontoUuid} onChange={(e) => setPontoUuid(e.target.value)}><option value="">Selecionar</option>{pontos.map((item) => <option value={item.uuid} key={item.uuid}>{item.nome}</option>)}</select></label><label className="campo">Responsável pela pesagem<select value={responsavelUuid} onChange={(e) => setResponsavelUuid(e.target.value)}><option value="">Selecionar</option>{responsaveis.map((item) => <option value={item.uuid} key={item.uuid}>{item.nome}</option>)}<option value="outro">Outro</option></select></label>{responsavelUuid === "outro" && <label className="campo">Nome do responsável<input value={responsavelOutro} onChange={(e) => setResponsavelOutro(e.target.value)} /></label>}</div></div>}
      {etapa === 1 && <div className="animar-etapa"><span className="sobrelinha">ETAPA 2 DE 4</span><h2>Confirme o catador</h2><p>Pesquise por nome, apelido ou código e confira a identidade.</p><label className="campo-busca busca-grande"><Search /><input value={buscaCatador} onChange={(e) => setBuscaCatador(e.target.value)} placeholder="Digite o nome ou código do catador" /></label><div className="resultados-catadores">{catadoresFiltrados.map((item) => <button type="button" className={item.uuid === catadorUuid ? "resultado-catador selecionado" : "resultado-catador"} key={item.uuid} onClick={() => { setCatadorUuid(item.uuid); setBuscaCatador(`${item.codigo} — ${item.nome_completo}`); }}>{item.tem_foto ? <img src={`${URL_API}/api/catadores/${item.uuid}/foto`} alt={`Foto de ${item.nome_completo}`} /> : <i>{item.nome_completo.split(/\s+/).slice(0, 2).map((parte) => parte[0]).join("")}</i>}<span><strong>{item.codigo} — {item.nome_completo}</strong><small>{[item.cooperativa, item.contatos.map((contato) => contato.valor).join(" · "), item.endereco_resumo].filter(Boolean).join(" · ") || "Dados complementares não informados"}</small></span><b><small>Meta hoje</small>{Math.round(Number(item.percentual_meta_hoje))}%</b><em className={`status-caixa ${item.status_caixa_hoje}`}>Caixa {item.status_caixa_hoje}</em></button>)}</div>{catador && <CartaoCatador catador={catador} caixa={caixa} metas={metas} />}</div>}
      {etapa === 2 && <div className="animar-etapa"><span className="sobrelinha">ETAPA 3 DE 4</span><h2>Material, peso e meta diária</h2><p>O pagamento e a meta usam a configuração preservada no banco.</p><div className="grade-materiais">{materiais.map((item) => <button type="button" className={materialUuid === item.uuid ? "cartao-material selecionado" : "cartao-material"} onClick={() => setMaterialUuid(item.uuid)} key={item.uuid}><span>{item.tipo_material.slice(0, 2).toUpperCase()}</span><strong>{item.nome}</strong><small>{dinheiro(Number(item.valor_referencia))} / {Number(item.quantidade_referencia)} {item.unidade}</small><small>Meta: {Number(item.meta_diaria)} {item.unidade}/dia</small>{materialUuid === item.uuid && <i>✓</i>}</button>)}</div><div className="grade-formulario espacada"><label className="campo campo-peso">Peso do material<div><input value={peso} onChange={(e) => setPeso(e.target.value)} inputMode="decimal" placeholder="0,00" /><span>{material?.unidade.toUpperCase() ?? "KG"}</span></div></label><label className="campo">Data e hora<input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} /></label><label className="campo">Status<select value={status} onChange={(e) => setStatus(e.target.value as StatusPesagem)}><option value="concluida">Concluída</option><option value="agendada">Agendada</option><option value="cancelada">Cancelada</option></select></label><label className="campo campo-largo">Observação <small>Opcional</small><textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} /></label></div>{material && <ProgressoMeta percentual={percentualDepois} peso={pesoDiaDepois} meta={metaDiaria} falta={faltaDepois} ganho={ganhoDiaDepois} caixa={caixa} />}</div>}
      {etapa === 3 && <div className="animar-etapa"><span className="sobrelinha">ETAPA 4 DE 4</span><h2>Revise antes de registrar</h2><ResumoPesagem catador={catador} cooperativa={cooperativa} ponto={ponto} material={material} peso={pesoNumero} valor={valor} dataHora={dataHora} status={status} percentual={percentualDepois} falta={faltaDepois} ganhoDia={ganhoDiaDepois} /></div>}
      {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
      {caixaBloqueado && <p className="mensagem-erro" role="alert">O caixa deste catador está fechado para o dia selecionado. Reabra-o na ficha do catador antes de registrar.</p>}
      <footer className="rodape-fluxo"><button type="button" className="botao-secundario" disabled={etapa === 0} onClick={() => setEtapa((v) => Math.max(0, v - 1))}>← Voltar</button><button type="button" className="botao-primario" disabled={salvando || !podeContinuar} onClick={etapa === 3 ? () => setConfirmacaoAberta(true) : () => setEtapa((v) => Math.min(3, v + 1))}>{etapa === 3 ? "Confirmar dados" : "Continuar →"}</button></footer>
    </div>
    {confirmacaoAberta && <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-confirmar-pesagem"><div className="modal pequeno modal-confirmacao-pesagem"><header className="cabecalho-modal"><div><span>CONFIRMAÇÃO FINAL</span><h2 id="titulo-confirmar-pesagem">Registrar esta pesagem?</h2><p>A movimentação entrará no caixa individual e no histórico auditável.</p></div><button type="button" onClick={() => setConfirmacaoAberta(false)} aria-label="Fechar"><X /></button></header><div className="selo-auditoria"><ShieldCheck /><span><strong>Registro financeiro protegido</strong><small>Valor, meta, caixa, usuário e alterações serão preservados.</small></span></div><ResumoPesagem catador={catador} cooperativa={cooperativa} ponto={ponto} material={material} peso={pesoNumero} valor={valor} dataHora={dataHora} status={status} percentual={percentualDepois} falta={faltaDepois} ganhoDia={ganhoDiaDepois} /><footer className="rodape-modal"><button type="button" className="botao-secundario" onClick={() => setConfirmacaoAberta(false)} disabled={salvando}>Voltar e corrigir</button><button type="button" className="botao-primario" onClick={() => void registrar()} disabled={salvando}>{salvando ? "Registrando..." : "Sim, registrar"}</button></footer></div></div>}
  </section>;
}

function CartaoCatador({ catador, caixa, metas }: { catador: CatadorApi; caixa: CaixaDia | null; metas: ProgressoMetaApi[] }) {
  const melhorMeta = metas.reduce<ProgressoMetaApi | null>((melhor, atual) => !melhor || atual.percentual > melhor.percentual ? atual : melhor, null);
  return <div className="confirmar-catador">{catador.tem_foto ? <img className="foto-catador" src={`${URL_API}/api/catadores/${catador.uuid}/foto`} alt={`Foto de ${catador.nome_completo}`} /> : <div className="foto-catador">{catador.nome_completo.split(/\s+/).slice(0, 2).map((p) => p[0]).join("")}</div>}<div><span className="status ativo">● Cadastro ativo</span><h3>{catador.nome_completo}</h3><p><code>{catador.codigo}</code> · {catador.cooperativa ?? "Sem cooperativa"}</p><p>{catador.contatos.map((item) => item.valor).join(" · ") || "Contato não informado"}</p><p>{catador.endereco_resumo || "Endereço não informado"}</p>{melhorMeta && <div className="mini-meta"><span>Melhor meta hoje: {melhorMeta.nome}</span><b>{Math.round(melhorMeta.percentual)}%</b></div>}</div><div className="selo-confirmacao"><span><Check /></span><small>Identidade conferida</small><strong className={`status-caixa ${caixa?.status === "fechado" ? "fechado" : "aberto"}`}>Caixa {caixa?.status ?? "aberto"}</strong></div></div>;
}

function ProgressoMeta({ percentual, peso, meta, falta, ganho, caixa }: { percentual: number; peso: number; meta: number; falta: number; ganho: number; caixa: CaixaDia | null }) {
  return <section className="painel-meta"><header><div><span>META DIÁRIA</span><strong>{peso.toLocaleString("pt-BR")} de {meta.toLocaleString("pt-BR")} kg</strong></div><b>{Math.round(percentual)}%</b></header><div className="trilho-meta"><i style={{ width: `${percentual}%` }} /></div><footer><span>{falta > 0 ? `Faltam ${falta.toLocaleString("pt-BR")} kg` : "Meta atingida — os próximos quilos continuam sendo pagos"}</span><strong>{dinheiro(ganho)} no dia</strong></footer>{caixa?.status === "fechado" && <p>Caixa fechado: novas movimentações estão bloqueadas.</p>}</section>;
}

function ResumoPesagem({ catador, cooperativa, ponto, material, peso, valor, dataHora, status, percentual, falta, ganhoDia }: { catador?: CatadorApi; cooperativa?: CooperativaApi; ponto?: Referencia; material?: MaterialApi; peso: number; valor: number; dataHora: string; status: StatusPesagem; percentual: number; falta: number; ganhoDia: number }) {
  return <div className="resumo-pesagem"><div className="linha-resumo"><span>Código do catador e nome</span><strong>{catador?.codigo} — {catador?.nome_completo}</strong></div><div className="linha-resumo"><span>Cooperativa / associação</span><strong>{cooperativa?.nome}</strong></div><div className="linha-resumo"><span>Central / ponto</span><strong>{ponto?.nome}</strong></div><div className="linha-resumo"><span>Material</span><strong>{material?.nome}</strong></div><div className="linha-resumo"><span>Peso</span><strong>{peso.toLocaleString("pt-BR")} {material?.unidade}</strong></div><div className="linha-resumo"><span>Data e hora</span><strong>{dataHora ? new Date(dataHora).toLocaleString("pt-BR") : "—"}</strong></div><div className="linha-resumo"><span>Status</span><strong className={`status-pesagem ${status}`}>{rotulosStatus[status]}</strong></div><div className="linha-resumo"><span>Meta após registro</span><strong>{Math.round(percentual)}% · {falta > 0 ? `faltam ${falta.toLocaleString("pt-BR")} kg` : "atingida"}</strong></div><div className="linha-resumo"><span>Ganho acumulado no dia/material</span><strong>{dinheiro(ganhoDia)}</strong></div><div className="total-pesagem"><span>Valor desta pesagem</span><strong>{dinheiro(valor)}</strong></div></div>;
}

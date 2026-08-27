"use client";

/* eslint-disable @next/next/no-img-element, jsx-a11y/label-has-associated-control -- foto autenticada e controles compostos com texto visível */

import { useCallback, useEffect, useState } from "react";
import { Check, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import { requisitarApi, URL_API, type CatadorApi, type CooperativaApi, type DetalheMetaGeralApi, type MaterialApi, type MetaGeralApi, type ProgressoMetaApi } from "@/app/dados/api";
import { Paginacao } from "@/app/componentes/paginacao";
import { useTermoBusca } from "@/app/utilitarios/use-termo-busca";

type Referencia = { uuid: string; nome: string };
type StatusPesagem = "concluida" | "agendada" | "cancelada";
type CaixaDia = { status: "aberto" | "fechado"; data_caixa: string; peso: number; valor: number };
type RespostaPesagem = { codigo: string; valorTotal: number; contabilizaMeta: boolean; guardarExcedenteMeta: boolean; metaAtingidaAgora: boolean; progressoMeta: { peso: number; ganho: number; metaDiaria: number; percentual: number; falta: number; atingida: boolean } | null; progressoMetaGeral: MetaGeralApi | null };

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
  const [paginaCatadores, setPaginaCatadores] = useState(1);
  const [totalCatadores, setTotalCatadores] = useState(0);
  const [paginaMateriais, setPaginaMateriais] = useState(1);
  const [catadorUuid, setCatadorUuid] = useState("");
  const [catadorSelecionado, setCatadorSelecionado] = useState<CatadorApi | null>(null);
  const [materialUuid, setMaterialUuid] = useState("");
  const [contabilizarNaMeta, setContabilizarNaMeta] = useState(true);
  const [guardarExcedenteMeta, setGuardarExcedenteMeta] = useState(false);
  const [metas, setMetas] = useState<ProgressoMetaApi[]>([]);
  const [metaGeral, setMetaGeral] = useState<MetaGeralApi | null>(null);
  const [caixa, setCaixa] = useState<CaixaDia | null>(null);
  const [peso, setPeso] = useState("");
  const [observacao, setObservacao] = useState("");
  const [dataHora, setDataHora] = useState(dataHoraLocalAtual);
  const [status, setStatus] = useState<StatusPesagem>("concluida");
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const [registro, setRegistro] = useState<RespostaPesagem | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const termoBuscaCatador = useTermoBusca(buscaCatador);

  useEffect(() => {
    void Promise.all([
      requisitarApi<{ dados: CooperativaApi[] }>("/api/cooperativas"),
      requisitarApi<{ dados: MaterialApi[] }>("/api/materiais"),
      requisitarApi<{ dados: Referencia[] }>("/api/pontos-apoio"),
      requisitarApi<{ dados: Referencia[] }>("/api/responsaveis-pesagem"),
    ]).then(([co, m, p, r]) => {
      setCooperativas(co.dados.filter((item) => item.status === "ativo"));
      setMateriais(m.dados.filter((item) => item.status === "ativo"));
      setPontos(p.dados); setResponsaveis(r.dados);
      setCooperativaUuid(co.dados.find((item) => item.status === "ativo")?.uuid ?? "");
      setPontoUuid(p.dados[0]?.uuid ?? "");
    }).catch((falha) => setErro(falha instanceof Error ? falha.message : "Não foi possível carregar os dados."));
  }, []);

  const carregarCatadores = useCallback(async () => {
    const dados = await requisitarApi<{ dados: CatadorApi[]; total: number }>(`/api/catadores?busca=${encodeURIComponent(termoBuscaCatador)}&status=ativo&limite=6&deslocamento=${(paginaCatadores - 1) * 6}`);
    setCatadores(dados.dados); setTotalCatadores(dados.total);
  }, [paginaCatadores, termoBuscaCatador]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- paginação da busca de catadores da pesagem
  useEffect(() => { void carregarCatadores().catch((falha) => setErro(falha instanceof Error ? falha.message : "Não foi possível buscar os catadores.")); }, [carregarCatadores]);

  const carregarMetas = useCallback(async () => {
    if (!catadorUuid || !dataHora) return;
    const dados = await requisitarApi<{ metas: ProgressoMetaApi[]; metaGeral: MetaGeralApi; caixa: CaixaDia }>(`/api/catadores/${catadorUuid}/metas?data=${dataHora.slice(0, 10)}`);
    setMetas(dados.metas); setMetaGeral(dados.metaGeral); setCaixa(dados.caixa);
  }, [catadorUuid, dataHora]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza meta e caixa do catador/data selecionados
  useEffect(() => { void carregarMetas().catch((falha) => setErro(falha instanceof Error ? falha.message : "Não foi possível carregar a meta.")); }, [carregarMetas]);

  const catador = catadorSelecionado ?? undefined;
  const material = materiais.find((item) => item.uuid === materialUuid);
  const cooperativa = cooperativas.find((item) => item.uuid === cooperativaUuid);
  const ponto = pontos.find((item) => item.uuid === pontoUuid);
  const metaAtual = metas.find((item) => item.material_uuid === materialUuid);
  const pesoNumero = Number(peso.replace(",", "."));
  const usaMetaGeral = Boolean(metaGeral?.ativa);
  const participaMeta = Boolean(material?.contabiliza_meta && contabilizarNaMeta);
  const foraDaMeta = Boolean(material && !participaMeta);
  const metaDiaria = Number(usaMetaGeral ? metaGeral?.meta : metaAtual?.meta ?? material?.meta_diaria ?? 0);
  const semMeta = metaDiaria <= 0;
  const pesoAntes = Number(usaMetaGeral ? metaGeral?.peso : metaAtual?.peso ?? 0);
  const pesoNovoValido = status === "concluida" && participaMeta ? Math.max(pesoNumero, 0) : 0;
  const pesoAplicadoMeta = usaMetaGeral ? Math.min(pesoNovoValido, Math.max(metaDiaria - pesoAntes, 0)) : pesoNovoValido;
  const pesoExcedente = usaMetaGeral ? Math.max(pesoNovoValido - pesoAplicadoMeta, 0) : 0;
  const pesoDiaDepois = usaMetaGeral ? Math.min(pesoAntes + pesoAplicadoMeta, metaDiaria) : pesoAntes + pesoNovoValido;
  const percentualDepois = semMeta ? 100 : Math.min((pesoDiaDepois / metaDiaria) * 100, 100);
  const faltaDepois = semMeta ? 0 : Math.max(metaDiaria - pesoDiaDepois, 0);
  const valorBrutoNovaPesagem = material ? Math.round((Math.max(pesoNumero, 0) / Number(material.quantidade_referencia) * Number(material.valor_referencia)) * 100) / 100 : 0;
  const ganhoAtual = Number(usaMetaGeral ? metaGeral?.valorLiberado : metaAtual?.ganho ?? 0);
  const metaAtingidaDepois = semMeta || pesoDiaDepois >= metaDiaria;
  const premioNovo = usaMetaGeral && pesoAntes < metaDiaria && metaAtingidaDepois ? Number(metaGeral?.valorPremio ?? 0) : 0;
  const valorExcedenteNovo = material && usaMetaGeral && !guardarExcedenteMeta ? Math.round((pesoExcedente / Number(material.quantidade_referencia) * Number(material.valor_referencia)) * 100) / 100 : 0;
  const valor = status === "concluida" ? foraDaMeta ? valorBrutoNovaPesagem : usaMetaGeral ? premioNovo + valorExcedenteNovo : (semMeta || metaAtingidaDepois ? Math.max((material ? pesoDiaDepois / Number(material.quantidade_referencia) * Number(material.valor_referencia) : 0) - ganhoAtual, 0) : 0) : 0;
  const ganhoDiaDepois = ganhoAtual + valor;
  const detalhesMetaGeralDepois = atualizarDetalhesMetaGeral(metaGeral?.detalhes ?? [], material, pesoNovoValido, pesoAplicadoMeta, pesoExcedente, guardarExcedenteMeta, premioNovo, valorExcedenteNovo);

  function selecionarMaterial(item: MaterialApi) {
    setMaterialUuid(item.uuid);
    setContabilizarNaMeta(item.contabiliza_meta);
    setGuardarExcedenteMeta(false);
  }
  const responsavelValido = responsavelUuid === "outro" ? responsavelOutro.trim().length >= 2 : Boolean(responsavelUuid);
  const dataHoraValida = Boolean(dataHora) && !Number.isNaN(new Date(dataHora).getTime());
  const caixaBloqueado = status === "concluida" && caixa?.status === "fechado";
  const catadoresFiltrados = catadores;
  const materiaisPaginados = materiais.slice((paginaMateriais - 1) * 6, paginaMateriais * 6);

  async function registrar() {
    if (!catador || !material || !cooperativaUuid || !pontoUuid || !responsavelValido || pesoNumero <= 0 || !dataHoraValida || caixaBloqueado) return;
    setSalvando(true); setErro("");
    try {
      const resposta = await requisitarApi<RespostaPesagem>("/api/pesagens", { method: "POST", body: JSON.stringify({
        catadorUuid, cooperativaUuid, pontoApoioUuid: pontoUuid,
        responsavelPesagemUuid: responsavelUuid === "outro" ? undefined : responsavelUuid,
        responsavelOutro: responsavelUuid === "outro" ? responsavelOutro.trim() : undefined,
        materialUuid, contabilizarNaMeta: participaMeta, guardarExcedenteMeta: participaMeta && guardarExcedenteMeta, peso: pesoNumero, observacao: observacao.trim() || undefined,
        dataHora: new Date(dataHora).toISOString(), status,
      }) });
      setConfirmacaoAberta(false); setRegistro(resposta);
    } catch (falha) { setErro(falha instanceof Error ? falha.message : "Não foi possível registrar a pesagem."); }
    finally { setSalvando(false); }
  }

  function iniciarProximaPesagem() {
    setEtapa(1); setCatadorUuid(""); setCatadorSelecionado(null); setBuscaCatador(""); setMaterialUuid(""); setContabilizarNaMeta(true); setGuardarExcedenteMeta(false); setMetas([]); setMetaGeral(null); setCaixa(null);
    setPeso(""); setObservacao(""); setDataHora(dataHoraLocalAtual()); setStatus("concluida"); setRegistro(null);
  }

  if (registro) return <div className={registro.metaAtingidaAgora ? "painel sucesso-pesagem comemoracao-meta" : "painel sucesso-pesagem"}>
    {registro.metaAtingidaAgora && <div className="confetes" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} />)}</div>}
    <span>{registro.metaAtingidaAgora ? <Sparkles /> : <Check />}</span>
    <h2>{registro.metaAtingidaAgora ? `${catador?.nome_completo} bateu a meta!` : "Pesagem registrada com sucesso!"}</h2>
    <p>Registro <strong>{registro.codigo}</strong> salvo como <strong>{rotulosStatus[status]}</strong>.</p>
    {!registro.contabilizaMeta ? <div className="placar-meta fora-meta"><strong>Entrega registrada fora da meta</strong><span>Pagamento imediato: {dinheiro(registro.valorTotal)}. O peso não alterou o progresso diário.</span></div> : registro.progressoMetaGeral?.ativa ? <div className="placar-meta"><strong>{registro.progressoMetaGeral.peso.toLocaleString("pt-BR")} {registro.progressoMetaGeral.unidade} de {registro.progressoMetaGeral.meta.toLocaleString("pt-BR")} {registro.progressoMetaGeral.unidade} na meta geral</strong>{registro.progressoMetaGeral.atingida ? <><span>Total liberado: {dinheiro(registro.progressoMetaGeral.valorLiberado)}</span><DetalhesPagamento detalhes={registro.progressoMetaGeral.detalhes} /></> : <span>Valores sujeitos ao atingimento da meta geral.</span>}</div> : registro.progressoMeta && <div className="placar-meta"><strong>{registro.progressoMeta.peso.toLocaleString("pt-BR")} kg de {registro.progressoMeta.metaDiaria.toLocaleString("pt-BR")} kg</strong>{registro.progressoMeta.atingida ? <span>Total liberado neste material: {dinheiro(registro.progressoMeta.ganho)}</span> : <span>Valores sujeitos ao atingimento da meta.</span>}</div>}
    <button type="button" className="botao-secundario" onClick={iniciarProximaPesagem}>Registrar outra pesagem</button>
  </div>;

  const podeContinuar = !((etapa === 0 && (!cooperativaUuid || !pontoUuid || !responsavelValido)) || (etapa === 1 && !catador) || (etapa === 2 && (!material || pesoNumero <= 0 || !dataHoraValida || caixaBloqueado)));

  return <section className="pagina-interna pesagem">
    <div className="progresso-pesagem">{["Operação", "Confirmar catador", "Material e meta", "Revisar"].map((item, i) => <div className={i === etapa ? "atual" : i < etapa ? "feito" : ""} key={item}><span>{i < etapa ? "✓" : i + 1}</span><small>{item}</small></div>)}</div>
    <div className="painel formulario-pesagem">
      {etapa === 0 && <div className="animar-etapa"><span className="sobrelinha">ETAPA 1 DE 4</span><h2>Dados da operação</h2><p>Identifique a cooperativa, o local e quem realizou a pesagem.</p><div className="grade-formulario espacada"><label className="campo">Cooperativa / associação<select value={cooperativaUuid} onChange={(e) => setCooperativaUuid(e.target.value)}><option value="">Selecionar</option>{cooperativas.map((item) => <option value={item.uuid} key={item.uuid}>{item.nome}</option>)}</select></label><label className="campo">Central / ponto de apoio<select value={pontoUuid} onChange={(e) => setPontoUuid(e.target.value)}><option value="">Selecionar</option>{pontos.map((item) => <option value={item.uuid} key={item.uuid}>{item.nome}</option>)}</select></label><label className="campo">Responsável pela pesagem<select value={responsavelUuid} onChange={(e) => setResponsavelUuid(e.target.value)}><option value="">Selecionar</option>{responsaveis.map((item) => <option value={item.uuid} key={item.uuid}>{item.nome}</option>)}<option value="outro">Outro</option></select></label>{responsavelUuid === "outro" && <label className="campo">Nome do responsável<input value={responsavelOutro} onChange={(e) => setResponsavelOutro(e.target.value)} /></label>}</div></div>}
      {etapa === 1 && <div className="animar-etapa"><span className="sobrelinha">ETAPA 2 DE 4</span><h2>Confirme o catador</h2><p>Pesquise por nome, apelido ou código e confira a identidade.</p><label className="campo-busca busca-grande"><Search /><input value={buscaCatador} onChange={(e) => { setBuscaCatador(e.target.value); setCatadorUuid(""); setCatadorSelecionado(null); setPaginaCatadores(1); }} placeholder="Digite o nome ou código do catador" /></label><div className="resultados-catadores">{catadoresFiltrados.map((item) => <button type="button" className={item.uuid === catadorUuid ? "resultado-catador selecionado" : "resultado-catador"} key={item.uuid} onClick={() => { setCatadorUuid(item.uuid); setCatadorSelecionado(item); setBuscaCatador(`${item.codigo} — ${item.nome_completo}`); setPaginaCatadores(1); }}>{item.tem_foto ? <img src={`${URL_API}/api/catadores/${item.uuid}/foto`} alt={`Foto de ${item.nome_completo}`} /> : <i>{item.nome_completo.split(/\s+/).slice(0, 2).map((parte) => parte[0]).join("")}</i>}<span><strong>{item.codigo} — {item.nome_completo}</strong><small>{[item.cooperativa, item.contatos.map((contato) => contato.valor).join(" · "), item.endereco_resumo].filter(Boolean).join(" · ") || "Dados complementares não informados"}</small></span><b><small>Meta hoje</small>{Math.round(Number(item.percentual_meta_hoje))}%</b><em className={`status-caixa ${item.status_caixa_hoje}`}>Caixa {item.status_caixa_hoje}</em></button>)}</div><Paginacao pagina={paginaCatadores} total={totalCatadores} itensPorPagina={6} aoMudarPagina={setPaginaCatadores} rotulo="catadores encontrados" />{catador && <CartaoCatador catador={catador} caixa={caixa} metas={metas} metaGeral={metaGeral} />}</div>}
      {etapa === 2 && <div className="animar-etapa"><span className="sobrelinha">ETAPA 3 DE 4</span><h2>Material, peso e meta diária</h2><p>O pagamento e a meta usam a configuração preservada no banco.</p>{usaMetaGeral && <p className="aviso-meta-geral"><strong>Meta geral ativa:</strong> somente entregas escolhidas para a meta aumentam o alvo de {metaDiaria.toLocaleString("pt-BR")} {metaGeral?.unidade}.</p>}<div className="grade-materiais">{materiaisPaginados.map((item) => <button type="button" className={materialUuid === item.uuid ? "cartao-material selecionado" : "cartao-material"} onClick={() => selecionarMaterial(item)} key={item.uuid}><span>{item.tipo_material.slice(0, 2).toUpperCase()}</span><strong>{item.nome}</strong><small>{dinheiro(Number(item.valor_referencia))} / {Number(item.quantidade_referencia)} {item.unidade}</small><small>{!item.contabiliza_meta ? "Sempre fora da meta · pagamento imediato" : usaMetaGeral ? "Válido para a meta geral" : Number(item.meta_diaria) > 0 ? `Meta: ${Number(item.meta_diaria)} ${item.unidade}/dia` : "Válido para a meta geral"}</small>{materialUuid === item.uuid && <i>✓</i>}</button>)}</div><Paginacao pagina={paginaMateriais} total={materiais.length} itensPorPagina={6} aoMudarPagina={setPaginaMateriais} rotulo="materiais" />{material && (material.contabiliza_meta ? <label className="interruptor opcao-meta-pesagem"><input type="checkbox" checked={contabilizarNaMeta} onChange={(evento) => setContabilizarNaMeta(evento.target.checked)} /><span /><div><strong>Contabilizar esta entrega na meta</strong><small>{contabilizarNaMeta ? "O peso aumentará o progresso e o valor ficará sujeito à meta." : "Fora da meta: o peso não aumenta o progresso e o pagamento é imediato."}</small></div></label> : <div className="aviso-fora-meta"><strong>Este material não é válido para metas</strong><span>A entrega será paga imediatamente pelo preço configurado e não alterará o progresso diário.</span></div>)}<div className="grade-formulario espacada"><label className="campo campo-peso">Peso do material<div><input value={peso} onChange={(e) => setPeso(e.target.value)} inputMode="decimal" placeholder="0,00" /><span>{material?.unidade.toUpperCase() ?? "KG"}</span></div></label><label className="campo">Data e hora<input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} /></label><label className="campo">Status<select value={status} onChange={(e) => setStatus(e.target.value as StatusPesagem)}><option value="concluida">Concluída</option><option value="agendada">Agendada</option><option value="cancelada">Cancelada</option></select></label><label className="campo campo-largo">Observação <small>Opcional</small><textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} /></label></div>{material && (foraDaMeta ? <PagamentoForaMeta peso={Math.max(pesoNumero, 0)} unidade={material.unidade} valor={status === "concluida" ? valorBrutoNovaPesagem : 0} caixa={caixa} /> : <ProgressoMeta percentual={percentualDepois} peso={pesoDiaDepois} meta={metaDiaria} falta={faltaDepois} ganho={ganhoDiaDepois} caixa={caixa} tipo={usaMetaGeral ? "geral" : "material"} metaAtingida={metaAtingidaDepois} detalhes={usaMetaGeral ? detalhesMetaGeralDepois : []} />)}</div>}
      {etapa === 2 && usaMetaGeral && participaMeta && pesoExcedente > 0 && <section className="escolha-excedente-meta" aria-labelledby="titulo-excedente-meta"><div><span>EXCEDENTE DA META</span><strong id="titulo-excedente-meta">Como tratar {pesoExcedente.toLocaleString("pt-BR")} {material?.unidade} excedentes?</strong><small>O prêmio fixo de {dinheiro(Number(metaGeral?.valorPremio ?? 0))} quita o peso usado até a meta. Escolha somente o destino do que passou do alvo.</small></div><label className={!guardarExcedenteMeta ? "selecionada" : ""}><input type="radio" name="destino-excedente" checked={!guardarExcedenteMeta} onChange={() => setGuardarExcedenteMeta(false)} /><span><strong>Pagar excedente agora</strong><small>Aplica o preço configurado do material somente sobre os quilos excedentes.</small></span></label><label className={guardarExcedenteMeta ? "selecionada" : ""}><input type="radio" name="destino-excedente" checked={guardarExcedenteMeta} onChange={() => setGuardarExcedenteMeta(true)} /><span><strong>Guardar para a próxima meta</strong><small>Não paga agora e transforma o excedente em crédito de peso para um dia futuro.</small></span></label></section>}
      {etapa === 3 && <div className="animar-etapa"><span className="sobrelinha">ETAPA 4 DE 4</span><h2>Revise antes de registrar</h2><ResumoPesagem catador={catador} cooperativa={cooperativa} ponto={ponto} material={material} peso={pesoNumero} valor={valor} dataHora={dataHora} status={status} percentual={percentualDepois} falta={faltaDepois} ganhoDia={ganhoDiaDepois} usaMetaGeral={usaMetaGeral} metaAtingida={metaAtingidaDepois} contabilizaMeta={participaMeta} detalhes={detalhesMetaGeralDepois} /></div>}
      {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
      {caixaBloqueado && <p className="mensagem-erro" role="alert">O caixa deste catador está fechado para o dia selecionado. Reabra-o na ficha do catador antes de registrar.</p>}
      <footer className="rodape-fluxo"><button type="button" className="botao-secundario" disabled={etapa === 0} onClick={() => setEtapa((v) => Math.max(0, v - 1))}>← Voltar</button><button type="button" className="botao-primario" disabled={salvando || !podeContinuar} onClick={etapa === 3 ? () => setConfirmacaoAberta(true) : () => setEtapa((v) => Math.min(3, v + 1))}>{etapa === 3 ? "Confirmar dados" : "Continuar →"}</button></footer>
    </div>
    {confirmacaoAberta && <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-confirmar-pesagem"><div className="modal pequeno modal-confirmacao-pesagem"><header className="cabecalho-modal"><div><span>CONFIRMAÇÃO FINAL</span><h2 id="titulo-confirmar-pesagem">Registrar esta pesagem?</h2><p>A movimentação entrará no caixa individual e no histórico auditável.</p></div><button type="button" onClick={() => setConfirmacaoAberta(false)} aria-label="Fechar"><X /></button></header><div className="selo-auditoria"><ShieldCheck /><span><strong>Registro financeiro protegido</strong><small>Valor, meta, caixa, usuário e alterações serão preservados.</small></span></div><ResumoPesagem catador={catador} cooperativa={cooperativa} ponto={ponto} material={material} peso={pesoNumero} valor={valor} dataHora={dataHora} status={status} percentual={percentualDepois} falta={faltaDepois} ganhoDia={ganhoDiaDepois} usaMetaGeral={usaMetaGeral} metaAtingida={metaAtingidaDepois} contabilizaMeta={participaMeta} detalhes={detalhesMetaGeralDepois} /><footer className="rodape-modal"><button type="button" className="botao-secundario" onClick={() => setConfirmacaoAberta(false)} disabled={salvando}>Voltar e corrigir</button><button type="button" className="botao-primario" onClick={() => void registrar()} disabled={salvando}>{salvando ? "Registrando..." : "Sim, registrar"}</button></footer></div></div>}
  </section>;
}

function CartaoCatador({ catador, caixa, metas, metaGeral }: { catador: CatadorApi; caixa: CaixaDia | null; metas: ProgressoMetaApi[]; metaGeral: MetaGeralApi | null }) {
  const melhorMeta = metas.reduce<ProgressoMetaApi | null>((melhor, atual) => !melhor || atual.percentual > melhor.percentual ? atual : melhor, null);
  return <div className="confirmar-catador">{catador.tem_foto ? <img className="foto-catador" src={`${URL_API}/api/catadores/${catador.uuid}/foto`} alt={`Foto de ${catador.nome_completo}`} /> : <div className="foto-catador">{catador.nome_completo.split(/\s+/).slice(0, 2).map((p) => p[0]).join("")}</div>}<div><span className="status ativo">● Cadastro ativo</span><h3>{catador.nome_completo}</h3><p><code>{catador.codigo}</code> · {catador.cooperativa ?? "Sem cooperativa"}</p><p>{catador.contatos.map((item) => item.valor).join(" · ") || "Contato não informado"}</p><p>{catador.endereco_resumo || "Endereço não informado"}</p>{metaGeral?.ativa ? <div className="mini-meta"><span>Meta geral hoje: {metaGeral.peso.toLocaleString("pt-BR")} / {metaGeral.meta.toLocaleString("pt-BR")} {metaGeral.unidade}</span><b>{Math.round(metaGeral.percentual)}%</b></div> : melhorMeta && <div className="mini-meta"><span>Melhor meta hoje: {melhorMeta.nome}</span><b>{Math.round(melhorMeta.percentual)}%</b></div>}</div><div className="selo-confirmacao"><span><Check /></span><small>Identidade conferida</small><strong className={`status-caixa ${caixa?.status === "fechado" ? "fechado" : "aberto"}`}>Caixa {caixa?.status ?? "aberto"}</strong></div></div>;
}

function ProgressoMeta({ percentual, peso, meta, falta, ganho, caixa, tipo, metaAtingida, detalhes }: { percentual: number; peso: number; meta: number; falta: number; ganho: number; caixa: CaixaDia | null; tipo: "geral" | "material"; metaAtingida: boolean; detalhes: DetalheMetaGeralApi[] }) {
  const semMeta = meta <= 0;
  return <section className="painel-meta"><header><div><span>{semMeta ? "PAGAMENTO IMEDIATO" : tipo === "geral" ? "META GERAL DIÁRIA" : "META DO MATERIAL"}</span><strong>{semMeta ? `${peso.toLocaleString("pt-BR")} kg registrados` : `${peso.toLocaleString("pt-BR")} de ${meta.toLocaleString("pt-BR")} kg`}</strong></div><b>{semMeta ? "Sem meta" : `${Math.round(percentual)}%`}</b></header><div className="trilho-meta"><i style={{ width: `${percentual}%` }} /></div><footer><span>{semMeta ? "Todo o peso concluído é contabilizado" : falta > 0 ? `Faltam ${falta.toLocaleString("pt-BR")} kg · valores sujeitos à meta` : "Meta atingida — os próximos quilos continuam sendo pagos"}</span>{metaAtingida && <strong>{dinheiro(ganho)} liberados no dia</strong>}</footer>{tipo === "geral" && metaAtingida && <DetalhesPagamento detalhes={detalhes} />}{caixa?.status === "fechado" && <p>Caixa fechado: novas movimentações estão bloqueadas.</p>}</section>;
}

function PagamentoForaMeta({ peso, unidade, valor, caixa }: { peso: number; unidade: string; valor: number; caixa: CaixaDia | null }) {
  return <section className="painel-meta painel-fora-meta"><header><div><span>FORA DA META</span><strong>{peso.toLocaleString("pt-BR")} {unidade} com pagamento imediato</strong></div><b>{dinheiro(valor)}</b></header><footer><span>Este peso não altera a meta diária do catador.</span><strong>Preço configurado preservado na pesagem</strong></footer>{caixa?.status === "fechado" && <p>Caixa fechado: novas movimentações estão bloqueadas.</p>}</section>;
}

function ResumoPesagem({ catador, cooperativa, ponto, material, peso, valor, dataHora, status, percentual, falta, ganhoDia, usaMetaGeral, metaAtingida, contabilizaMeta, detalhes }: { catador?: CatadorApi; cooperativa?: CooperativaApi; ponto?: Referencia; material?: MaterialApi; peso: number; valor: number; dataHora: string; status: StatusPesagem; percentual: number; falta: number; ganhoDia: number; usaMetaGeral: boolean; metaAtingida: boolean; contabilizaMeta: boolean; detalhes: DetalheMetaGeralApi[] }) {
  const semMeta = !usaMetaGeral && Number(material?.meta_diaria ?? 0) <= 0;
  const foraDaMeta = !contabilizaMeta;
  const pagamentoVisivel = status === "concluida" && (foraDaMeta || semMeta || metaAtingida);
  return <div className="resumo-pesagem"><div className="linha-resumo"><span>Código do catador e nome</span><strong>{catador?.codigo} — {catador?.nome_completo}</strong></div><div className="linha-resumo"><span>Cooperativa / associação</span><strong>{cooperativa?.nome}</strong></div><div className="linha-resumo"><span>Central / ponto</span><strong>{ponto?.nome}</strong></div><div className="linha-resumo"><span>Material</span><strong>{material?.nome}</strong></div><div className="linha-resumo"><span>Peso</span><strong>{peso.toLocaleString("pt-BR")} {material?.unidade}</strong></div><div className="linha-resumo"><span>Data e hora</span><strong>{dataHora ? new Date(dataHora).toLocaleString("pt-BR") : "—"}</strong></div><div className="linha-resumo"><span>Status</span><strong className={`status-pesagem ${status}`}>{rotulosStatus[status]}</strong></div><div className="linha-resumo"><span>Regra de pagamento</span><strong>{foraDaMeta ? "Fora da meta · pagamento imediato" : semMeta ? "Sem meta específica" : usaMetaGeral ? "Contabiliza na meta geral" : "Contabiliza na meta do material"}</strong></div>{!foraDaMeta && <div className="linha-resumo"><span>{usaMetaGeral ? "Meta geral após registro" : "Meta após registro"}</span><strong>{semMeta ? "Sem meta · pagamento imediato" : `${Math.round(percentual)}% · ${falta > 0 ? `faltam ${falta.toLocaleString("pt-BR")} kg` : "atingida"}`}</strong></div>}{pagamentoVisivel ? <>{!foraDaMeta && <><div className="linha-resumo"><span>Total liberado no dia</span><strong>{dinheiro(ganhoDia)}</strong></div>{usaMetaGeral && <DetalhesPagamento detalhes={detalhes} />}</>}<div className="total-pesagem"><span>{foraDaMeta ? "Pagamento imediato desta pesagem" : "Valor liberado nesta pesagem"}</span><strong>{dinheiro(valor)}</strong></div></> : <div className="valor-sujeito-meta"><strong>Valores sujeitos ao atingimento da meta</strong><span>Nenhum valor será exibido ou contabilizado antes do alvo.</span></div>}</div>;
}

function atualizarDetalhesMetaGeral(atuais: DetalheMetaGeralApi[], material: MaterialApi | undefined, peso: number, pesoMeta: number, pesoExcedente: number, guardarExcedente: boolean, premio: number, valorExcedente: number) {
  if (!material || peso <= 0) return atuais;
  const existente = atuais.find((item) => item.material_uuid === material.uuid);
  const valorBruto = Math.round((peso / Number(material.quantidade_referencia) * Number(material.valor_referencia)) * 100) / 100;
  const atualizado: DetalheMetaGeralApi = existente ? {
    ...existente,
    peso: Number(existente.peso) + peso,
    peso_meta: Number(existente.peso_meta) + pesoMeta,
    peso_excedente_pago: Number(existente.peso_excedente_pago) + (guardarExcedente ? 0 : pesoExcedente),
    peso_excedente_credito: Number(existente.peso_excedente_credito) + (guardarExcedente ? pesoExcedente : 0),
    valor_bruto: Number(existente.valor_bruto) + valorBruto,
    valor_liberado: Number(existente.valor_liberado) + valorExcedente,
    valor_premio: Number(existente.valor_premio) + premio,
  } : {
    material_uuid: material.uuid, nome: material.nome, unidade: material.unidade, peso, peso_meta: pesoMeta,
    peso_excedente_pago: guardarExcedente ? 0 : pesoExcedente,
    peso_excedente_credito: guardarExcedente ? pesoExcedente : 0,
    valor_bruto: valorBruto, valor_liberado: valorExcedente, valor_premio: premio,
  };
  return [...atuais.filter((item) => item.material_uuid !== material.uuid), atualizado].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function DetalhesPagamento({ detalhes }: { detalhes: DetalheMetaGeralApi[] }) {
  return <div className="detalhes-pagamento-meta"><strong>Liquidação detalhada</strong>{detalhes.map((item) => <div key={item.material_uuid}><span>{item.nome} · {Number(item.peso_meta).toLocaleString("pt-BR")} {item.unidade} na meta{Number(item.peso_excedente_credito) > 0 ? ` · ${Number(item.peso_excedente_credito).toLocaleString("pt-BR")} guardados` : ""}</span><b>{dinheiro(Number(item.valor_premio) + Number(item.valor_liberado))}</b></div>)}</div>;
}

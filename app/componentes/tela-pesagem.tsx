"use client";

/* eslint-disable @next/next/no-img-element -- foto autenticada fornecida pela API */

import { useEffect, useMemo, useState } from "react";
import { Check, Search, ShieldCheck, X } from "lucide-react";
import { requisitarApi, URL_API, type CatadorApi, type MaterialApi } from "@/app/dados/api";

type Referencia = { uuid: string; nome: string };
type StatusPesagem = "concluida" | "agendada" | "cancelada";

function dataHoraLocalAtual() {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const rotulosStatus: Record<StatusPesagem, string> = { concluida: "Concluída", agendada: "Agendada", cancelada: "Cancelada" };

export function TelaPesagem() {
  const [etapa, setEtapa] = useState(0);
  const [catadores, setCatadores] = useState<CatadorApi[]>([]);
  const [materiais, setMateriais] = useState<MaterialApi[]>([]);
  const [pontos, setPontos] = useState<Referencia[]>([]);
  const [responsaveis, setResponsaveis] = useState<Referencia[]>([]);
  const [pontoUuid, setPontoUuid] = useState("");
  const [responsavelUuid, setResponsavelUuid] = useState("");
  const [responsavelOutro, setResponsavelOutro] = useState("");
  const [catadorUuid, setCatadorUuid] = useState("");
  const [materialUuid, setMaterialUuid] = useState("");
  const [peso, setPeso] = useState("");
  const [observacao, setObservacao] = useState("");
  const [dataHora, setDataHora] = useState(dataHoraLocalAtual);
  const [status, setStatus] = useState<StatusPesagem>("concluida");
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const [codigoRegistrado, setCodigoRegistrado] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    void Promise.all([
      requisitarApi<{ dados: CatadorApi[] }>("/api/catadores?limite=100"),
      requisitarApi<{ dados: MaterialApi[] }>("/api/materiais"),
      requisitarApi<{ dados: Referencia[] }>("/api/pontos-apoio"),
      requisitarApi<{ dados: Referencia[] }>("/api/responsaveis-pesagem"),
    ]).then(([c, m, p, r]) => {
      setCatadores(c.dados.filter((item) => item.status === "ativo"));
      setMateriais(m.dados.filter((item) => item.status === "ativo"));
      setPontos(p.dados);
      setResponsaveis(r.dados);
      setPontoUuid(p.dados[0]?.uuid ?? "");
    }).catch((falha) => setErro(falha instanceof Error ? falha.message : "Não foi possível carregar os dados."));
  }, []);

  const catador = catadores.find((item) => item.uuid === catadorUuid);
  const material = materiais.find((item) => item.uuid === materialUuid);
  const ponto = pontos.find((item) => item.uuid === pontoUuid);
  const pesoNumero = Number(peso.replace(",", "."));
  const valor = useMemo(() => material && pesoNumero > 0 ? pesoNumero / Number(material.quantidade_referencia) * Number(material.valor_referencia) : 0, [material, pesoNumero]);
  const responsavelValido = responsavelUuid === "outro" ? responsavelOutro.trim().length >= 2 : Boolean(responsavelUuid);
  const dataHoraValida = Boolean(dataHora) && !Number.isNaN(new Date(dataHora).getTime());

  async function registrar() {
    if (!catador || !material || !pontoUuid || !responsavelValido || pesoNumero <= 0 || !dataHoraValida) return;
    setSalvando(true);
    setErro("");
    try {
      const resposta = await requisitarApi<{ codigo: string }>("/api/pesagens", {
        method: "POST",
        body: JSON.stringify({
          catadorUuid,
          pontoApoioUuid: pontoUuid,
          responsavelPesagemUuid: responsavelUuid === "outro" ? undefined : responsavelUuid,
          responsavelOutro: responsavelUuid === "outro" ? responsavelOutro.trim() : undefined,
          materialUuid,
          peso: pesoNumero,
          observacao: observacao.trim() || undefined,
          dataHora: new Date(dataHora).toISOString(),
          status,
        }),
      });
      setConfirmacaoAberta(false);
      setCodigoRegistrado(resposta.codigo);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível registrar a pesagem.");
    } finally {
      setSalvando(false);
    }
  }

  function reiniciar() {
    setEtapa(0);
    setCatadorUuid("");
    setMaterialUuid("");
    setPeso("");
    setObservacao("");
    setDataHora(dataHoraLocalAtual());
    setStatus("concluida");
    setCodigoRegistrado("");
  }

  if (codigoRegistrado) return <div className="painel sucesso-pesagem"><span><Check /></span><h2>Pesagem registrada com sucesso!</h2><p>O registro <strong>{codigoRegistrado}</strong> foi salvo como <strong>{rotulosStatus[status]}</strong> e já está disponível nos relatórios.</p><div><button type="button" className="botao-secundario" onClick={reiniciar}>Registrar outra</button></div></div>;

  const podeContinuar = !((etapa === 0 && (!pontoUuid || !responsavelValido)) || (etapa === 1 && !catador) || (etapa === 2 && (!material || pesoNumero <= 0 || !dataHoraValida)));

  return <section className="pagina-interna pesagem">
    <div className="progresso-pesagem">{["Local e responsável", "Confirmar catador", "Material e dados", "Revisar"].map((item, i) => <div className={i === etapa ? "atual" : i < etapa ? "feito" : ""} key={item}><span>{i < etapa ? "✓" : i + 1}</span><small>{item}</small></div>)}</div>
    <div className="painel formulario-pesagem">
      {etapa === 0 && <div className="animar-etapa"><span className="sobrelinha">ETAPA 1 DE 4</span><h2>Onde a pesagem está acontecendo?</h2><p>Selecione referências cadastradas no banco de dados.</p><div className="grade-formulario espacada"><label className="campo">Central / ponto de apoio<select value={pontoUuid} onChange={(e) => setPontoUuid(e.target.value)}><option value="">Selecionar</option>{pontos.map((item) => <option value={item.uuid} key={item.uuid}>{item.nome}</option>)}</select></label><label className="campo">Responsável pela pesagem<select value={responsavelUuid} onChange={(e) => setResponsavelUuid(e.target.value)}><option value="">Selecionar</option>{responsaveis.map((item) => <option value={item.uuid} key={item.uuid}>{item.nome}</option>)}<option value="outro">Outro</option></select></label>{responsavelUuid === "outro" && <label className="campo campo-largo">Nome do responsável<input value={responsavelOutro} onChange={(e) => setResponsavelOutro(e.target.value)} /></label>}</div></div>}
      {etapa === 1 && <div className="animar-etapa"><span className="sobrelinha">ETAPA 2 DE 4</span><h2>Quem está entregando o material?</h2><p>Confira a identidade antes de prosseguir.</p><label className="campo-busca busca-grande"><Search /><select value={catadorUuid} onChange={(e) => setCatadorUuid(e.target.value)} aria-label="Buscar catador"><option value="">Buscar catador...</option>{catadores.map((item) => <option value={item.uuid} key={item.uuid}>{item.codigo} — {item.nome_completo}</option>)}</select></label>{catador && <div className="confirmar-catador">{catador.tem_foto ? <img className="foto-catador" src={`${URL_API}/api/catadores/${catador.uuid}/foto`} alt={`Foto de ${catador.nome_completo}`} /> : <div className="foto-catador">{catador.nome_completo.split(/\s+/).slice(0, 2).map((p) => p[0]).join("")}</div>}<div><span className="status ativo">● Cadastro ativo</span><h3>{catador.nome_completo}</h3><p><code>{catador.codigo}</code> · {catador.cooperativa ?? "Sem cooperativa"}</p><p>{catador.contatos[0]?.valor ?? "Contato não informado"}</p></div><div className="selo-confirmacao"><span><Check /></span><small>Identidade conferida</small></div></div>}</div>}
      {etapa === 2 && <div className="animar-etapa"><span className="sobrelinha">ETAPA 3 DE 4</span><h2>Material, peso e situação</h2><p>O valor é calculado com a configuração atual do material.</p><div className="grade-materiais">{materiais.map((item) => <button type="button" className={materialUuid === item.uuid ? "cartao-material selecionado" : "cartao-material"} onClick={() => setMaterialUuid(item.uuid)} key={item.uuid}><span>{item.tipo_material.slice(0, 2).toUpperCase()}</span><strong>{item.nome}</strong><small>{Number(item.valor_referencia).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} / {Number(item.quantidade_referencia)} {item.unidade}</small>{materialUuid === item.uuid && <i>✓</i>}</button>)}</div><div className="grade-formulario espacada"><label className="campo campo-peso">Peso do material<div><input value={peso} onChange={(e) => setPeso(e.target.value)} inputMode="decimal" placeholder="0,00" /><span>{material?.unidade.toUpperCase() ?? "KG"}</span></div></label><label className="campo">Data e hora<input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} /></label><label className="campo">Status<select value={status} onChange={(e) => setStatus(e.target.value as StatusPesagem)}><option value="concluida">Concluída</option><option value="agendada">Agendada</option><option value="cancelada">Cancelada</option></select></label><label className="campo campo-largo">Observação <small>Opcional</small><textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} /></label></div></div>}
      {etapa === 3 && <div className="animar-etapa"><span className="sobrelinha">ETAPA 4 DE 4</span><h2>Revise antes de registrar</h2><ResumoPesagem catador={catador} ponto={ponto} material={material} peso={pesoNumero} valor={valor} dataHora={dataHora} status={status} /></div>}
      {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
      <footer className="rodape-fluxo"><button type="button" className="botao-secundario" disabled={etapa === 0} onClick={() => setEtapa((v) => Math.max(0, v - 1))}>← Voltar</button><button type="button" className="botao-primario" disabled={salvando || !podeContinuar} onClick={etapa === 3 ? () => setConfirmacaoAberta(true) : () => setEtapa((v) => Math.min(3, v + 1))}>{etapa === 3 ? "Confirmar dados" : "Continuar →"}</button></footer>
    </div>

    {confirmacaoAberta && <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-confirmar-pesagem"><div className="modal pequeno modal-confirmacao-pesagem"><header className="cabecalho-modal"><div><span>CONFIRMAÇÃO FINAL</span><h2 id="titulo-confirmar-pesagem">Registrar esta pesagem?</h2><p>Confira novamente. Depois será possível corrigir, mas a alteração ficará registrada na auditoria.</p></div><button type="button" onClick={() => setConfirmacaoAberta(false)} aria-label="Fechar"><X /></button></header><div className="selo-auditoria"><ShieldCheck /><span><strong>Registro protegido por auditoria</strong><small>Data, usuário e alterações serão preservados.</small></span></div><ResumoPesagem catador={catador} ponto={ponto} material={material} peso={pesoNumero} valor={valor} dataHora={dataHora} status={status} /><footer className="rodape-modal"><button type="button" className="botao-secundario" onClick={() => setConfirmacaoAberta(false)} disabled={salvando}>Voltar e corrigir</button><button type="button" className="botao-primario" onClick={() => void registrar()} disabled={salvando}>{salvando ? "Registrando..." : "Sim, registrar"}</button></footer></div></div>}
  </section>;
}

function ResumoPesagem({ catador, ponto, material, peso, valor, dataHora, status }: { catador?: CatadorApi; ponto?: Referencia; material?: MaterialApi; peso: number; valor: number; dataHora: string; status: StatusPesagem }) {
  return <div className="resumo-pesagem"><div className="linha-resumo"><span>Código do catador</span><strong>{catador?.codigo}</strong></div><div className="linha-resumo"><span>Nome</span><strong>{catador?.nome_completo}</strong></div><div className="linha-resumo"><span>Central / ponto</span><strong>{ponto?.nome}</strong></div><div className="linha-resumo"><span>Material</span><strong>{material?.nome}</strong></div><div className="linha-resumo"><span>Peso</span><strong>{peso.toLocaleString("pt-BR")} {material?.unidade}</strong></div><div className="linha-resumo"><span>Data e hora</span><strong>{dataHora ? new Date(dataHora).toLocaleString("pt-BR") : "—"}</strong></div><div className="linha-resumo"><span>Status</span><strong className={`status-pesagem ${status}`}>{rotulosStatus[status]}</strong></div><div className="total-pesagem"><span>Valor total calculado</span><strong>{valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div></div>;
}

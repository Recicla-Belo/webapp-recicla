"use client";

/* eslint-disable jsx-a11y/label-has-associated-control, jsx-a11y/no-autofocus, @next/next/no-img-element -- controles aninhados e fotos autenticadas */

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { AlertTriangle, ArrowLeft, Banknote, Camera, Eye, FileSpreadsheet, LoaderCircle, LockKeyhole, Pencil, Plus, Search, Trash2, UnlockKeyhole, UserCheck, UserX, WalletCards, X } from "lucide-react";
import { baixarArquivoApi, requisitarApi, URL_API, type CatadorApi, type CooperativaApi, type MaterialApi, type PontoApoioApi, type ResponsavelPesagemApi } from "@/app/dados/api";
import { Paginacao } from "@/app/componentes/paginacao";
import { ModalConfirmacao } from "@/app/componentes/modal-confirmacao";
import { ModalExclusaoAdministrativa } from "@/app/componentes/modal-exclusao-administrativa";
import { ModalPagamentoCatador, ModalReciboPagamento, type ContaRecebimento, type ReciboPagamento } from "@/app/componentes/modal-pagamento-catador";
import { useTermoBusca } from "@/app/utilitarios/use-termo-busca";

const etapas = ["Identificação", "Contato e endereço", "Pagamento", "Foto e revisão"];
const vazio = { nomeCompleto: "", apelido: "", cooperativaUuid: "", genero: "", racaCor: "", dataNascimento: "", cpf: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "Belo Horizonte", estado: "MG", tipoPagamento: "pix", tipoChavePix: "CPF", chavePix: "", banco: "", agencia: "", numeroConta: "", tipoConta: "corrente", nomeTitular: "", cpfTitular: "", relacaoTitular: "" };

type AcessosCatadores = { administrador: boolean; cadastrar: boolean; editar: boolean; excluir: boolean; gerenciarCaixa: boolean; exportar: boolean; pagar: boolean };

export function TelaCatadores({ acessos }: { acessos: AcessosCatadores }) {
  const [catadores, setCatadores] = useState<CatadorApi[]>([]);
  const [cooperativas, setCooperativas] = useState<CooperativaApi[]>([]);
  const [busca, setBusca] = useState("");
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [catadorEdicao, setCatadorEdicao] = useState<PerfilApi | null>(null);
  const [catadorExclusao, setCatadorExclusao] = useState<CatadorApi | null>(null);
  const [motivoExclusao, setMotivoExclusao] = useState("");
  const [processandoExclusao, setProcessandoExclusao] = useState(false);
  const [perfilUuid, setPerfilUuid] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [pagina, setPagina] = useState(1);
  const [itensPorPagina, setItensPorPagina] = useState(10);
  const [total, setTotal] = useState(0);
  const [alterandoStatus, setAlterandoStatus] = useState<CatadorApi | null>(null);
  const [processandoStatus, setProcessandoStatus] = useState(false);
  const [confirmandoExportacao, setConfirmandoExportacao] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [mensagemExportacao, setMensagemExportacao] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [carregandoEdicaoUuid, setCarregandoEdicaoUuid] = useState<string | null>(null);
  const termoBusca = useTermoBusca(busca);
  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [listaCatadores, listaCooperativas] = await Promise.all([
        requisitarApi<{ dados: CatadorApi[]; total: number }>(`/api/catadores?busca=${encodeURIComponent(termoBusca)}&limite=${itensPorPagina}&deslocamento=${(pagina - 1) * itensPorPagina}`),
        requisitarApi<{ dados: CooperativaApi[] }>("/api/cooperativas"),
      ]);
      setCatadores(listaCatadores.dados); setTotal(listaCatadores.total); setCooperativas(listaCooperativas.dados); setErro("");
    } catch (falha) { setErro(falha instanceof Error ? falha.message : "Não foi possível carregar os catadores."); }
    finally { setCarregando(false); }
  }, [itensPorPagina, pagina, termoBusca]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void carregar(); }, [carregar]);

  async function abrirEdicao(uuid: string) {
    if (carregandoEdicaoUuid) return;
    setErro(""); setCarregandoEdicaoUuid(uuid);
    try { setCatadorEdicao(await requisitarApi<PerfilApi>(`/api/catadores/${uuid}/perfil`)); }
    catch (falha) { setErro(falha instanceof Error ? falha.message : "Não foi possível carregar os dados para edição."); if (perfilUuid) setPerfilUuid(null); }
    finally { setCarregandoEdicaoUuid(null); }
  }

  function abrirExclusao(catador: CatadorApi) {
    setErro("");
    setCatadorExclusao(catador);
    setMotivoExclusao("");
  }

  async function excluirCatador() {
    if (!catadorExclusao || motivoExclusao.trim().length < 3) return;
    setProcessandoExclusao(true); setErro("");
    try {
      await requisitarApi(`/api/catadores/${catadorExclusao.uuid}`, { method: "DELETE", body: JSON.stringify({ confirmacao: true, motivo: motivoExclusao.trim() }) });
      setCatadores((lista) => lista.filter((item) => item.uuid !== catadorExclusao.uuid));
      setTotal((quantidade) => Math.max(0, quantidade - 1));
      setPerfilUuid(null); setCatadorEdicao(null); setCatadorExclusao(null); setMotivoExclusao(""); setPagina(1);
    } catch (falha) { setErro(falha instanceof Error ? falha.message : "Não foi possível excluir o catador."); }
    finally { setProcessandoExclusao(false); }
  }

  async function confirmarAlteracaoStatus() {
    if (!alterandoStatus) return;
    setProcessandoStatus(true); setErro("");
    try {
      await requisitarApi(`/api/catadores/${alterandoStatus.uuid}/status`, { method: "PATCH", body: JSON.stringify({ ativo: alterandoStatus.status !== "ativo" }) });
      setAlterandoStatus(null); await carregar();
    } catch (falha) { setErro(falha instanceof Error ? falha.message : "Não foi possível alterar o status do catador."); }
    finally { setProcessandoStatus(false); }
  }

  async function exportarCatadores() {
    if (exportando) return;
    setExportando(true); setErro(""); setMensagemExportacao("");
    try {
      const { arquivo, nome } = await baixarArquivoApi("/api/catadores/exportar", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      const url = URL.createObjectURL(arquivo);
      const link = document.createElement("a");
      link.href = url; link.download = nome; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setConfirmandoExportacao(false);
      setMensagemExportacao(`Arquivo ${nome} gerado com todos os catadores cadastrados.`);
    } catch (falha) { setErro(falha instanceof Error ? falha.message : "Não foi possível exportar os catadores em Excel."); }
    finally { setExportando(false); }
  }

  const formularioEdicao = acessos.editar && catadorEdicao && <CadastroCatador cooperativas={cooperativas} edicao={catadorEdicao} onFechar={() => setCatadorEdicao(null)} onSalvo={async () => { await carregar(); if (perfilUuid) setPerfilUuid(null); }} />;
  const modalExclusao = acessos.excluir && catadorExclusao && <ModalExclusaoCatador catador={catadorExclusao} motivo={motivoExclusao} erro={erro} processando={processandoExclusao} aoMudarMotivo={setMotivoExclusao} aoFechar={() => setCatadorExclusao(null)} aoConfirmar={() => void excluirCatador()} />;
  if (perfilUuid) return <><PerfilCatador uuid={perfilUuid} acessos={acessos} onVoltar={() => { setPerfilUuid(null); void carregar(); }} onEditar={() => void abrirEdicao(perfilUuid)} onExcluir={abrirExclusao} />{formularioEdicao}{modalExclusao}</>;

  return <section className="pagina-interna">
    <div className="resumo-pagina"><div><h2>{total} catadores cadastrados</h2><p>Somente o nome completo é obrigatório; os demais dados são opcionais e vêm do PostgreSQL.</p></div><div className="acoes-resumo-catadores">{acessos.exportar && <button className="botao-secundario" type="button" disabled={exportando} onClick={() => { if (!exportando) { setConfirmandoExportacao(true); setErro(""); setMensagemExportacao(""); } }}>{exportando ? <LoaderCircle className="icone-carregando" /> : <FileSpreadsheet />} {exportando ? "Preparando Excel..." : "Exportar Excel"}</button>}{acessos.cadastrar && <button className="botao-primario" disabled={carregando} onClick={() => setCadastroAberto(true)}><Plus /> Cadastrar catador</button>}</div></div>
    {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
    {mensagemExportacao && <p className="mensagem-sucesso" role="status">{mensagemExportacao}</p>}
    <div className="barra-ferramentas"><label className="campo-busca"><Search /><input value={busca} onChange={(evento) => { setBusca(evento.target.value); setPagina(1); }} placeholder="Buscar por nome, apelido ou código..." /></label></div>
    <div className="tabela-responsiva"><table><thead><tr><th>Catador</th><th>Código</th><th>Cooperativa</th><th>Contato e endereço</th><th>Coletado e ganho</th><th>Meta / ciclo atual</th><th>Ações</th></tr></thead><tbody>{catadores.map((catador) => <tr key={catador.uuid} className={catador.status === "inativo" ? "registro-inativo" : ""}><td><div className="pessoa">{catador.tem_foto ? <img className="foto-lista" src={`${URL_API}/api/catadores/${catador.uuid}/foto`} alt={`Foto de ${catador.nome_completo}`} /> : <span>{iniciais(catador.nome_completo)}</span>}<div><strong>{catador.nome_completo}</strong><small>{catador.apelido ? `Prefere: ${catador.apelido}` : "Sem apelido informado"}</small><em className={catador.status === "ativo" ? "status ativo" : "status"}>● {catador.status}</em></div></div></td><td><code>{catador.codigo}</code></td><td>{catador.cooperativa ?? "Sem vínculo"}</td><td><strong>{catador.contatos.map((item) => item.valor).join(" · ") || "Contato não informado"}</strong><small className="texto-bloco">{catador.endereco_resumo || "Endereço não informado"}</small></td><td><strong>{Number(catador.total_quilos).toLocaleString("pt-BR")} kg</strong><small className="texto-bloco valor-verde">{Number(catador.total_ganhos).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</small></td><td><BarraMeta percentual={Number(catador.percentual_meta_hoje)} texto={`${Number(catador.peso_hoje).toLocaleString("pt-BR")} / ${Number(catador.meta_hoje).toLocaleString("pt-BR")} kg`} /><span className={`status-caixa ${catador.status_caixa_hoje}`}>Ciclo {catador.status_caixa_hoje}</span></td><td><div className="acoes-catador"><button type="button" disabled={Boolean(carregandoEdicaoUuid)} onClick={() => setPerfilUuid(catador.uuid)} aria-label={`Ver ficha de ${catador.nome_completo}`} title="Ver ficha"><Eye /></button>{acessos.editar && <><button type="button" disabled={Boolean(carregandoEdicaoUuid)} onClick={() => void abrirEdicao(catador.uuid)} aria-label={`Editar ${catador.nome_completo}`} title="Editar">{carregandoEdicaoUuid === catador.uuid ? <LoaderCircle className="icone-carregando" /> : <Pencil />}</button><button type="button" disabled={Boolean(carregandoEdicaoUuid)} onClick={() => setAlterandoStatus(catador)} aria-label={`${catador.status === "ativo" ? "Inativar" : "Ativar"} ${catador.nome_completo}`} title={catador.status === "ativo" ? "Inativar" : "Ativar"}>{catador.status === "ativo" ? <UserX /> : <UserCheck />}</button></>}{acessos.excluir && <button type="button" className="perigoso" disabled={Boolean(carregandoEdicaoUuid)} onClick={() => abrirExclusao(catador)} aria-label={`Excluir ${catador.nome_completo}`} title="Excluir"><Trash2 /></button>}</div></td></tr>)}</tbody></table>{carregando ? <p className="estado-carregando" role="status"><LoaderCircle className="icone-carregando" /> Carregando catadores...</p> : catadores.length === 0 && <p className="estado-vazio">Nenhum catador encontrado.</p>}</div>
    <Paginacao pagina={pagina} total={total} itensPorPagina={itensPorPagina} aoMudarPagina={setPagina} aoMudarQuantidade={(quantidade) => { setItensPorPagina(quantidade); setPagina(1); }} rotulo="catadores" />
    {acessos.cadastrar && cadastroAberto && <CadastroCatador cooperativas={cooperativas} onFechar={() => setCadastroAberto(false)} onSalvo={carregar} />}
    {formularioEdicao}
    {modalExclusao}
    <ModalConfirmacao aberto={acessos.editar && Boolean(alterandoStatus)} titulo={`${alterandoStatus?.status === "ativo" ? "Inativar" : "Ativar"} ${alterandoStatus?.nome_completo ?? "catador"}?`} descricao={alterandoStatus?.status === "ativo" ? "O cadastro e o histórico serão preservados, mas o catador não poderá ser selecionado em novas pesagens." : "O catador voltará a aparecer nas buscas de novas pesagens."} textoConfirmar={alterandoStatus?.status === "ativo" ? "Inativar catador" : "Ativar catador"} perigoso={alterandoStatus?.status === "ativo"} processando={processandoStatus} aoFechar={() => setAlterandoStatus(null)} aoConfirmar={() => void confirmarAlteracaoStatus()} />
    <ModalConfirmacao aberto={acessos.exportar && confirmandoExportacao} titulo="Exportar todos os catadores em Excel?" descricao="O arquivo terá uma aba para produção de crachás e abas com cadastro completo, contatos e dados de pagamento. Como contém informações pessoais e financeiras, mantenha-o somente com pessoas autorizadas." textoConfirmar="Gerar arquivo Excel" processando={exportando} aoFechar={() => setConfirmandoExportacao(false)} aoConfirmar={() => void exportarCatadores()} />
  </section>;
}

function iniciais(nome: string) { return nome.split(/\s+/).slice(0, 2).map((parte) => parte[0]).join("").toUpperCase(); }
function somenteNumeros(valor: string) { return valor.replace(/\D/g, ""); }
function formatarCpf(valor: string) {
  return somenteNumeros(valor).slice(0, 11)
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

type EnderecoPerfil = { cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; estado: string | null; referencia?: string | null };
type ContaFinanceiraPerfil = ContaRecebimento;
type PesagemHistorico = {
  uuid: string; codigo: string; data_hora: string; status: "concluida" | "agendada" | "cancelada"; peso_total: number; valor_total: number;
  catador_uuid: string; cooperativa_uuid: string; ponto_apoio_uuid: string; responsavel_pesagem_uuid: string | null; responsavel_outro: string | null;
  observacao: string | null; material_uuid: string; contabiliza_meta: boolean; guardar_excedente_meta: boolean;
  material: string; ponto_apoio: string; cooperativa: string | null; responsavel: string;
};

type PerfilApi = {
  catador: Omit<CatadorApi, "contatos"> & { cooperativa_uuid: string | null; genero: string | null; raca_cor: string | null; data_nascimento: string | null; cpf: string | null; endereco: EnderecoPerfil | null; contas_financeiras: ContaFinanceiraPerfil[]; contatos: Array<{ tipo: string; valor: string; principal?: boolean }> };
  resumo: { peso_total: number; ganho_total: number; valor_pago: number; saldo_pendente: number; pesagens: number };
  materiais: Array<{ uuid: string; nome: string; peso_total: number; ganho_total: number; pesagens: number }>;
  metas: Array<{ data: string; nome: string; peso: number; meta: number; percentual: number; atingida: boolean; ganho: number }>;
  caixas: Array<{ uuid: string; data_caixa: string; status: "aberto" | "fechado"; aberto_em: string; fechado_em: string | null; reaberto_em: string | null; motivo_reabertura: string | null; aberto_por: string | null; fechado_por: string | null; reaberto_por: string | null; peso: number; valor: number; movimentacoes: number }>;
  historico: PesagemHistorico[];
  pagamentos: ReciboPagamento[];
};

function BarraMeta({ percentual, texto }: { percentual: number; texto: string }) {
  return <div className="barra-meta-compacta" aria-label={`Progresso da meta: ${Math.round(percentual)}%`}><div><i style={{ width: `${Math.min(Math.max(percentual, 0), 100)}%` }} /></div><small>{texto} · {Math.round(percentual)}%</small></div>;
}

function PerfilCatador({ uuid, acessos, onVoltar, onEditar, onExcluir }: { uuid: string; acessos: AcessosCatadores; onVoltar: () => void; onEditar: () => void; onExcluir: (catador: CatadorApi) => void }) {
  const [dados, setDados] = useState<PerfilApi | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [pagamentoAberto, setPagamentoAberto] = useState(false);
  const [reciboAberto, setReciboAberto] = useState<ReciboPagamento | null>(null);
  const [acaoCaixa, setAcaoCaixa] = useState<"fechar" | "reabrir" | null>(null);
  const [motivoReabertura, setMotivoReabertura] = useState("");
  const [paginaMetas, setPaginaMetas] = useState(1);
  const [paginaCaixas, setPaginaCaixas] = useState(1);
  const [paginaHistorico, setPaginaHistorico] = useState(1);
  const [paginaPagamentos, setPaginaPagamentos] = useState(1);
  const [pesagensSelecionadas, setPesagensSelecionadas] = useState<string[]>([]);
  const [pesagensExcluir, setPesagensExcluir] = useState<PesagemHistorico[]>([]);
  const [pesagemEditar, setPesagemEditar] = useState<PesagemHistorico | null>(null);
  const [processandoPesagens, setProcessandoPesagens] = useState(false);
  const [erroPesagens, setErroPesagens] = useState("");
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setDados(await requisitarApi<PerfilApi>(`/api/catadores/${uuid}/perfil`)); setPesagensSelecionadas([]); setErro(""); }
    catch (falha) { setErro(falha instanceof Error ? falha.message : "Não foi possível carregar a ficha do catador."); }
    finally { setCarregando(false); }
  }, [uuid]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carregamento da ficha ao trocar o catador
  useEffect(() => { void carregar(); }, [carregar]);

  async function alterarCaixa(acao: "fechar" | "reabrir") {
    const motivo = acao === "reabrir" ? motivoReabertura.trim() : undefined;
    if (acao === "reabrir" && (!motivo || motivo.length < 3)) return;
    setProcessando(true); setErro("");
    try {
      const dataCiclo = String(caixaHoje?.data_caixa ?? hoje).slice(0, 10);
      await requisitarApi(`/api/catadores/${uuid}/caixa/${acao}`, { method: "POST", body: JSON.stringify({ data: dataCiclo, motivo }) });
      setAcaoCaixa(null); setMotivoReabertura(""); await carregar();
    } catch (falha) { setErro(falha instanceof Error ? falha.message : "Não foi possível alterar o caixa."); }
    finally { setProcessando(false); }
  }

  async function excluirPesagens(dadosConfirmacao: { senhaAtual: string; confirmacao: string; motivo: string }) {
    if (!acessos.administrador || pesagensExcluir.length === 0) return;
    setProcessandoPesagens(true); setErroPesagens("");
    try {
      await requisitarApi("/api/administrador/pesagens", {
        method: "DELETE",
        body: JSON.stringify({ ...dadosConfirmacao, pesagensUuids: pesagensExcluir.map((item) => item.uuid) }),
      });
      setPesagensExcluir([]); await carregar();
    } catch (falha) { setErroPesagens(falha instanceof Error ? falha.message : "Não foi possível excluir e recalcular as pesagens."); }
    finally { setProcessandoPesagens(false); }
  }

  if (!dados) return <section className="pagina-interna"><button className="botao-secundario" onClick={onVoltar}><ArrowLeft /> Voltar</button><div className="painel estado-pagina">{erro || <span className="estado-carregando"><LoaderCircle className="icone-carregando" /> Carregando ficha completa...</span>}</div></section>;
  const { catador, resumo } = dados;
  const caixaHoje = dados.caixas.find((item) => item.status === "aberto") ?? dados.caixas.find((item) => String(item.data_caixa).slice(0, 10) === hoje);
  const endereco = catador.endereco;
  const itensPerfil = 8;
  const metasPaginadas = dados.metas.slice((paginaMetas - 1) * itensPerfil, paginaMetas * itensPerfil);
  const caixasPaginados = dados.caixas.slice((paginaCaixas - 1) * itensPerfil, paginaCaixas * itensPerfil);
  const historicoPaginado = dados.historico.slice((paginaHistorico - 1) * itensPerfil, paginaHistorico * itensPerfil);
  const pagamentosPaginados = dados.pagamentos.slice((paginaPagamentos - 1) * itensPerfil, paginaPagamentos * itensPerfil);
  return <section className="pagina-interna ficha-catador">
    <div className="barra-ficha"><button className="botao-secundario" onClick={onVoltar}><ArrowLeft /> Voltar aos catadores</button><div className="acoes-ficha-catador"><div className="acoes-caixa"><span className={`status-caixa ${caixaHoje?.status ?? "aberto"}`}>Ciclo atual {caixaHoje?.status ?? "aberto"}</span>{acessos.gerenciarCaixa && (caixaHoje?.status === "fechado" ? <button className="botao-primario" disabled={processando || carregando} onClick={() => { setMotivoReabertura(""); setAcaoCaixa("reabrir"); }}><UnlockKeyhole /> Reabrir ciclo</button> : <button className="botao-primario" disabled={processando || carregando} onClick={() => setAcaoCaixa("fechar")}><LockKeyhole /> Fechar ciclo</button>)}</div>{acessos.pagar && <button className="botao-pagamento" type="button" disabled={Number(resumo.saldo_pendente) <= 0 || processando || carregando} onClick={() => setPagamentoAberto(true)}><Banknote /> {Number(resumo.saldo_pendente) > 0 ? "Registrar pagamento" : "Sem saldo pendente"}</button>}{acessos.editar && <button className="botao-secundario" type="button" disabled={carregando} onClick={onEditar}><Pencil /> Editar cadastro</button>}{acessos.excluir && <button className="botao-perigo" type="button" disabled={carregando} onClick={() => onExcluir(catador)}><Trash2 /> Excluir catador</button>}</div></div>
    {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
    <header className="painel cabecalho-ficha">{catador.tem_foto ? <img src={`${URL_API}/api/catadores/${uuid}/foto`} alt={`Foto de ${catador.nome_completo}`} /> : <span>{iniciais(catador.nome_completo)}</span>}<div><small>FICHA COMPLETA DO CATADOR</small><h2>{catador.nome_completo}</h2><p><code>{catador.codigo}</code> · {catador.apelido || "Sem apelido"} · {catador.cooperativa || "Sem cooperativa"}</p><div className="chips-ficha"><b>{catador.status}</b><b>{catador.contatos.length} contato(s)</b></div></div></header>
    <div className="grade-resumo-relatorio resumo-ficha"><article><span>KG</span><div><small>Total coletado</small><strong>{Number(resumo.peso_total).toLocaleString("pt-BR")} kg</strong></div></article><article><span>R$</span><div><small>Total liberado</small><strong>{Number(resumo.ganho_total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div></article><article><span>✓</span><div><small>Total já pago</small><strong>{Number(resumo.valor_pago).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div></article><article><span>!</span><div><small>Saldo a pagar</small><strong>{Number(resumo.saldo_pendente).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div></article><article><span>№</span><div><small>Pesagens concluídas</small><strong>{resumo.pesagens}</strong></div></article><article><span>★</span><div><small>Metas batidas</small><strong>{dados.metas.filter((item) => item.atingida).length}</strong></div></article></div>
    <div className="grade-ficha">
      <section className="painel"><h3>Dados pessoais e contato</h3><dl className="lista-dados"><div><dt>Código</dt><dd>{catador.codigo}</dd></div><div><dt>CPF</dt><dd>{catador.cpf ? formatarCpf(catador.cpf) : "Não informado"}</dd></div><div><dt>Nascimento</dt><dd>{catador.data_nascimento ? new Date(`${String(catador.data_nascimento).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "Não informado"}</dd></div><div><dt>Gênero</dt><dd>{catador.genero || "Não informado"}</dd></div><div><dt>Raça / cor</dt><dd>{catador.raca_cor || "Não informado"}</dd></div><div><dt>Contatos</dt><dd>{catador.contatos.map((item) => `${item.tipo}: ${item.valor}`).join(" · ") || "Não informado"}</dd></div><div><dt>Endereço</dt><dd>{endereco ? [endereco.logradouro, endereco.numero, endereco.bairro, endereco.cidade, endereco.estado, endereco.cep].filter(Boolean).join(", ") : "Não informado"}</dd></div></dl></section>
      <section className="painel"><h3><WalletCards /> Dados para recebimento</h3>{catador.contas_financeiras.length === 0 ? <p className="estado-vazio">Nenhuma forma de pagamento cadastrada.</p> : catador.contas_financeiras.map((conta, indice) => <dl className="lista-dados" key={indice}><div><dt>Tipo</dt><dd>{conta.tipo === "pix" ? "Pix" : "Conta bancária"}</dd></div>{conta.tipo === "pix" ? <div><dt>Chave</dt><dd>{conta.chave_pix ?? "Não informada"}</dd></div> : <><div><dt>Banco</dt><dd>{conta.banco ?? "Não informado"}</dd></div><div><dt>Agência / conta</dt><dd>{conta.agencia ?? "—"} / {conta.numero_conta ?? "—"}</dd></div></>}<div><dt>Titular</dt><dd>{conta.de_terceiro ? `${conta.nome_titular} · CPF ${conta.cpf_titular ? formatarCpf(conta.cpf_titular) : "não informado"}` : "O próprio catador"}</dd></div></dl>)}</section>
    </div>
    <section className="painel"><div className="titulo-secao"><div><h2>Ganhos por material</h2><p>Totais financeiros separados por material pesado</p></div></div><div className="grade-materiais-ficha">{dados.materiais.map((item) => <article key={item.uuid}><strong>{item.nome}</strong><span>{Number(item.peso_total).toLocaleString("pt-BR")} kg</span><b>{Number(item.ganho_total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b><small>{item.pesagens} pesagem(ns)</small></article>)}</div></section>
    <section className="painel"><div className="titulo-secao"><div><h2>Histórico de metas</h2><p>Progresso diário e ganho de cada meta</p></div></div><div className="lista-metas-ficha">{metasPaginadas.map((meta, indice) => <article key={`${meta.data}-${meta.nome}-${indice}`}><header><strong>{meta.nome}</strong><span>{new Date(`${String(meta.data).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR")} · {meta.atingida ? "Meta batida" : "Em andamento"}</span></header><BarraMeta percentual={Number(meta.percentual)} texto={`${Number(meta.peso).toLocaleString("pt-BR")} / ${Number(meta.meta).toLocaleString("pt-BR")} kg`} />{meta.atingida && <b>{Number(meta.ganho).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b>}</article>)}</div><Paginacao pagina={paginaMetas} total={dados.metas.length} itensPorPagina={itensPerfil} aoMudarPagina={setPaginaMetas} rotulo="metas" /></section>
    <section className="painel"><div className="titulo-secao"><div><h2>Caixas individuais</h2><p>Aberturas, fechamentos, reaberturas e totais por dia</p></div></div><div className="tabela-responsiva"><table><thead><tr><th>Data</th><th>Status</th><th>Movimentações</th><th>Peso</th><th>Valor</th><th>Responsáveis e reabertura</th></tr></thead><tbody>{caixasPaginados.map((item) => <tr key={item.uuid}><td>{new Date(`${String(item.data_caixa).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR")}</td><td><span className={`status-caixa ${item.status}`}>{item.status}</span></td><td>{item.movimentacoes}</td><td>{Number(item.peso).toLocaleString("pt-BR")} kg</td><td>{Number(item.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td><td><strong>Aberto por {item.aberto_por || "sistema"}</strong>{item.fechado_em && <small className="texto-bloco">Fechado por {item.fechado_por || "administrador"} em {new Date(item.fechado_em).toLocaleString("pt-BR")}</small>}{item.reaberto_em && <small className="texto-bloco aviso-auditoria">Reaberto por {item.reaberto_por || "administrador"} em {new Date(item.reaberto_em).toLocaleString("pt-BR")} · Motivo: {item.motivo_reabertura}</small>}</td></tr>)}</tbody></table></div><Paginacao pagina={paginaCaixas} total={dados.caixas.length} itensPorPagina={itensPerfil} aoMudarPagina={setPaginaCaixas} rotulo="caixas" /></section>
    <section className="painel"><div className="titulo-secao"><div><h2>Histórico operacional de pesagens</h2><p>Somente registros válidos; exclusões e alterações permanecem documentadas em Relatórios e auditoria</p></div></div>{acessos.administrador && <div className="barra-acoes-historico"><span>{pesagensSelecionadas.length} registro(s) selecionado(s)</span><button type="button" className="botao-perigo" disabled={!pesagensSelecionadas.length} onClick={() => setPesagensExcluir(dados.historico.filter((item) => pesagensSelecionadas.includes(item.uuid)))}><Trash2 /> Excluir selecionados</button></div>}<div className="tabela-responsiva"><table><thead><tr>{acessos.administrador && <th className="coluna-selecao"><input type="checkbox" aria-label="Selecionar todas as pesagens desta página" checked={historicoPaginado.length > 0 && historicoPaginado.every((item) => pesagensSelecionadas.includes(item.uuid))} onChange={(evento) => setPesagensSelecionadas((atuais) => evento.target.checked ? [...new Set([...atuais, ...historicoPaginado.map((item) => item.uuid)])] : atuais.filter((uuidAtual) => !historicoPaginado.some((item) => item.uuid === uuidAtual)))} /></th>}<th>Registro</th><th>Data</th><th>Material</th><th>Operação</th><th>Peso</th><th>Ganho</th><th>Status</th>{acessos.administrador && <th>Ações</th>}</tr></thead><tbody>{historicoPaginado.map((item) => <tr key={item.uuid}>{acessos.administrador && <td className="coluna-selecao"><input type="checkbox" aria-label={`Selecionar pesagem ${item.codigo}`} checked={pesagensSelecionadas.includes(item.uuid)} onChange={(evento) => setPesagensSelecionadas((atuais) => evento.target.checked ? [...atuais, item.uuid] : atuais.filter((uuidAtual) => uuidAtual !== item.uuid))} /></td>}<td><code>{item.codigo}</code></td><td>{new Date(item.data_hora).toLocaleString("pt-BR")}</td><td>{item.material}<small className={item.contabiliza_meta ? "texto-bloco" : "texto-bloco aviso-auditoria"}>{item.contabiliza_meta ? "Contabilizada na meta" : "Fora da meta · pagamento imediato"}</small></td><td>{item.cooperativa || "—"} · {item.ponto_apoio} · {item.responsavel}</td><td>{Number(item.peso_total).toLocaleString("pt-BR")} kg</td><td>{Number(item.valor_total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td><td><span className={`status-pesagem ${item.status}`}>{item.status}</span></td>{acessos.administrador && <td><div className="acoes-tabela"><button type="button" onClick={() => { setErroPesagens(""); setPesagemEditar(item); }} aria-label={`Editar ${item.codigo}`} title="Editar pesagem"><Pencil /></button><button type="button" className="perigoso" onClick={() => { setErroPesagens(""); setPesagensExcluir([item]); }} aria-label={`Excluir ${item.codigo}`} title="Excluir e recalcular"><Trash2 /></button></div></td>}</tr>)}</tbody></table>{dados.historico.length === 0 && <p className="estado-vazio">Nenhuma pesagem operacional válida.</p>}</div><Paginacao pagina={paginaHistorico} total={dados.historico.length} itensPorPagina={itensPerfil} aoMudarPagina={setPaginaHistorico} rotulo="pesagens" /></section>
    <section className="painel"><div className="titulo-secao"><div><h2>Pagamentos e recibos</h2><p>Registro do valor, forma de pagamento e usuário responsável</p></div></div><div className="tabela-responsiva"><table><thead><tr><th>Recibo</th><th>Data</th><th>Tipo</th><th>Valor</th><th>Pagador(a)</th><th>Pesagens quitadas</th><th>Ação</th></tr></thead><tbody>{pagamentosPaginados.map((item) => <tr key={item.uuid}><td><code>{item.codigo}</code></td><td>{new Date(item.pago_em).toLocaleString("pt-BR")}</td><td>{item.tipo === "transferencia_bancaria" ? "Transferência bancária" : item.tipo === "pix" ? "Pix" : item.tipo === "dinheiro" ? "Dinheiro" : "Outro"}</td><td><strong className="valor-verde">{Number(item.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></td><td>{item.pagador}<small className="texto-bloco">{item.pagador_email}</small></td><td>{item.itens.map((pesagem) => pesagem.codigo_pesagem).join(" · ")}</td><td><button className="botao-secundario botao-recibo" type="button" onClick={() => setReciboAberto(item)}><Eye /> Ver recibo</button></td></tr>)}</tbody></table>{dados.pagamentos.length === 0 && <p className="estado-vazio">Nenhum pagamento registrado para este catador.</p>}</div><Paginacao pagina={paginaPagamentos} total={dados.pagamentos.length} itensPorPagina={itensPerfil} aoMudarPagina={setPaginaPagamentos} rotulo="pagamentos" /></section>
    <ModalConfirmacao aberto={Boolean(acaoCaixa)} titulo={acaoCaixa === "reabrir" ? "Reabrir o ciclo operacional?" : "Fechar o ciclo operacional?"} descricao={acaoCaixa === "reabrir" ? "A reabertura será registrada na auditoria e permitirá novas movimentações." : "Depois de fechado, o ciclo bloqueará novas pesagens até uma reabertura justificada."} textoConfirmar={acaoCaixa === "reabrir" ? "Reabrir ciclo" : "Fechar ciclo"} processando={processando} rotuloCampo={acaoCaixa === "reabrir" ? "Motivo obrigatório da reabertura" : undefined} valorCampo={motivoReabertura} aoMudarCampo={setMotivoReabertura} placeholderCampo="Descreva por que o ciclo precisa ser reaberto" campoObrigatorio={acaoCaixa === "reabrir"} aoFechar={() => setAcaoCaixa(null)} aoConfirmar={() => acaoCaixa && void alterarCaixa(acaoCaixa)} />
    {pagamentoAberto && <ModalPagamentoCatador catador={{ uuid, codigo: catador.codigo, nome_completo: catador.nome_completo, cpf: catador.cpf, cooperativa: catador.cooperativa }} saldo={Number(resumo.saldo_pendente)} contas={catador.contas_financeiras} aoFechar={() => setPagamentoAberto(false)} aoPago={carregar} />}
    {reciboAberto && <ModalReciboPagamento recibo={reciboAberto} aoFechar={() => setReciboAberto(null)} />}
    {pesagemEditar && <ModalEdicaoPesagem pesagem={pesagemEditar} aoFechar={() => setPesagemEditar(null)} aoSalvo={async () => { setPesagemEditar(null); await carregar(); }} />}
    <ModalExclusaoAdministrativa aberto={pesagensExcluir.length > 0} titulo={pesagensExcluir.length > 1 ? `Excluir ${pesagensExcluir.length} pesagens selecionadas?` : "Excluir esta pesagem e recalcular os valores?"} descricao="Os registros sairão da ficha operacional do catador. Caixa, metas, total coletado e valor a pagar serão recalculados na mesma operação." itensApagados={pesagensExcluir.map((item) => `${item.codigo} · ${item.material} · ${Number(item.peso_total).toLocaleString("pt-BR")} kg · ${Number(item.valor_total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`)} itensPreservados={["Registros marcados como excluídos nos Relatórios", "Dados anteriores, motivo, usuário e horário na auditoria", "Cadastro do catador e pagamentos já registrados"]} fraseConfirmacao="EXCLUIR REGISTROS" processando={processandoPesagens} erro={erroPesagens} aoConfirmar={(confirmacao) => void excluirPesagens(confirmacao)} aoFechar={() => { if (!processandoPesagens) { setPesagensExcluir([]); setErroPesagens(""); } }} />
  </section>;
}

function dataHoraParaCampo(valor: string) {
  const data = new Date(valor);
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function ModalEdicaoPesagem({ pesagem, aoFechar, aoSalvo }: { pesagem: PesagemHistorico; aoFechar: () => void; aoSalvo: () => Promise<void> }) {
  const [materiais, setMateriais] = useState<MaterialApi[]>([]);
  const [cooperativas, setCooperativas] = useState<CooperativaApi[]>([]);
  const [pontos, setPontos] = useState<PontoApoioApi[]>([]);
  const [responsaveis, setResponsaveis] = useState<ResponsavelPesagemApi[]>([]);
  const [formulario, setFormulario] = useState({ materialUuid: pesagem.material_uuid, cooperativaUuid: pesagem.cooperativa_uuid, pontoApoioUuid: pesagem.ponto_apoio_uuid, responsavelPesagemUuid: pesagem.responsavel_pesagem_uuid ?? "", responsavelOutro: pesagem.responsavel_outro ?? "", peso: String(pesagem.peso_total), dataHora: dataHoraParaCampo(pesagem.data_hora), status: pesagem.status, observacao: pesagem.observacao ?? "", contabilizarNaMeta: pesagem.contabiliza_meta, guardarExcedenteMeta: pesagem.guardar_excedente_meta, motivoAlteracao: "" });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  useEffect(() => {
    void Promise.all([
      requisitarApi<{ dados: MaterialApi[] }>("/api/materiais"), requisitarApi<{ dados: CooperativaApi[] }>("/api/cooperativas"),
      requisitarApi<{ dados: PontoApoioApi[] }>("/api/pontos-apoio?incluirInativos=true"), requisitarApi<{ dados: ResponsavelPesagemApi[] }>("/api/responsaveis-pesagem?incluirInativos=true"),
    ]).then(([m, c, p, r]) => { setMateriais(m.dados); setCooperativas(c.dados); setPontos(p.dados); setResponsaveis(r.dados); }).catch((falha) => setErro(falha instanceof Error ? falha.message : "Não foi possível carregar as opções da pesagem.")).finally(() => setCarregando(false));
  }, []);
  const atualizar = <C extends keyof typeof formulario>(campo: C, valor: (typeof formulario)[C]) => setFormulario((atual) => ({ ...atual, [campo]: valor }));
  async function salvar() {
    const peso = Number(formulario.peso.replace(",", "."));
    if (!(peso > 0) || formulario.motivoAlteracao.trim().length < 3) return setErro("Informe um peso válido e o motivo da correção.");
    if (!formulario.responsavelPesagemUuid && formulario.responsavelOutro.trim().length < 2) return setErro("Informe o responsável pela pesagem.");
    setSalvando(true); setErro("");
    try {
      await requisitarApi(`/api/pesagens/${pesagem.uuid}`, { method: "PUT", body: JSON.stringify({
        catadorUuid: pesagem.catador_uuid, cooperativaUuid: formulario.cooperativaUuid, pontoApoioUuid: formulario.pontoApoioUuid,
        responsavelPesagemUuid: formulario.responsavelPesagemUuid || undefined, responsavelOutro: formulario.responsavelPesagemUuid ? undefined : formulario.responsavelOutro.trim(),
        materialUuid: formulario.materialUuid, contabilizarNaMeta: formulario.contabilizarNaMeta, guardarExcedenteMeta: formulario.guardarExcedenteMeta,
        peso, observacao: formulario.observacao.trim() || undefined, dataHora: new Date(formulario.dataHora).toISOString(), status: formulario.status,
        motivoAlteracao: formulario.motivoAlteracao.trim(),
      }) });
      await aoSalvo();
    } catch (falha) { setErro(falha instanceof Error ? falha.message : "Não foi possível corrigir a pesagem."); }
    finally { setSalvando(false); }
  }
  return <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-edicao-pesagem"><div className="modal modal-edicao-pesagem"><header className="cabecalho-modal"><div><span>CORREÇÃO ADMINISTRATIVA</span><h2 id="titulo-edicao-pesagem">Editar pesagem {pesagem.codigo}</h2><p>Toda mudança será registrada com os dados anteriores, usuário, horário e motivo.</p></div><button type="button" onClick={aoFechar} disabled={salvando} aria-label="Fechar"><X /></button></header><div className="corpo-modal-pesagem">{carregando ? <p className="estado-carregando"><LoaderCircle className="icone-carregando" /> Carregando opções...</p> : <div className="grade-formulario"><label className="campo">Material<select value={formulario.materialUuid} onChange={(e) => atualizar("materialUuid", e.target.value)}>{materiais.map((item) => <option key={item.uuid} value={item.uuid}>{item.nome}{item.status === "inativo" ? " (inativo)" : ""}</option>)}</select></label><label className="campo">Peso<input inputMode="decimal" value={formulario.peso} onChange={(e) => atualizar("peso", e.target.value)} /></label><label className="campo">Data e hora<input type="datetime-local" value={formulario.dataHora} onChange={(e) => atualizar("dataHora", e.target.value)} /></label><label className="campo">Status<select value={formulario.status} onChange={(e) => atualizar("status", e.target.value as PesagemHistorico["status"])}><option value="concluida">Concluída</option><option value="agendada">Agendada</option><option value="cancelada">Cancelada</option></select></label><label className="campo">Cooperativa / Associação<select value={formulario.cooperativaUuid} onChange={(e) => atualizar("cooperativaUuid", e.target.value)}>{cooperativas.map((item) => <option key={item.uuid} value={item.uuid}>{item.nome}{item.status === "inativo" ? " (inativa)" : ""}</option>)}</select></label><label className="campo">Ponto de apoio<select value={formulario.pontoApoioUuid} onChange={(e) => atualizar("pontoApoioUuid", e.target.value)}>{pontos.map((item) => <option key={item.uuid} value={item.uuid}>{item.nome}{item.status === "inativo" ? " (inativo)" : ""}</option>)}</select></label><label className="campo">Responsável<select value={formulario.responsavelPesagemUuid} onChange={(e) => atualizar("responsavelPesagemUuid", e.target.value)}><option value="">Outro / nome livre</option>{responsaveis.map((item) => <option key={item.uuid} value={item.uuid}>{item.nome}{item.status === "inativo" ? " (inativo)" : ""}</option>)}</select></label>{!formulario.responsavelPesagemUuid && <label className="campo">Nome do responsável<input value={formulario.responsavelOutro} onChange={(e) => atualizar("responsavelOutro", e.target.value)} /></label>}<label className="campo campo-largo">Observação<textarea value={formulario.observacao} onChange={(e) => atualizar("observacao", e.target.value)} maxLength={1000} /></label><label className="opcao-toggle campo-largo"><input type="checkbox" checked={formulario.contabilizarNaMeta} onChange={(e) => atualizar("contabilizarNaMeta", e.target.checked)} /><span>Contabilizar esta pesagem na meta</span></label>{formulario.contabilizarNaMeta && <label className="opcao-toggle campo-largo"><input type="checkbox" checked={formulario.guardarExcedenteMeta} onChange={(e) => atualizar("guardarExcedenteMeta", e.target.checked)} /><span>Guardar excedente para a próxima coleta</span></label>}<label className="campo campo-largo">Motivo obrigatório da alteração<textarea value={formulario.motivoAlteracao} onChange={(e) => atualizar("motivoAlteracao", e.target.value)} minLength={3} maxLength={500} placeholder="Explique o erro humano e a correção realizada" /></label></div>}{erro && <p className="mensagem-erro" role="alert">{erro}</p>}</div><footer className="rodape-modal"><button type="button" className="botao-secundario" onClick={aoFechar} disabled={salvando}>Cancelar</button><button type="button" className="botao-primario" onClick={() => void salvar()} disabled={carregando || salvando}>{salvando ? <><LoaderCircle className="icone-carregando" /> Salvando e recalculando...</> : <><Pencil /> Salvar correção</>}</button></footer></div></div>;
}

function CadastroCatador({ cooperativas, edicao, onFechar, onSalvo }: { cooperativas: CooperativaApi[]; edicao?: PerfilApi; onFechar: () => void; onSalvo: () => Promise<void> }) {
  const catadorInicial = edicao?.catador;
  const enderecoInicial = catadorInicial?.endereco;
  const contaInicial = catadorInicial?.contas_financeiras[0];
  const [etapa, setEtapa] = useState(0);
  const [dados, setDados] = useState(() => ({
    ...vazio,
    nomeCompleto: catadorInicial?.nome_completo ?? "",
    apelido: catadorInicial?.apelido ?? "",
    cooperativaUuid: catadorInicial?.cooperativa_uuid ?? "",
    genero: catadorInicial?.genero ?? "",
    racaCor: catadorInicial?.raca_cor ?? "",
    dataNascimento: catadorInicial?.data_nascimento ? String(catadorInicial.data_nascimento).slice(0, 10) : "",
    cpf: catadorInicial?.cpf ? formatarCpf(catadorInicial.cpf) : "",
    cep: enderecoInicial?.cep ?? "",
    logradouro: enderecoInicial?.logradouro ?? "",
    numero: enderecoInicial?.numero ?? "",
    complemento: enderecoInicial?.complemento ?? "",
    bairro: enderecoInicial?.bairro ?? "",
    cidade: enderecoInicial?.cidade ?? "Belo Horizonte",
    estado: enderecoInicial?.estado ?? "MG",
    tipoPagamento: contaInicial?.tipo ?? "pix",
    tipoChavePix: contaInicial?.tipo_chave_pix ?? "CPF",
    chavePix: contaInicial?.chave_pix ?? "",
    banco: contaInicial?.banco ?? "",
    agencia: contaInicial?.agencia ?? "",
    numeroConta: contaInicial?.numero_conta ?? "",
    tipoConta: contaInicial?.tipo_conta ?? "corrente",
    nomeTitular: contaInicial?.nome_titular ?? "",
    cpfTitular: contaInicial?.cpf_titular ? formatarCpf(contaInicial.cpf_titular) : "",
    relacaoTitular: contaInicial?.relacao_titular ?? "",
  }));
  const [contatos, setContatos] = useState(() => catadorInicial?.contatos.length ? catadorInicial.contatos.map((contato, indice) => ({ tipo: contato.tipo, valor: contato.valor, principal: contato.principal ?? indice === 0 })) : [{ tipo: "celular", valor: "", principal: true }]);
  const [endereco, setEndereco] = useState(Boolean(enderecoInicial));
  const [pagamento, setPagamento] = useState(Boolean(contaInicial));
  const [terceiro, setTerceiro] = useState(Boolean(contaInicial?.de_terceiro));
  const [catadorAtivo, setCatadorAtivo] = useState(catadorInicial?.status !== "inativo");
  const [foto, setFoto] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const atualizar = (campo: keyof typeof vazio, valor: string) => setDados((atual) => ({ ...atual, [campo]: valor }));

  useEffect(() => {
    const cep = somenteNumeros(dados.cep);
    if (cep.length !== 8) return;
    const controle = new AbortController();
    const temporizador = window.setTimeout(async () => {
      try {
        const enderecoEncontrado = await requisitarApi<{ logradouro: string; complemento: string; bairro: string; cidade: string; estado: string }>(`/api/enderecos/cep/${cep}`, { signal: controle.signal });
        setDados((atual) => ({
          ...atual,
          logradouro: enderecoEncontrado.logradouro,
          complemento: atual.complemento || enderecoEncontrado.complemento,
          bairro: enderecoEncontrado.bairro,
          cidade: enderecoEncontrado.cidade,
          estado: enderecoEncontrado.estado,
        }));
        setErro("");
      } catch (falha) {
        if ((falha as { name?: string }).name !== "AbortError") setErro(falha instanceof Error ? falha.message : "Não foi possível consultar o CEP.");
      }
    }, 350);
    return () => { window.clearTimeout(temporizador); controle.abort(); };
  }, [dados.cep]);

  async function salvar() {
    if (!dados.nomeCompleto.trim()) return setErro("Informe o nome completo.");
    if (dados.cpf && somenteNumeros(dados.cpf).length !== 11) return setErro("Informe o CPF completo com 11 dígitos ou deixe o campo vazio.");
    if (pagamento && dados.tipoPagamento === "pix" && !dados.chavePix.trim()) return setErro("Informe a chave Pix para permitir o pagamento.");
    if (pagamento && dados.tipoPagamento === "conta_bancaria" && (!dados.banco.trim() || !dados.agencia.trim() || !dados.numeroConta.trim() || !dados.tipoConta.trim())) return setErro("Informe banco, agência, conta e tipo da conta para permitir o pagamento.");
    if (pagamento && terceiro && (!dados.nomeTitular.trim() || somenteNumeros(dados.cpfTitular).length !== 11)) return setErro("Para dados de terceiros, informe o nome completo e o CPF com 11 dígitos do titular.");
    setSalvando(true); setErro("");
    try {
      const corpo = {
        nomeCompleto: dados.nomeCompleto.trim(), apelido: dados.apelido.trim() || undefined, cooperativaUuid: dados.cooperativaUuid || undefined,
        genero: dados.genero || undefined, racaCor: dados.racaCor || undefined, dataNascimento: dados.dataNascimento || undefined, cpf: somenteNumeros(dados.cpf) || undefined,
        contatos: contatos.filter((item) => item.valor.trim()).map((item) => ({ ...item, valor: item.valor.trim() })),
        endereco: endereco ? { cep: somenteNumeros(dados.cep) || undefined, logradouro: dados.logradouro || undefined, numero: dados.numero || undefined, complemento: dados.complemento || undefined, bairro: dados.bairro || undefined, cidade: dados.cidade, estado: dados.estado } : undefined,
        contaFinanceira: pagamento ? { tipo: dados.tipoPagamento, tipoChavePix: dados.tipoPagamento === "pix" ? dados.tipoChavePix : undefined, chavePix: dados.tipoPagamento === "pix" ? dados.chavePix || undefined : undefined, banco: dados.tipoPagamento === "conta_bancaria" ? dados.banco || undefined : undefined, agencia: dados.tipoPagamento === "conta_bancaria" ? dados.agencia || undefined : undefined, numeroConta: dados.tipoPagamento === "conta_bancaria" ? dados.numeroConta || undefined : undefined, tipoConta: dados.tipoPagamento === "conta_bancaria" ? dados.tipoConta : undefined, deTerceiro: terceiro, nomeTitular: terceiro ? dados.nomeTitular || undefined : undefined, cpfTitular: terceiro ? somenteNumeros(dados.cpfTitular) || undefined : undefined, relacaoTitular: terceiro ? dados.relacaoTitular || undefined : undefined } : undefined,
        ativo: catadorAtivo,
      };
      const criado = edicao ? null : await requisitarApi<{ uuid: string; codigo: string }>("/api/catadores", { method: "POST", body: JSON.stringify(corpo) });
      if (edicao) await requisitarApi(`/api/catadores/${edicao.catador.uuid}`, { method: "PUT", body: JSON.stringify(corpo) });
      const catadorUuid = edicao?.catador.uuid ?? criado!.uuid;
      if (foto) { const formulario = new FormData(); formulario.append("foto", foto); await requisitarApi(`/api/catadores/${catadorUuid}/foto`, { method: "POST", body: formulario }); }
      await onSalvo(); onFechar();
    } catch (falha) { setErro(falha instanceof Error ? falha.message : `Não foi possível ${edicao ? "editar" : "cadastrar"} o catador.`); }
    finally { setSalvando(false); }
  }

  return <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-cadastro"><div className="modal cadastro">
    <header className="cabecalho-modal"><div><span>{edicao ? "EDIÇÃO COMPLETA" : "NOVO CADASTRO"}</span><h2 id="titulo-cadastro">{edicao ? `Editar ${edicao.catador.nome_completo}` : "Cadastrar catador"}</h2><p>Os dados serão gravados no PostgreSQL.</p></div><button onClick={onFechar} aria-label="Fechar"><X /></button></header>
    <div className="etapas">{etapas.map((item, indice) => <div className={indice === etapa ? "etapa atual" : indice < etapa ? "etapa concluida" : "etapa"} key={item}><span>{indice < etapa ? "✓" : indice + 1}</span><small>{item}</small></div>)}</div>
    <form className="formulario" onSubmit={(evento) => evento.preventDefault()}>
      {etapa === 2 && <p className="aviso-pagamento"><strong>Dados opcionais.</strong> Ao habilitar uma forma de recebimento, informe os campos necessários. Para conta ou Pix de terceiro, nome e CPF do titular são obrigatórios.</p>}
      {etapa === 0 && <div className="animar-etapa"><h3>Identificação</h3><div className="grade-formulario"><Campo rotulo="Nome completo" valor={dados.nomeCompleto} aoMudar={(v) => atualizar("nomeCompleto", v)} autoFocus /><Campo rotulo="Apelido" valor={dados.apelido} aoMudar={(v) => atualizar("apelido", v)} opcional /><label className="campo">Gênero <select value={dados.genero} onChange={(e) => atualizar("genero", e.target.value)}><option value="">Não informado</option><option>Feminino</option><option>Masculino</option><option>Não binário</option><option>Outro</option></select></label><label className="campo">Raça / Cor <select value={dados.racaCor} onChange={(e) => atualizar("racaCor", e.target.value)}><option value="">Não informado</option><option>Branca</option><option>Preta</option><option>Parda</option><option>Amarela</option><option>Indígena</option></select></label><Campo rotulo="Data de nascimento" valor={dados.dataNascimento} aoMudar={(v) => atualizar("dataNascimento", v)} tipo="date" opcional /><CampoCpf rotulo="CPF" valor={dados.cpf} aoMudar={(v) => atualizar("cpf", v)} opcional /><label className="campo campo-largo">Cooperativa / Associação <select value={dados.cooperativaUuid} onChange={(e) => atualizar("cooperativaUuid", e.target.value)}><option value="">Sem vínculo</option>{cooperativas.filter((item) => item.status === "ativo" || item.uuid === dados.cooperativaUuid).map((item) => <option value={item.uuid} key={item.uuid}>{item.nome}</option>)}</select></label><div className="campo-largo"><Interruptor marcado={catadorAtivo} aoMudar={setCatadorAtivo} titulo="Catador ativo e autorizado para novas pesagens" /></div></div></div>}
      {etapa === 1 && <div className="animar-etapa"><h3>Contatos</h3>{contatos.map((contato, indice) => <div className="grupo-repetivel" key={indice}><label className="campo">Tipo<select value={contato.tipo} onChange={(e) => setContatos((lista) => lista.map((item, i) => i === indice ? { ...item, tipo: e.target.value } : item))}><option value="celular">Celular</option><option value="telefone">Telefone</option><option value="whatsapp">WhatsApp</option><option value="recado">Recado</option><option value="email">E-mail</option></select></label><Campo rotulo="Contato" valor={contato.valor} aoMudar={(valor) => setContatos((lista) => lista.map((item, i) => i === indice ? { ...item, valor } : item))} opcional />{indice > 0 && <button type="button" onClick={() => setContatos((lista) => lista.filter((_, i) => i !== indice))} aria-label="Remover contato"><Trash2 /></button>}</div>)}<button className="botao-texto" type="button" onClick={() => setContatos((lista) => [...lista, { tipo: "celular", valor: "", principal: false }])}><Plus /> Adicionar contato</button><div className="bloco-opcional"><Interruptor marcado={endereco} aoMudar={setEndereco} titulo="Preencher endereço" />{endereco && <div className="grade-formulario animar-etapa"><Campo rotulo="CEP" valor={dados.cep} aoMudar={(v) => atualizar("cep", v)} opcional /><Campo rotulo="Logradouro" valor={dados.logradouro} aoMudar={(v) => atualizar("logradouro", v)} /><Campo rotulo="Número" valor={dados.numero} aoMudar={(v) => atualizar("numero", v)} /><Campo rotulo="Complemento" valor={dados.complemento} aoMudar={(v) => atualizar("complemento", v)} opcional /><Campo rotulo="Bairro" valor={dados.bairro} aoMudar={(v) => atualizar("bairro", v)} /><Campo rotulo="Cidade" valor={dados.cidade} aoMudar={(v) => atualizar("cidade", v)} /><Campo rotulo="Estado" valor={dados.estado} aoMudar={(v) => atualizar("estado", v)} /></div>}</div></div>}
      {etapa === 2 && <div className="animar-etapa"><h3>Dados para recebimento</h3><div className="bloco-opcional"><Interruptor marcado={pagamento} aoMudar={setPagamento} titulo="Informar Pix ou conta bancária" />{pagamento && <div className="grade-formulario animar-etapa"><label className="campo">Forma de pagamento<select value={dados.tipoPagamento} onChange={(e) => atualizar("tipoPagamento", e.target.value)}><option value="pix">Pix</option><option value="conta_bancaria">Conta bancária</option></select></label>{dados.tipoPagamento === "pix" ? <><label className="campo">Tipo da chave<select value={dados.tipoChavePix} onChange={(e) => atualizar("tipoChavePix", e.target.value)}><option>CPF</option><option>Celular</option><option>E-mail</option><option>Chave aleatória</option></select></label><Campo rotulo="Chave Pix" valor={dados.chavePix} aoMudar={(v) => atualizar("chavePix", v)} /></> : <><Campo rotulo="Banco" valor={dados.banco} aoMudar={(v) => atualizar("banco", v)} /><Campo rotulo="Agência" valor={dados.agencia} aoMudar={(v) => atualizar("agencia", v)} /><Campo rotulo="Número da conta" valor={dados.numeroConta} aoMudar={(v) => atualizar("numeroConta", v)} /><label className="campo">Tipo de conta<select value={dados.tipoConta} onChange={(e) => atualizar("tipoConta", e.target.value)}><option value="corrente">Corrente</option><option value="poupanca">Poupança</option></select></label></>}<div className="campo-largo"><Interruptor marcado={terceiro} aoMudar={setTerceiro} titulo="Dados de terceiro" /></div>{terceiro && <><Campo rotulo="Nome do titular" valor={dados.nomeTitular} aoMudar={(v) => atualizar("nomeTitular", v)} /><CampoCpf rotulo="CPF do titular" valor={dados.cpfTitular} aoMudar={(v) => atualizar("cpfTitular", v)} /><Campo rotulo="Relação com o catador" valor={dados.relacaoTitular} aoMudar={(v) => atualizar("relacaoTitular", v)} opcional /></>}</div>}</div></div>}
      {etapa === 3 && <div className="animar-etapa"><h3>Foto e revisão</h3><div className="area-foto"><div className="moldura-rosto">{foto ? <img src={URL.createObjectURL(foto)} alt="Prévia da foto" /> : edicao?.catador.tem_foto ? <img src={`${URL_API}/api/catadores/${edicao.catador.uuid}/foto`} alt={`Foto atual de ${edicao.catador.nome_completo}`} /> : <Camera />}</div><div><strong>{edicao?.catador.tem_foto ? "Mantenha ou substitua a foto do catador" : "Fotografe o rosto do catador"}</strong><p>A foto será armazenada com acesso restrito.</p><label className="botao-secundario botao-arquivo" htmlFor={edicao ? "foto-catador-edicao" : "foto-catador-novo"}><Camera /> {edicao?.catador.tem_foto ? "Substituir foto" : "Abrir câmera"}</label><input id={edicao ? "foto-catador-edicao" : "foto-catador-novo"} type="file" hidden accept="image/jpeg,image/png,image/webp" capture="user" onChange={(e: ChangeEvent<HTMLInputElement>) => setFoto(e.target.files?.[0] ?? null)} /></div></div><div className="resumo-cadastro"><strong>{dados.nomeCompleto || "Nome não informado"}</strong><span>{contatos.filter((item) => item.valor).length} contato(s) · {dados.cooperativaUuid ? "Com cooperativa" : "Sem cooperativa"}</span></div></div>}
      {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
    </form>
    <footer className="rodape-modal"><button type="button" className="botao-secundario" onClick={etapa === 0 ? onFechar : () => setEtapa((v) => v - 1)}>{etapa === 0 ? "Cancelar" : "← Voltar"}</button><span>Etapa {etapa + 1} de {etapas.length}</span><button type="button" className="botao-primario" disabled={salvando} onClick={etapa === etapas.length - 1 ? () => void salvar() : () => setEtapa((v) => v + 1)}>{salvando ? "Salvando..." : etapa === etapas.length - 1 ? edicao ? "Salvar alterações" : "Concluir cadastro" : "Continuar →"}</button></footer>
  </div></div>;
}

function Campo({ rotulo, valor, aoMudar, opcional, tipo = "text", autoFocus = false }: { rotulo: string; valor: string; aoMudar: (valor: string) => void; opcional?: boolean; tipo?: string; autoFocus?: boolean }) { return <label className="campo">{rotulo} {opcional && <small>Opcional</small>}<input type={tipo} value={valor} onChange={(e) => aoMudar(e.target.value)} autoFocus={autoFocus} /></label>; }
function CampoCpf({ rotulo, valor, aoMudar, opcional }: { rotulo: string; valor: string; aoMudar: (valor: string) => void; opcional?: boolean }) { return <label className="campo">{rotulo} {opcional && <small>Opcional</small>}<input value={valor} onChange={(e) => aoMudar(formatarCpf(e.target.value))} inputMode="numeric" autoComplete="off" maxLength={14} placeholder="000.000.000-00" aria-label={rotulo} /></label>; }
function Interruptor({ marcado, aoMudar, titulo }: { marcado: boolean; aoMudar: (valor: boolean) => void; titulo: string }) { return <label className="interruptor"><input type="checkbox" checked={marcado} onChange={(e) => aoMudar(e.target.checked)} /><span /><div><strong>{titulo}</strong><small>Opcional</small></div></label>; }

function ModalExclusaoCatador({ catador, motivo, erro, processando, aoMudarMotivo, aoFechar, aoConfirmar }: { catador: CatadorApi; motivo: string; erro: string; processando: boolean; aoMudarMotivo: (valor: string) => void; aoFechar: () => void; aoConfirmar: () => void }) {
  return <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-excluir-catador"><div className="modal pequeno modal-exclusao-catador">
    <header className="cabecalho-modal"><div><span>EXCLUSÃO DEFINITIVA</span><h2 id="titulo-excluir-catador">Excluir {catador.nome_completo}?</h2><p>Confira com atenção antes de continuar.</p></div><button type="button" onClick={aoFechar} aria-label="Fechar"><X /></button></header>
    <div className="conteudo-exclusao-catador"><div className="aviso-exclusao-catador"><AlertTriangle /><div><strong>Todos os dados vinculados serão removidos</strong><p>Cadastro, contatos, endereço, pagamento, fotos, pesagens, metas, caixas e movimentações serão excluídos. Esta ação não pode ser desfeita.</p></div></div><label className="campo">Motivo da exclusão<textarea value={motivo} onChange={(e) => aoMudarMotivo(e.target.value)} placeholder="Informe por que este cadastro será excluído" autoFocus /></label>{erro && <p className="mensagem-erro" role="alert">{erro}</p>}</div>
    <footer className="rodape-modal"><button type="button" className="botao-secundario" onClick={aoFechar} disabled={processando}>Cancelar</button><button type="button" className="botao-perigo" onClick={aoConfirmar} disabled={processando || motivo.trim().length < 3}><Trash2 /> {processando ? "Excluindo..." : "Excluir todos os dados"}</button></footer>
  </div></div>;
}

"use client";

import { useState } from "react";
import { Banknote, LoaderCircle, Printer, ReceiptText, ShieldCheck, X } from "lucide-react";
import { requisitarApi } from "@/app/dados/api";

export type ContaRecebimento = {
  uuid: string; tipo: "pix" | "conta_bancaria"; tipo_chave_pix: string | null; chave_pix: string | null;
  banco: string | null; agencia: string | null; numero_conta: string | null; tipo_conta: string | null;
  de_terceiro: boolean; nome_titular: string | null; cpf_titular: string | null; relacao_titular: string | null;
};

export type ItemReciboPagamento = { codigo_pesagem: string; material: string; data_hora: string; peso: number; valor: number };
export type ReciboPagamento = {
  uuid: string; codigo: string; codigo_catador: string; nome_catador: string; cpf_catador: string | null; cooperativa_catador: string | null;
  valor: number; tipo: "pix" | "dinheiro" | "transferencia_bancaria" | "outro"; dados_recebimento: ContaRecebimento | null;
  observacao: string | null; pago_em: string; pagador: string; pagador_email: string; itens: ItemReciboPagamento[];
};

const nomesTipo = { pix: "Pix", dinheiro: "Dinheiro", transferencia_bancaria: "Transferência bancária", outro: "Outro" } as const;
const moeda = (valor: number) => Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const cpf = (valor: string | null) => valor ? valor.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : "Não informado";

export function ModalPagamentoCatador({ catador, saldo, contas, aoFechar, aoPago }: {
  catador: { uuid: string; codigo: string; nome_completo: string; cpf: string | null; cooperativa: string | null };
  saldo: number;
  contas: ContaRecebimento[];
  aoFechar: () => void;
  aoPago: () => Promise<void>;
}) {
  const tipoInicial: ReciboPagamento["tipo"] = contas.some((conta) => conta.tipo === "pix") ? "pix" : "dinheiro";
  const [valor, setValor] = useState(Number(saldo).toFixed(2).replace(".", ","));
  const [tipo, setTipo] = useState<ReciboPagamento["tipo"]>(tipoInicial);
  const [contaUuid, setContaUuid] = useState(contas.find((conta) => conta.tipo === (tipoInicial === "pix" ? "pix" : "conta_bancaria"))?.uuid ?? "");
  const [observacao, setObservacao] = useState("");
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");
  const [recibo, setRecibo] = useState<ReciboPagamento | null>(null);
  const [chaveIdempotencia] = useState(() => crypto.randomUUID());

  async function confirmar() {
    if (processando) return;
    const valorNumerico = Number(valor.includes(",") ? valor.replace(/\./g, "").replace(",", ".") : valor);
    if (!Number.isFinite(valorNumerico) || valorNumerico <= 0 || valorNumerico > Number(saldo)) {
      setErro(`Informe um valor entre R$ 0,01 e ${moeda(saldo)}.`); return;
    }
    setProcessando(true); setErro("");
    try {
      const resposta = await requisitarApi<{ pagamento: ReciboPagamento }>(`/api/catadores/${catador.uuid}/pagamentos`, {
        method: "POST",
        body: JSON.stringify({ valor: Math.round(valorNumerico * 100) / 100, tipo, contaFinanceiraUuid: contaUuid || undefined, observacao: observacao.trim() || undefined, chaveIdempotencia }),
      });
      setRecibo(resposta.pagamento);
      await aoPago();
    } catch (falha) { setErro(falha instanceof Error ? falha.message : "Não foi possível registrar o pagamento."); }
    finally { setProcessando(false); }
  }

  if (recibo) return <ModalReciboPagamento recibo={recibo} aoFechar={aoFechar} />;

  const conta = contas.find((item) => item.uuid === contaUuid);
  return <div className="sobreposicao sobreposicao-pagamento" role="dialog" aria-modal="true" aria-labelledby="titulo-pagamento">
    <div className="modal modal-pagamento">
      <header className="cabecalho-modal"><div><span>PAGAMENTO AO CATADOR</span><h2 id="titulo-pagamento">Confirmar dados e pagamento</h2><p>Confira o catador, o saldo e a forma utilizada antes de registrar.</p></div><button type="button" onClick={aoFechar} disabled={processando} aria-label="Fechar"><X /></button></header>
      <div className="corpo-pagamento">
        <section className="resumo-catador-pagamento"><Banknote /><div><small>CATADOR</small><strong>{catador.nome_completo}</strong><span><code>{catador.codigo}</code> · CPF {cpf(catador.cpf)} · {catador.cooperativa || "Sem cooperativa"}</span></div></section>
        <div className="saldo-pagamento"><small>Saldo disponível para pagamento</small><strong>{moeda(saldo)}</strong><span>Somente valores já liberados pelas regras de meta entram neste saldo.</span></div>
        <div className="grade-formulario grade-pagamento">
          <label className="campo">Valor a confirmar (R$)<input inputMode="decimal" value={valor} onChange={(evento) => setValor(evento.target.value.replace(/[^0-9,.]/g, ""))} disabled={processando} /></label>
          <label className="campo">Tipo do pagamento<select value={tipo} onChange={(evento) => { const proximoTipo = evento.target.value as ReciboPagamento["tipo"]; setTipo(proximoTipo); setContaUuid(contas.find((item) => item.tipo === (proximoTipo === "pix" ? "pix" : "conta_bancaria"))?.uuid ?? ""); }} disabled={processando}><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="transferencia_bancaria">Transferência bancária</option><option value="outro">Outro</option></select></label>
          {contas.length > 0 && tipo !== "dinheiro" && <label className="campo campo-largo">Dados de recebimento<select value={contaUuid} onChange={(evento) => setContaUuid(evento.target.value)} disabled={processando}><option value="">Não vincular dados cadastrados</option>{contas.map((item) => <option key={item.uuid} value={item.uuid}>{item.tipo === "pix" ? `Pix · ${item.chave_pix || "chave não informada"}` : `${item.banco || "Banco"} · agência ${item.agencia || "—"} · conta ${item.numero_conta || "—"}`}</option>)}</select></label>}
          <label className="campo campo-largo">Observação (opcional)<textarea value={observacao} maxLength={1000} onChange={(evento) => setObservacao(evento.target.value)} disabled={processando} placeholder="Ex.: pagamento realizado presencialmente" /></label>
        </div>
        {conta && tipo !== "dinheiro" && <div className="confirmacao-recebimento"><ShieldCheck /><div><strong>Recebimento em nome de {conta.de_terceiro ? conta.nome_titular || "terceiro" : "próprio catador"}</strong><span>{conta.tipo === "pix" ? `Chave Pix: ${conta.chave_pix}` : `${conta.banco} · agência ${conta.agencia} · conta ${conta.numero_conta}`}</span></div></div>}
        {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
      </div>
      <footer className="rodape-modal"><button className="botao-secundario" type="button" onClick={aoFechar} disabled={processando}>Cancelar</button><button className="botao-primario" type="button" onClick={() => void confirmar()} disabled={processando || saldo <= 0}>{processando ? <><LoaderCircle className="icone-carregando" /> Registrando pagamento...</> : <><ReceiptText /> Confirmar e gerar recibo</>}</button></footer>
    </div>
  </div>;
}

export function ModalReciboPagamento({ recibo, aoFechar }: { recibo: ReciboPagamento; aoFechar: () => void }) {
  return <div className="sobreposicao sobreposicao-pagamento" role="dialog" aria-modal="true" aria-labelledby="titulo-recibo">
    <div className="modal modal-pagamento">
      <header className="cabecalho-modal nao-imprimir"><div><span>PAGAMENTO CONFIRMADO</span><h2 id="titulo-recibo">Recibo gerado com segurança</h2><p>O pagamento e o usuário pagador foram registrados no livro de auditoria.</p></div><button type="button" onClick={aoFechar} aria-label="Fechar recibo"><X /></button></header>
      <Recibo recibo={recibo} />
      <footer className="rodape-modal nao-imprimir"><button className="botao-secundario" type="button" onClick={aoFechar}>Concluir</button><button className="botao-primario" type="button" onClick={() => window.print()}><Printer /> Imprimir recibo</button></footer>
    </div>
  </div>;
}

function Recibo({ recibo }: { recibo: ReciboPagamento }) {
  return <article className="recibo-pagamento">
    <header><div><small>RECICLA BELÔ</small><h1>Recibo de pagamento</h1></div><strong>{recibo.codigo}</strong></header>
    <div className="grade-recibo"><div><small>Catador</small><strong>{recibo.nome_catador}</strong><span>{recibo.codigo_catador} · CPF {cpf(recibo.cpf_catador)}</span></div><div><small>Valor pago</small><strong>{moeda(recibo.valor)}</strong><span>{nomesTipo[recibo.tipo]}</span></div><div><small>Data e hora</small><strong>{new Date(recibo.pago_em).toLocaleString("pt-BR")}</strong><span>{recibo.cooperativa_catador || "Sem cooperativa"}</span></div><div><small>Pagador(a) responsável</small><strong>{recibo.pagador}</strong><span>{recibo.pagador_email}</span></div></div>
    <section><h2>Valores que compõem o pagamento</h2><div className="tabela-responsiva"><table><thead><tr><th>Pesagem</th><th>Data</th><th>Material</th><th>Peso</th><th>Valor pago</th></tr></thead><tbody>{recibo.itens.map((item, indice) => <tr key={`${item.codigo_pesagem}-${indice}`}><td><code>{item.codigo_pesagem}</code></td><td>{new Date(item.data_hora).toLocaleString("pt-BR")}</td><td>{item.material}</td><td>{Number(item.peso).toLocaleString("pt-BR")} kg</td><td>{moeda(item.valor)}</td></tr>)}</tbody></table></div></section>
    {recibo.observacao && <p><strong>Observação:</strong> {recibo.observacao}</p>}
    <footer><span>Pagamento registrado eletronicamente no Recicla Belô.</span><strong>Total: {moeda(recibo.valor)}</strong></footer>
  </article>;
}

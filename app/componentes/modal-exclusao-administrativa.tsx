"use client";

import { useState } from "react";
import { AlertTriangle, Eye, EyeOff, ShieldAlert, Trash2, X } from "lucide-react";

type Propriedades = {
  aberto: boolean;
  titulo: string;
  descricao: string;
  itensApagados: string[];
  itensPreservados?: string[];
  fraseConfirmacao: string;
  processando?: boolean;
  erro?: string;
  aoConfirmar: (dados: { senhaAtual: string; confirmacao: string; motivo: string }) => void;
  aoFechar: () => void;
};

export function ModalExclusaoAdministrativa({ aberto, titulo, descricao, itensApagados, itensPreservados = [], fraseConfirmacao, processando = false, erro, aoConfirmar, aoFechar }: Propriedades) {
  if (!aberto) return null;
  return <ConteudoModal titulo={titulo} descricao={descricao} itensApagados={itensApagados} itensPreservados={itensPreservados} fraseConfirmacao={fraseConfirmacao} processando={processando} erro={erro} aoConfirmar={aoConfirmar} aoFechar={aoFechar} />;
}

function ConteudoModal({ titulo, descricao, itensApagados, itensPreservados = [], fraseConfirmacao, processando = false, erro, aoConfirmar, aoFechar }: Omit<Propriedades, "aberto">) {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [motivo, setMotivo] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const valido = senhaAtual.length > 0 && motivo.trim().length >= 3 && confirmacao === fraseConfirmacao;
  return <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-exclusao-administrativa">
    <div className="modal pequeno modal-exclusao-administrativa">
      <header className="cabecalho-modal"><div><span>AÇÃO ADMINISTRATIVA IRREVERSÍVEL</span><h2 id="titulo-exclusao-administrativa">{titulo}</h2><p>{descricao}</p></div><button type="button" onClick={aoFechar} disabled={processando} aria-label="Fechar"><X /></button></header>
      <div className="corpo-exclusao-administrativa">
        <div className="aviso-destrutivo"><AlertTriangle aria-hidden="true" /><div><strong>Esta operação não pode ser desfeita</strong><p>Confira o alcance da limpeza antes de confirmar.</p></div></div>
        <section><h3><Trash2 /> Será apagado</h3><ul>{itensApagados.map((item) => <li key={item}>{item}</li>)}</ul></section>
        {itensPreservados.length > 0 && <section className="dados-preservados"><h3><ShieldAlert /> Será preservado</h3><ul>{itensPreservados.map((item) => <li key={item}>{item}</li>)}</ul></section>}
        <label className="campo">Motivo obrigatório<textarea value={motivo} onChange={(evento) => setMotivo(evento.target.value)} maxLength={500} placeholder="Explique por que estes dados precisam ser removidos" /></label>
        <label className="campo">Digite exatamente <strong>{fraseConfirmacao}</strong><input value={confirmacao} onChange={(evento) => setConfirmacao(evento.target.value)} autoComplete="off" spellCheck={false} /></label>
        <label className="campo campo-senha-administrativa">Senha atual do administrador<div><input type={mostrarSenha ? "text" : "password"} value={senhaAtual} onChange={(evento) => setSenhaAtual(evento.target.value)} autoComplete="current-password" /><button type="button" onClick={() => setMostrarSenha((valor) => !valor)} aria-label={mostrarSenha ? "Ocultar senha" : "Visualizar senha"}>{mostrarSenha ? <EyeOff /> : <Eye />}</button></div></label>
        {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
      </div>
      <footer className="rodape-modal"><button type="button" className="botao-secundario" onClick={aoFechar} disabled={processando}>Cancelar</button><button type="button" className="botao-perigo" onClick={() => aoConfirmar({ senhaAtual, confirmacao, motivo: motivo.trim() })} disabled={!valido || processando}><Trash2 /> {processando ? "Apagando com segurança..." : "Apagar definitivamente"}</button></footer>
    </div>
  </div>;
}

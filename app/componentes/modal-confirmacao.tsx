"use client";

import { AlertTriangle, LoaderCircle, X } from "lucide-react";

type Propriedades = {
  aberto: boolean;
  titulo: string;
  descricao: string;
  textoConfirmar?: string;
  perigoso?: boolean;
  processando?: boolean;
  aoConfirmar: () => void;
  aoFechar: () => void;
  rotuloCampo?: string;
  valorCampo?: string;
  aoMudarCampo?: (valor: string) => void;
  placeholderCampo?: string;
  campoObrigatorio?: boolean;
};

export function ModalConfirmacao({ aberto, titulo, descricao, textoConfirmar = "Confirmar", perigoso = false, processando = false, aoConfirmar, aoFechar, rotuloCampo, valorCampo = "", aoMudarCampo, placeholderCampo, campoObrigatorio = false }: Propriedades) {
  if (!aberto) return null;
  const campoInvalido = Boolean(rotuloCampo && campoObrigatorio && valorCampo.trim().length < 3);
  return <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-confirmacao-generica">
    <div className="modal pequeno modal-confirmacao-generica">
      <header className="cabecalho-modal"><div><span>CONFIRMAÇÃO</span><h2 id="titulo-confirmacao-generica">{titulo}</h2><p>{descricao}</p></div><button type="button" onClick={aoFechar} aria-label="Fechar"><X /></button></header>
      <div className="corpo-confirmacao-generica"><AlertTriangle aria-hidden="true" />{rotuloCampo && <label className="campo">{rotuloCampo}<textarea value={valorCampo} onChange={(evento) => aoMudarCampo?.(evento.target.value)} placeholder={placeholderCampo} /></label>}</div>
      <footer className="rodape-modal"><button type="button" className="botao-secundario" onClick={aoFechar} disabled={processando}>Cancelar</button><button type="button" className={perigoso ? "botao-perigo" : "botao-primario"} onClick={aoConfirmar} disabled={processando || campoInvalido}>{processando ? <><LoaderCircle className="icone-carregando" /> Processando...</> : textoConfirmar}</button></footer>
    </div>
  </div>;
}

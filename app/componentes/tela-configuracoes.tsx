"use client";

/* eslint-disable jsx-a11y/label-has-associated-control, @next/next/no-img-element -- controles compostos usam associação explícita e as imagens configuráveis podem ser data URLs locais */

import { useState, type ChangeEvent } from "react";
import { materiais as materiaisIniciais } from "@/app/dados/demonstracao";
import { useIdentidadeVisual, type IdentidadeVisual } from "@/app/configuracao/identidade-visual";

type AbaConfiguracao = "materiais" | "identidade";

async function lerImagem(evento: ChangeEvent<HTMLInputElement>) {
  const arquivo = evento.target.files?.[0];
  if (!arquivo) return null;
  if (!["image/png", "image/jpeg", "image/webp"].includes(arquivo.type)) throw new Error("Use uma imagem PNG, JPG ou WebP.");
  if (arquivo.size > 700 * 1024) throw new Error("A imagem deve ter no máximo 700 KB.");
  return new Promise<string>((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result));
    leitor.onerror = () => rejeitar(new Error("Não foi possível ler a imagem."));
    leitor.readAsDataURL(arquivo);
  });
}

export function TelaConfiguracoes() {
  const [aba, setAba] = useState<AbaConfiguracao>("materiais");
  const [materiais, setMateriais] = useState(materiaisIniciais);
  const [modal, setModal] = useState(false);
  const { identidade, salvarIdentidade, restaurarIdentidade } = useIdentidadeVisual();
  const [edicao, setEdicao] = useState<IdentidadeVisual>(identidade);
  const [mensagem, setMensagem] = useState("");

  function atualizar<K extends keyof IdentidadeVisual>(campo: K, valor: IdentidadeVisual[K]) {
    setEdicao((atual) => ({ ...atual, [campo]: valor }));
    setMensagem("");
  }

  async function selecionarImagem(evento: ChangeEvent<HTMLInputElement>, campo: "iconeAplicacao" | "favicon") {
    try {
      const imagem = await lerImagem(evento);
      if (imagem) atualizar(campo, imagem);
    } catch (erro) {
      setMensagem(erro instanceof Error ? erro.message : "Não foi possível carregar a imagem.");
    } finally {
      evento.target.value = "";
    }
  }

  function salvar() {
    const nome = edicao.nomeAplicacao.trim();
    if (nome.length < 2 || nome.length > 60) {
      setMensagem("O nome da plataforma deve ter entre 2 e 60 caracteres.");
      return;
    }
    salvarIdentidade({ ...edicao, nomeAplicacao: nome });
    setMensagem("Identidade visual salva neste dispositivo.");
  }

  function restaurar() {
    restaurarIdentidade();
    window.location.reload();
  }

  return <section className="pagina-interna configuracoes">
    <div className="abas-configuracao" role="tablist" aria-label="Configurações">
      <button className={aba === "materiais" ? "ativo" : ""} onClick={() => setAba("materiais")} role="tab" aria-selected={aba === "materiais"}>Materiais</button>
      <button className={aba === "identidade" ? "ativo" : ""} onClick={() => setAba("identidade")} role="tab" aria-selected={aba === "identidade"}>Identidade visual</button>
      <button disabled title="Disponível em uma próxima etapa">Pontos de apoio</button>
      <button disabled title="Disponível em uma próxima etapa">Responsáveis</button>
    </div>

    {aba === "identidade" ? <div className="painel-identidade">
      <div className="resumo-pagina"><div><h2>Identidade da plataforma</h2><p>Altere nome, ícones e cores. A prévia é atualizada ao salvar.</p></div></div>
      <div className="grade-identidade">
        <form className="formulario-identidade" onSubmit={(evento) => evento.preventDefault()}>
          <label className="campo" htmlFor="nome-plataforma">Nome da plataforma
            <input id="nome-plataforma" value={edicao.nomeAplicacao} maxLength={60} onChange={(evento) => atualizar("nomeAplicacao", evento.target.value)} />
          </label>

          <div className="grade-envios-identidade">
            <div className="envio-identidade">
              <span className="preview-imagem"><img src={edicao.iconeAplicacao} alt="Prévia do ícone da plataforma" /></span>
              <div><strong>Ícone da plataforma</strong><small>Usado no login e no menu lateral.</small><label className="botao-secundario botao-arquivo" htmlFor="icone-plataforma">Escolher imagem</label><input id="icone-plataforma" type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(evento) => void selecionarImagem(evento, "iconeAplicacao")} /></div>
            </div>
            <div className="envio-identidade">
              <span className="preview-imagem pequeno"><img src={edicao.favicon} alt="Prévia do favicon" /></span>
              <div><strong>Favicon</strong><small>Exibido na aba do navegador.</small><label className="botao-secundario botao-arquivo" htmlFor="favicon-plataforma">Escolher imagem</label><input id="favicon-plataforma" type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(evento) => void selecionarImagem(evento, "favicon")} /></div>
            </div>
          </div>

          <fieldset className="cores-identidade"><legend>Cores da plataforma</legend>
            <label htmlFor="cor-primaria"><input id="cor-primaria" type="color" value={edicao.corPrimaria} onChange={(evento) => atualizar("corPrimaria", evento.target.value)} /><span><strong>Cor principal</strong><small>{edicao.corPrimaria}</small></span></label>
            <label htmlFor="cor-escura"><input id="cor-escura" type="color" value={edicao.corPrimariaEscura} onChange={(evento) => atualizar("corPrimariaEscura", evento.target.value)} /><span><strong>Cor de destaque</strong><small>{edicao.corPrimariaEscura}</small></span></label>
            <label htmlFor="cor-fundo"><input id="cor-fundo" type="color" value={edicao.corFundo} onChange={(evento) => atualizar("corFundo", evento.target.value)} /><span><strong>Cor de fundo</strong><small>{edicao.corFundo}</small></span></label>
          </fieldset>

          {mensagem && <p className="mensagem-configuracao" role="status">{mensagem}</p>}
          <div className="acoes-identidade"><button type="button" className="botao-secundario" onClick={restaurar}>Restaurar padrão</button><button type="button" className="botao-primario" onClick={salvar}>Salvar identidade</button></div>
        </form>

        <aside className="preview-identidade" style={{ background: `linear-gradient(145deg, ${edicao.corFundo}, color-mix(in srgb, ${edicao.corPrimaria} 12%, white))` }}>
          <small>PRÉVIA</small><span className="preview-logo"><img src={edicao.iconeAplicacao} alt="" /></span><h3>{edicao.nomeAplicacao || "Nome da plataforma"}</h3><p>Gestão que transforma</p><button type="button" style={{ background: edicao.corPrimaria }}>Ação principal</button>
        </aside>
      </div>
    </div> : <>
      <div className="resumo-pagina"><div><h2>Materiais e valores</h2><p>Defina unidades, referências de quantidade e valores pagos.</p></div><button className="botao-primario" onClick={() => setModal(true)}>＋ Novo material</button></div>
      <div className="lista-materiais">{materiais.map((material) => <article key={material.uuid}><span className="amostra-material" style={{ background: material.cor }}>{material.tipo.slice(0, 2).toUpperCase()}</span><div className="nome-material"><strong>{material.nome}</strong><small>{material.tipo} · {material.unidade.toUpperCase()}</small></div><div><small>Referência de pagamento</small><strong>R$ {material.valorReferencia.toFixed(2).replace(".", ",")} a cada {material.quantidadeReferencia} {material.unidade}</strong></div><span className={material.ativo ? "status ativo" : "status"}>● {material.ativo ? "Ativo" : "Inativo"}</span><button className="botao-secundario">Editar</button><button className="menu-acoes" onClick={() => setMateriais((lista) => lista.filter((item) => item.uuid !== material.uuid))} aria-label={`Excluir ${material.nome}`}>×</button></article>)}</div>
      <div className="nota-configuracao"><span>i</span><p><strong>Como o valor é calculado?</strong><br />A referência permite pagar, por exemplo, R$ 10,00 a cada 20 kg. O sistema calcula proporcionalmente e mostra o total antes da confirmação.</p></div>
    </>}

    {modal && <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-material"><div className="modal pequeno"><header className="cabecalho-modal"><div><span>CONFIGURAÇÃO</span><h2 id="titulo-material">Novo material</h2><p>Configure como o material será pesado e pago.</p></div><button onClick={() => setModal(false)} aria-label="Fechar">×</button></header><form className="formulario"><div className="grade-formulario"><label className="campo campo-largo">Nome do material<input placeholder="Ex.: Garrafa PET" /></label><label className="campo">Tipo<select><option>Plástico</option><option>Metal</option><option>Papel</option><option>Vidro</option><option>Misto</option><option>Outro</option></select></label><label className="campo">Unidade<select><option>kg</option><option>unidade</option><option>fardo</option><option>litro</option></select></label><label className="campo">Quantidade de referência<input type="number" min="0.01" step="0.01" defaultValue="1" /></label><label className="campo">Valor pago na referência<input inputMode="decimal" placeholder="R$ 0,00" /></label></div><label className="interruptor compacto"><input type="checkbox" defaultChecked /><span /><div><strong>Material ativo para novas pesagens</strong></div></label></form><footer className="rodape-modal"><button className="botao-secundario" onClick={() => setModal(false)}>Cancelar</button><button className="botao-primario" onClick={() => setModal(false)}>Salvar material</button></footer></div></div>}
  </section>;
}

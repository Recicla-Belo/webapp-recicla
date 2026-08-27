"use client";

/* eslint-disable jsx-a11y/label-has-associated-control, @next/next/no-img-element -- controles compostos usam associação explícita e as imagens configuráveis podem ser data URLs locais */

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { requisitarApi, type MaterialApi, type ResponsavelPesagemApi } from "@/app/dados/api";
import { useIdentidadeVisual, type IdentidadeVisual } from "@/app/configuracao/identidade-visual";

type AbaConfiguracao = "materiais" | "responsaveis" | "identidade";

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
  const [materiais, setMateriais] = useState<MaterialApi[]>([]);
  const [modal, setModal] = useState(false);
  const [materialEdicao, setMaterialEdicao] = useState<MaterialApi | null>(null);
  const [formMaterial, setFormMaterial] = useState({ nome: "", tipoMaterial: "Outro", unidade: "kg", quantidadeReferencia: "1", valorReferencia: "0", metaDiaria: "20", ativo: true });
  const [responsaveis, setResponsaveis] = useState<ResponsavelPesagemApi[]>([]);
  const [modalResponsavel, setModalResponsavel] = useState(false);
  const [responsavelEdicao, setResponsavelEdicao] = useState<ResponsavelPesagemApi | null>(null);
  const [formResponsavel, setFormResponsavel] = useState({ nome: "", ativo: true });
  const { identidade, salvarIdentidade, restaurarIdentidade } = useIdentidadeVisual();
  const [edicao, setEdicao] = useState<IdentidadeVisual>(identidade);
  const [mensagem, setMensagem] = useState("");
  const carregarMateriais = useCallback(async () => { try { const dados = await requisitarApi<{ dados: MaterialApi[] }>("/api/materiais"); setMateriais(dados.dados); } catch (erro) { setMensagem(erro instanceof Error ? erro.message : "Não foi possível carregar os materiais."); } }, []);
  const carregarResponsaveis = useCallback(async () => { try { const dados = await requisitarApi<{ dados: ResponsavelPesagemApi[] }>("/api/responsaveis-pesagem?incluirInativos=true"); setResponsaveis(dados.dados); } catch (erro) { setMensagem(erro instanceof Error ? erro.message : "Não foi possível carregar os responsáveis."); } }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void Promise.all([carregarMateriais(), carregarResponsaveis()]); }, [carregarMateriais, carregarResponsaveis]);

  function abrirMaterial(material?: MaterialApi) {
    setMaterialEdicao(material ?? null);
    setFormMaterial(material ? { nome: material.nome, tipoMaterial: material.tipo_material, unidade: material.unidade, quantidadeReferencia: String(material.quantidade_referencia), valorReferencia: String(material.valor_referencia), metaDiaria: String(material.meta_diaria), ativo: material.status === "ativo" } : { nome: "", tipoMaterial: "Outro", unidade: "kg", quantidadeReferencia: "1", valorReferencia: "0", metaDiaria: "20", ativo: true });
    setModal(true);
  }

  async function salvarMaterial() {
    try {
      await requisitarApi(materialEdicao ? `/api/materiais/${materialEdicao.uuid}` : "/api/materiais", { method: materialEdicao ? "PUT" : "POST", body: JSON.stringify({ ...formMaterial, quantidadeReferencia: Number(formMaterial.quantidadeReferencia.replace(",", ".")), valorReferencia: Number(formMaterial.valorReferencia.replace(",", ".")), metaDiaria: Number(formMaterial.metaDiaria.replace(",", ".")) }) });
      setModal(false); await carregarMateriais();
    } catch (erro) { setMensagem(erro instanceof Error ? erro.message : "Não foi possível salvar o material."); }
  }

  async function excluirMaterial(material: MaterialApi) {
    if (!window.confirm(`Excluir ${material.nome}?`)) return;
    try { await requisitarApi(`/api/materiais/${material.uuid}`, { method: "DELETE" }); await carregarMateriais(); }
    catch (erro) { setMensagem(erro instanceof Error ? erro.message : "Não foi possível excluir o material."); }
  }

  function abrirResponsavel(responsavel?: ResponsavelPesagemApi) {
    setResponsavelEdicao(responsavel ?? null);
    setFormResponsavel(responsavel ? { nome: responsavel.nome, ativo: responsavel.status === "ativo" } : { nome: "", ativo: true });
    setMensagem(""); setModalResponsavel(true);
  }

  async function salvarResponsavel() {
    try {
      await requisitarApi(responsavelEdicao ? `/api/responsaveis-pesagem/${responsavelEdicao.uuid}` : "/api/responsaveis-pesagem", { method: responsavelEdicao ? "PUT" : "POST", body: JSON.stringify(formResponsavel) });
      setModalResponsavel(false); await carregarResponsaveis(); setMensagem("Responsável salvo com sucesso.");
    } catch (erro) { setMensagem(erro instanceof Error ? erro.message : "Não foi possível salvar o responsável."); }
  }

  async function excluirResponsavel(responsavel: ResponsavelPesagemApi) {
    if (!window.confirm(`Remover ${responsavel.nome} das novas pesagens? O histórico será preservado.`)) return;
    try { await requisitarApi(`/api/responsaveis-pesagem/${responsavel.uuid}`, { method: "DELETE" }); await carregarResponsaveis(); setMensagem("Responsável removido das novas pesagens."); }
    catch (erro) { setMensagem(erro instanceof Error ? erro.message : "Não foi possível excluir o responsável."); }
  }

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
      <button className={aba === "responsaveis" ? "ativo" : ""} onClick={() => setAba("responsaveis")} role="tab" aria-selected={aba === "responsaveis"}>Responsáveis pela pesagem</button>
      <button className={aba === "identidade" ? "ativo" : ""} onClick={() => setAba("identidade")} role="tab" aria-selected={aba === "identidade"}>Identidade visual</button>
      <button disabled title="Disponível em uma próxima etapa">Pontos de apoio</button>
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
    </div> : aba === "responsaveis" ? <div className="painel-responsaveis">
      <div className="resumo-pagina"><div><h2>Responsáveis pela pesagem</h2><p>Cadastre quem pode ser selecionado nas novas pesagens. Registros antigos permanecem preservados.</p></div><button className="botao-primario" onClick={() => abrirResponsavel()}><Plus /> Novo responsável</button></div>
      {mensagem && <p className="mensagem-configuracao" role="status">{mensagem}</p>}
      <div className="lista-responsaveis">{responsaveis.length === 0 ? <p className="estado-vazio">Nenhum responsável cadastrado.</p> : responsaveis.map((responsavel) => <article key={responsavel.uuid}><span>{responsavel.nome.split(/\s+/).slice(0, 2).map((parte) => parte[0]).join("").toUpperCase()}</span><div><strong>{responsavel.nome}</strong><small>{responsavel.status === "ativo" ? "Disponível para novas pesagens" : "Removido das novas pesagens"}</small></div><em className={responsavel.status === "ativo" ? "status ativo" : "status"}>● {responsavel.status}</em><button className="botao-secundario" onClick={() => abrirResponsavel(responsavel)}><Pencil /> Editar</button><button className="menu-acoes perigoso" onClick={() => void excluirResponsavel(responsavel)} disabled={responsavel.status === "inativo"} aria-label={`Excluir ${responsavel.nome}`}><Trash2 /></button></article>)}</div>
    </div> : <>
      <div className="resumo-pagina"><div><h2>Materiais e valores</h2><p>Configurações armazenadas no PostgreSQL.</p></div><button className="botao-primario" onClick={() => abrirMaterial()}><Plus /> Novo material</button></div>
      {mensagem && <p className="mensagem-configuracao" role="status">{mensagem}</p>}
      <div className="lista-materiais">{materiais.map((material) => <article key={material.uuid}><span className="amostra-material">{material.tipo_material.slice(0, 2).toUpperCase()}</span><div className="nome-material"><strong>{material.nome}</strong><small>{material.tipo_material} · {material.unidade.toUpperCase()}</small></div><div><small>Pagamento e meta diária</small><strong>{Number(material.valor_referencia).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} / {Number(material.quantidade_referencia)} {material.unidade} · {Number(material.meta_diaria) > 0 ? `Meta ${Number(material.meta_diaria)} ${material.unidade}` : "Sem meta"}</strong></div><span className={material.status === "ativo" ? "status ativo" : "status"}>● {material.status}</span><button className="botao-secundario" onClick={() => abrirMaterial(material)}><Pencil /> Editar</button><button className="menu-acoes perigoso" onClick={() => void excluirMaterial(material)} aria-label={`Excluir ${material.nome}`}><Trash2 /></button></article>)}</div>
      <div className="nota-configuracao"><span>i</span><p><strong>Como o valor é calculado?</strong><br />Com meta, o valor fica zerado até o peso acumulado do dia atingir a meta; nesse momento, o total proporcional é liberado. Use meta 0 para pagamento imediato, sem meta.</p></div>
    </>}

    {modal && <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-material"><div className="modal pequeno"><header className="cabecalho-modal"><div><span>CONFIGURAÇÃO</span><h2 id="titulo-material">{materialEdicao ? "Editar material" : "Novo material"}</h2><p>Pagamento e meta serão preservados em cada pesagem.</p></div><button onClick={() => setModal(false)} aria-label="Fechar">×</button></header><form className="formulario" onSubmit={(e) => e.preventDefault()}><div className="grade-formulario"><label className="campo campo-largo">Nome do material<input value={formMaterial.nome} onChange={(e) => setFormMaterial((f) => ({ ...f, nome: e.target.value }))} /></label><label className="campo">Tipo<select value={formMaterial.tipoMaterial} onChange={(e) => setFormMaterial((f) => ({ ...f, tipoMaterial: e.target.value }))}><option>Plástico</option><option>Metal</option><option>Papel</option><option>Vidro</option><option>Misto</option><option>Outro</option></select></label><label className="campo">Unidade<select value={formMaterial.unidade} onChange={(e) => setFormMaterial((f) => ({ ...f, unidade: e.target.value }))}><option>kg</option><option>unidade</option><option>fardo</option><option>litro</option></select></label><label className="campo">Quantidade de referência<input value={formMaterial.quantidadeReferencia} inputMode="decimal" onChange={(e) => setFormMaterial((f) => ({ ...f, quantidadeReferencia: e.target.value }))} /></label><label className="campo">Valor pago na referência<input value={formMaterial.valorReferencia} inputMode="decimal" onChange={(e) => setFormMaterial((f) => ({ ...f, valorReferencia: e.target.value }))} /></label><label className="campo campo-largo">Meta diária por catador<input value={formMaterial.metaDiaria} inputMode="decimal" onChange={(e) => setFormMaterial((f) => ({ ...f, metaDiaria: e.target.value }))} /><small className="dica">Ex.: 20 kg. Informe 0 para não exigir meta e pagar imediatamente.</small></label></div><label className="interruptor compacto"><input type="checkbox" checked={formMaterial.ativo} onChange={(e) => setFormMaterial((f) => ({ ...f, ativo: e.target.checked }))} /><span /><div><strong>Material ativo para novas pesagens</strong></div></label></form><footer className="rodape-modal"><button className="botao-secundario" onClick={() => setModal(false)}>Cancelar</button><button className="botao-primario" onClick={() => void salvarMaterial()}>Salvar material</button></footer></div></div>}
    {modalResponsavel && <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-responsavel"><div className="modal pequeno"><header className="cabecalho-modal"><div><span>EQUIPE DE PESAGEM</span><h2 id="titulo-responsavel">{responsavelEdicao ? "Editar responsável" : "Novo responsável"}</h2><p>O nome ativo aparecerá no formulário de pesagem e produção.</p></div><button onClick={() => setModalResponsavel(false)} aria-label="Fechar">×</button></header><form className="formulario" onSubmit={(e) => e.preventDefault()}><label className="campo">Nome completo<input value={formResponsavel.nome} onChange={(e) => setFormResponsavel((atual) => ({ ...atual, nome: e.target.value }))} /></label><label className="interruptor compacto"><input type="checkbox" checked={formResponsavel.ativo} onChange={(e) => setFormResponsavel((atual) => ({ ...atual, ativo: e.target.checked }))} /><span /><div><strong>Disponível para novas pesagens</strong></div></label>{mensagem && <p className="mensagem-configuracao" role="status">{mensagem}</p>}</form><footer className="rodape-modal"><button className="botao-secundario" onClick={() => setModalResponsavel(false)}>Cancelar</button><button className="botao-primario" onClick={() => void salvarResponsavel()} disabled={formResponsavel.nome.trim().length < 2}>Salvar responsável</button></footer></div></div>}
  </section>;
}

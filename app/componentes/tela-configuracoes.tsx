"use client";

/* eslint-disable jsx-a11y/label-has-associated-control, @next/next/no-img-element -- controles compostos usam associação explícita e as imagens configuráveis podem ser data URLs locais */

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
import { requisitarApi, type AdministradorApi, type ConfiguracaoMetaGeralApi, type MaterialApi, type ResponsavelPesagemApi } from "@/app/dados/api";
import { useIdentidadeVisual, type IdentidadeVisual } from "@/app/configuracao/identidade-visual";
import { ModalConfirmacao } from "@/app/componentes/modal-confirmacao";
import { Paginacao } from "@/app/componentes/paginacao";

type AbaConfiguracao = "materiais" | "responsaveis" | "identidade" | "conta";

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

export function TelaConfiguracoes({ administrador, onAdministradorAtualizado }: { administrador: AdministradorApi; onAdministradorAtualizado: (administrador: AdministradorApi) => void }) {
  const [aba, setAba] = useState<AbaConfiguracao>("materiais");
  const [materiais, setMateriais] = useState<MaterialApi[]>([]);
  const [modal, setModal] = useState(false);
  const [materialEdicao, setMaterialEdicao] = useState<MaterialApi | null>(null);
  const [formMaterial, setFormMaterial] = useState({ nome: "", tipoMaterial: "Outro", unidade: "kg", quantidadeReferencia: "1", valorReferencia: "0", metaDiaria: "", validoParaMeta: true, ativo: true });
  const [responsaveis, setResponsaveis] = useState<ResponsavelPesagemApi[]>([]);
  const [modalResponsavel, setModalResponsavel] = useState(false);
  const [responsavelEdicao, setResponsavelEdicao] = useState<ResponsavelPesagemApi | null>(null);
  const [formResponsavel, setFormResponsavel] = useState({ nome: "", ativo: true });
  const { identidade, salvarIdentidade, restaurarIdentidade } = useIdentidadeVisual();
  const [edicao, setEdicao] = useState<IdentidadeVisual>(identidade);
  const [mensagem, setMensagem] = useState("");
  const [metaGeral, setMetaGeral] = useState({ ativa: false, metaDiaria: "0", unidade: "kg" });
  const [salvandoMetaGeral, setSalvandoMetaGeral] = useState(false);
  const [confirmacaoExclusao, setConfirmacaoExclusao] = useState<{ tipo: "material" | "responsavel"; item: MaterialApi | ResponsavelPesagemApi } | null>(null);
  const [paginaMateriais, setPaginaMateriais] = useState(1);
  const [paginaResponsaveis, setPaginaResponsaveis] = useState(1);
  const [modoConta, setModoConta] = useState<"nenhum" | "dados" | "senha">("nenhum");
  const [dadosConta, setDadosConta] = useState({ nome: administrador.nome, email: administrador.email, senhaAtual: "" });
  const [dadosSenha, setDadosSenha] = useState({ senhaAtual: "", novaSenha: "", confirmarSenha: "" });
  const [salvandoConta, setSalvandoConta] = useState(false);
  const itensPorPagina = 6;
  const carregarMateriais = useCallback(async () => { try { const dados = await requisitarApi<{ dados: MaterialApi[] }>("/api/materiais"); setMateriais(dados.dados); setPaginaMateriais((paginaAtual) => Math.min(paginaAtual, Math.max(1, Math.ceil(dados.dados.length / itensPorPagina)))); } catch (erro) { setMensagem(erro instanceof Error ? erro.message : "Não foi possível carregar os materiais."); } }, []);
  const carregarResponsaveis = useCallback(async () => { try { const dados = await requisitarApi<{ dados: ResponsavelPesagemApi[] }>("/api/responsaveis-pesagem?incluirInativos=true"); setResponsaveis(dados.dados); setPaginaResponsaveis((paginaAtual) => Math.min(paginaAtual, Math.max(1, Math.ceil(dados.dados.length / itensPorPagina)))); } catch (erro) { setMensagem(erro instanceof Error ? erro.message : "Não foi possível carregar os responsáveis."); } }, []);
  const carregarMetaGeral = useCallback(async () => { try { const dados = await requisitarApi<ConfiguracaoMetaGeralApi>("/api/configuracoes/meta-geral"); setMetaGeral({ ativa: dados.ativa, metaDiaria: String(dados.meta_diaria), unidade: dados.unidade }); } catch (erro) { setMensagem(erro instanceof Error ? erro.message : "Não foi possível carregar a meta geral."); } }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void Promise.all([carregarMateriais(), carregarResponsaveis(), carregarMetaGeral()]); }, [carregarMateriais, carregarMetaGeral, carregarResponsaveis]);

  function abrirMaterial(material?: MaterialApi) {
    setMaterialEdicao(material ?? null);
    setFormMaterial(material ? { nome: material.nome, tipoMaterial: material.tipo_material, unidade: material.unidade, quantidadeReferencia: String(material.quantidade_referencia), valorReferencia: String(material.valor_referencia), metaDiaria: String(material.meta_diaria), validoParaMeta: material.contabiliza_meta, ativo: material.status === "ativo" } : { nome: "", tipoMaterial: "Outro", unidade: "kg", quantidadeReferencia: "1", valorReferencia: "0", metaDiaria: "", validoParaMeta: true, ativo: true });
    setModal(true);
  }

  async function salvarMaterial() {
    try {
      await requisitarApi(materialEdicao ? `/api/materiais/${materialEdicao.uuid}` : "/api/materiais", { method: materialEdicao ? "PUT" : "POST", body: JSON.stringify({ ...formMaterial, quantidadeReferencia: Number(formMaterial.quantidadeReferencia.replace(",", ".")), valorReferencia: Number(formMaterial.valorReferencia.replace(",", ".")), metaDiaria: Number(formMaterial.metaDiaria.replace(",", ".")) }) });
      setModal(false); await carregarMateriais();
    } catch (erro) { setMensagem(erro instanceof Error ? erro.message : "Não foi possível salvar o material."); }
  }

  async function excluirMaterial(material: MaterialApi) {
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
    try { await requisitarApi(`/api/responsaveis-pesagem/${responsavel.uuid}`, { method: "DELETE" }); await carregarResponsaveis(); setMensagem("Responsável excluído. O nome foi preservado somente nas pesagens antigas."); }
    catch (erro) { setMensagem(erro instanceof Error ? erro.message : "Não foi possível excluir o responsável."); }
  }

  async function confirmarExclusao() {
    if (!confirmacaoExclusao) return;
    const { tipo, item } = confirmacaoExclusao;
    setConfirmacaoExclusao(null);
    if (tipo === "material") await excluirMaterial(item as MaterialApi);
    else await excluirResponsavel(item as ResponsavelPesagemApi);
  }

  async function salvarMetaGeral() {
    const valor = Number(metaGeral.metaDiaria.replace(",", "."));
    if (!Number.isFinite(valor) || valor < 0 || (metaGeral.ativa && valor <= 0)) { setMensagem("Informe uma meta geral maior que zero para ativá-la."); return; }
    setSalvandoMetaGeral(true); setMensagem("");
    try {
      await requisitarApi("/api/configuracoes/meta-geral", { method: "PUT", body: JSON.stringify({ ativa: metaGeral.ativa, metaDiaria: valor, unidade: metaGeral.unidade }) });
      setMensagem("Meta geral atualizada. A alteração valerá para os próximos caixas diários abertos.");
      await carregarMetaGeral();
    } catch (erro) { setMensagem(erro instanceof Error ? erro.message : "Não foi possível salvar a meta geral."); }
    finally { setSalvandoMetaGeral(false); }
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

  function cancelarConta() {
    setModoConta("nenhum");
    setDadosConta({ nome: administrador.nome, email: administrador.email, senhaAtual: "" });
    setDadosSenha({ senhaAtual: "", novaSenha: "", confirmarSenha: "" });
    setMensagem("");
  }

  async function salvarDadosConta() {
    setMensagem("");
    if (dadosConta.nome.trim().length < 2 || !dadosConta.email.includes("@") || !dadosConta.senhaAtual) { setMensagem("Preencha nome, e-mail e confirme com a senha atual."); return; }
    setSalvandoConta(true);
    try {
      const perfil = await requisitarApi<AdministradorApi>("/api/administrador/perfil", { method: "PATCH", body: JSON.stringify(dadosConta) });
      onAdministradorAtualizado(perfil);
      setModoConta("nenhum");
      setDadosConta({ nome: perfil.nome, email: perfil.email, senhaAtual: "" });
      setMensagem("Dados da conta administrativa atualizados com segurança.");
    } catch (erro) { setMensagem(erro instanceof Error ? erro.message : "Não foi possível atualizar a conta."); }
    finally { setSalvandoConta(false); }
  }

  async function salvarSenhaConta() {
    setMensagem("");
    if (dadosSenha.novaSenha.length < 12) { setMensagem("A nova senha deve ter pelo menos 12 caracteres."); return; }
    if (dadosSenha.novaSenha !== dadosSenha.confirmarSenha) { setMensagem("A confirmação não corresponde à nova senha."); return; }
    setSalvandoConta(true);
    try {
      await requisitarApi("/api/administrador/senha", { method: "PATCH", body: JSON.stringify({ senhaAtual: dadosSenha.senhaAtual, novaSenha: dadosSenha.novaSenha }) });
      setModoConta("nenhum");
      setDadosSenha({ senhaAtual: "", novaSenha: "", confirmarSenha: "" });
      setMensagem("Senha alterada. As outras sessões da conta foram revogadas.");
    } catch (erro) { setMensagem(erro instanceof Error ? erro.message : "Não foi possível alterar a senha."); }
    finally { setSalvandoConta(false); }
  }

  const materiaisPaginados = materiais.slice((paginaMateriais - 1) * itensPorPagina, paginaMateriais * itensPorPagina);
  const responsaveisPaginados = responsaveis.slice((paginaResponsaveis - 1) * itensPorPagina, paginaResponsaveis * itensPorPagina);

  return <section className="pagina-interna configuracoes">
    <div className="abas-configuracao" role="tablist" aria-label="Configurações">
      <button className={aba === "materiais" ? "ativo" : ""} onClick={() => setAba("materiais")} role="tab" aria-selected={aba === "materiais"}>Materiais</button>
      <button className={aba === "responsaveis" ? "ativo" : ""} onClick={() => setAba("responsaveis")} role="tab" aria-selected={aba === "responsaveis"}>Responsáveis pela pesagem</button>
      <button className={aba === "identidade" ? "ativo" : ""} onClick={() => setAba("identidade")} role="tab" aria-selected={aba === "identidade"}>Identidade visual</button>
      <button className={aba === "conta" ? "ativo" : ""} onClick={() => { setAba("conta"); cancelarConta(); }} role="tab" aria-selected={aba === "conta"}>Conta do administrador</button>
      <button disabled title="Disponível em uma próxima etapa">Pontos de apoio</button>
    </div>

    {aba === "conta" ? <section className="painel conta-administrador">
      <header className="cabecalho-conta"><span><ShieldCheck /></span><div><small>CONTA PROTEGIDA</small><h2>Administrador da plataforma</h2><p>Os campos permanecem bloqueados até você escolher o que deseja alterar.</p></div></header>
      <div className="resumo-conta"><div><small>Nome</small><strong>{administrador.nome}</strong></div><div><small>E-mail de acesso</small><strong>{administrador.email}</strong></div><div><small>Nível de acesso</small><strong>Administrador único</strong></div></div>
      {modoConta === "nenhum" ? <div className="acoes-conta"><button type="button" className="botao-secundario" onClick={() => { setModoConta("dados"); setMensagem(""); }}><UserRound /> Alterar nome ou e-mail</button><button type="button" className="botao-secundario" onClick={() => { setModoConta("senha"); setMensagem(""); }}><KeyRound /> Alterar senha</button></div> : <form className="formulario-conta" onSubmit={(evento) => evento.preventDefault()}>
        <header><div><small>{modoConta === "dados" ? "DADOS DE ACESSO" : "SEGURANÇA"}</small><h3>{modoConta === "dados" ? "Alterar nome ou e-mail" : "Definir uma nova senha"}</h3></div><button type="button" onClick={cancelarConta} aria-label="Cancelar alteração"><X /></button></header>
        {modoConta === "dados" ? <div className="grade-formulario"><label className="campo">Nome do administrador<input value={dadosConta.nome} maxLength={160} onChange={(evento) => setDadosConta((atual) => ({ ...atual, nome: evento.target.value }))} /></label><label className="campo">E-mail de acesso<input type="email" autoComplete="username" value={dadosConta.email} maxLength={254} onChange={(evento) => setDadosConta((atual) => ({ ...atual, email: evento.target.value }))} /></label><label className="campo campo-largo">Confirme com a senha atual<input type="password" autoComplete="current-password" value={dadosConta.senhaAtual} onChange={(evento) => setDadosConta((atual) => ({ ...atual, senhaAtual: evento.target.value }))} /></label></div> : <div className="grade-formulario"><label className="campo campo-largo">Senha atual<input type="password" autoComplete="current-password" value={dadosSenha.senhaAtual} onChange={(evento) => setDadosSenha((atual) => ({ ...atual, senhaAtual: evento.target.value }))} /></label><label className="campo">Nova senha<input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={dadosSenha.novaSenha} onChange={(evento) => setDadosSenha((atual) => ({ ...atual, novaSenha: evento.target.value }))} /><small className="dica">Use pelo menos 12 caracteres.</small></label><label className="campo">Confirmar nova senha<input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={dadosSenha.confirmarSenha} onChange={(evento) => setDadosSenha((atual) => ({ ...atual, confirmarSenha: evento.target.value }))} /></label></div>}
        <footer><button type="button" className="botao-secundario" onClick={cancelarConta}>Cancelar</button><button type="button" className="botao-primario" disabled={salvandoConta} onClick={() => void (modoConta === "dados" ? salvarDadosConta() : salvarSenhaConta())}>{salvandoConta ? "Salvando..." : "Confirmar alteração"}</button></footer>
      </form>}
      {mensagem && <p className="mensagem-configuracao" role="status">{mensagem}</p>}
    </section> : aba === "identidade" ? <div className="painel-identidade">
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
      <div className="lista-responsaveis">{responsaveis.length === 0 ? <p className="estado-vazio">Nenhum responsável cadastrado.</p> : responsaveisPaginados.map((responsavel) => <article key={responsavel.uuid}><span>{responsavel.nome.split(/\s+/).slice(0, 2).map((parte) => parte[0]).join("").toUpperCase()}</span><div><strong>{responsavel.nome}</strong><small>{responsavel.status === "ativo" ? "Disponível para novas pesagens" : "Cadastro inativo"}</small></div><em className={responsavel.status === "ativo" ? "status ativo" : "status"}>● {responsavel.status}</em><button className="botao-secundario" onClick={() => abrirResponsavel(responsavel)}><Pencil /> Editar</button><button className="menu-acoes perigoso" onClick={() => setConfirmacaoExclusao({ tipo: "responsavel", item: responsavel })} aria-label={`Excluir ${responsavel.nome}`}><Trash2 /></button></article>)}</div>
      <Paginacao pagina={paginaResponsaveis} total={responsaveis.length} itensPorPagina={itensPorPagina} aoMudarPagina={setPaginaResponsaveis} rotulo="responsáveis" />
    </div> : <>
      <div className="resumo-pagina"><div><h2>Materiais e valores</h2><p>Configurações armazenadas no PostgreSQL.</p></div><button className="botao-primario" onClick={() => abrirMaterial()}><Plus /> Novo material</button></div>
      {mensagem && <p className="mensagem-configuracao" role="status">{mensagem}</p>}
      <section className="painel configuracao-meta-geral"><header><div><span>META FINANCEIRA PRINCIPAL</span><h3>Meta geral diária</h3><p>Quando ativa, soma somente materiais e entregas escolhidos para a meta e prevalece sobre as metas específicas.</p></div><label className="interruptor compacto"><input type="checkbox" checked={metaGeral.ativa} onChange={(evento) => setMetaGeral((atual) => ({ ...atual, ativa: evento.target.checked }))} /><span /><div><strong>{metaGeral.ativa ? "Meta geral ativa" : "Meta geral desativada"}</strong></div></label></header><div className="grade-formulario"><label className="campo">Quantidade diária<input inputMode="decimal" value={metaGeral.metaDiaria} onChange={(evento) => setMetaGeral((atual) => ({ ...atual, metaDiaria: evento.target.value }))} /></label><label className="campo">Unidade<select value={metaGeral.unidade} onChange={(evento) => setMetaGeral((atual) => ({ ...atual, unidade: evento.target.value }))}><option value="kg">kg</option></select></label><button type="button" className="botao-primario" onClick={() => void salvarMetaGeral()} disabled={salvandoMetaGeral}>{salvandoMetaGeral ? "Salvando..." : "Salvar meta geral"}</button></div><small>A configuração é congelada na abertura de cada caixa diário para preservar a auditoria. Caixas já abertos mantêm a regra original.</small></section>
      <div className="lista-materiais">{materiaisPaginados.map((material) => <article key={material.uuid}><span className="amostra-material">{material.tipo_material.slice(0, 2).toUpperCase()}</span><div className="nome-material"><strong>{material.nome}</strong><small>{material.tipo_material} · {material.unidade.toUpperCase()}</small></div><div><small>Pagamento e meta diária</small><strong>{Number(material.valor_referencia).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} / {Number(material.quantidade_referencia)} {material.unidade} · {material.contabiliza_meta ? Number(material.meta_diaria) > 0 ? `Meta ${Number(material.meta_diaria)} ${material.unidade}` : "Válido para a meta geral" : "Fora das metas · pagamento imediato"}</strong></div><span className={material.status === "ativo" ? "status ativo" : "status"}>● {material.status}</span><div className="acoes-material"><button className="menu-acoes editar" onClick={() => abrirMaterial(material)} aria-label={`Editar ${material.nome}`} title="Editar material"><Pencil /></button><button className="menu-acoes perigoso" onClick={() => setConfirmacaoExclusao({ tipo: "material", item: material })} aria-label={`Excluir ${material.nome}`} title="Excluir material"><Trash2 /></button></div></article>)}</div>
      <Paginacao pagina={paginaMateriais} total={materiais.length} itensPorPagina={itensPorPagina} aoMudarPagina={setPaginaMateriais} rotulo="materiais" />
      <div className="nota-configuracao"><span>i</span><p><strong>Como o valor é calculado?</strong><br />Somente materiais marcados como válidos podem compor metas. Mesmo nesses materiais, a equipe pode registrar uma entrega fora da meta e liberar o pagamento imediatamente. A escolha fica preservada no histórico.</p></div>
    </>}

    {modal && <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-material"><div className="modal pequeno"><header className="cabecalho-modal"><div><span>CONFIGURAÇÃO</span><h2 id="titulo-material">{materialEdicao ? "Editar material" : "Novo material"}</h2><p>Pagamento e meta serão preservados em cada pesagem.</p></div><button onClick={() => setModal(false)} aria-label="Fechar">×</button></header><form className="formulario" onSubmit={(e) => e.preventDefault()}><div className="grade-formulario"><label className="campo campo-largo">Nome do material<input value={formMaterial.nome} onChange={(e) => setFormMaterial((f) => ({ ...f, nome: e.target.value }))} /></label><label className="campo">Tipo<select value={formMaterial.tipoMaterial} onChange={(e) => setFormMaterial((f) => ({ ...f, tipoMaterial: e.target.value }))}><option>Plástico</option><option>Metal</option><option>Papel</option><option>Vidro</option><option>Misto</option><option>Outro</option></select></label><label className="campo">Unidade<select value={formMaterial.unidade} onChange={(e) => setFormMaterial((f) => ({ ...f, unidade: e.target.value }))}><option>kg</option><option>unidade</option><option>fardo</option><option>litro</option></select></label><label className="campo">Quantidade de referência<input value={formMaterial.quantidadeReferencia} inputMode="decimal" onChange={(e) => setFormMaterial((f) => ({ ...f, quantidadeReferencia: e.target.value }))} /></label><label className="campo">Valor pago na referência<input value={formMaterial.valorReferencia} inputMode="decimal" onChange={(e) => setFormMaterial((f) => ({ ...f, valorReferencia: e.target.value }))} /></label><label className="campo campo-largo">Meta diária por catador<input value={formMaterial.metaDiaria} disabled={!formMaterial.validoParaMeta} inputMode="decimal" placeholder="Sem meta específica" onChange={(e) => setFormMaterial((f) => ({ ...f, metaDiaria: e.target.value }))} /><small className="dica">Deixe vazio ou informe 0 para usar apenas a meta geral, quando estiver ativa.</small></label></div><label className="interruptor compacto opcao-meta-material"><input type="checkbox" checked={formMaterial.validoParaMeta} onChange={(e) => setFormMaterial((f) => ({ ...f, validoParaMeta: e.target.checked, metaDiaria: e.target.checked ? f.metaDiaria : "" }))} /><span /><div><strong>Material válido para metas</strong><small>{formMaterial.validoParaMeta ? "Pode compor a meta geral ou a meta específica." : "Sempre será pago imediatamente e não aumentará nenhuma meta."}</small></div></label><label className="interruptor compacto"><input type="checkbox" checked={formMaterial.ativo} onChange={(e) => setFormMaterial((f) => ({ ...f, ativo: e.target.checked }))} /><span /><div><strong>Material ativo para novas pesagens</strong></div></label></form><footer className="rodape-modal"><button className="botao-secundario" onClick={() => setModal(false)}>Cancelar</button><button className="botao-primario" onClick={() => void salvarMaterial()}>Salvar material</button></footer></div></div>}
    {modalResponsavel && <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-responsavel"><div className="modal pequeno"><header className="cabecalho-modal"><div><span>EQUIPE DE PESAGEM</span><h2 id="titulo-responsavel">{responsavelEdicao ? "Editar responsável" : "Novo responsável"}</h2><p>O nome ativo aparecerá no formulário de pesagem e produção.</p></div><button onClick={() => setModalResponsavel(false)} aria-label="Fechar">×</button></header><form className="formulario" onSubmit={(e) => e.preventDefault()}><label className="campo">Nome completo<input value={formResponsavel.nome} onChange={(e) => setFormResponsavel((atual) => ({ ...atual, nome: e.target.value }))} /></label><label className="interruptor compacto"><input type="checkbox" checked={formResponsavel.ativo} onChange={(e) => setFormResponsavel((atual) => ({ ...atual, ativo: e.target.checked }))} /><span /><div><strong>Disponível para novas pesagens</strong></div></label>{mensagem && <p className="mensagem-configuracao" role="status">{mensagem}</p>}</form><footer className="rodape-modal"><button className="botao-secundario" onClick={() => setModalResponsavel(false)}>Cancelar</button><button className="botao-primario" onClick={() => void salvarResponsavel()} disabled={formResponsavel.nome.trim().length < 2}>Salvar responsável</button></footer></div></div>}
    <ModalConfirmacao aberto={Boolean(confirmacaoExclusao)} titulo={confirmacaoExclusao?.tipo === "material" ? `Excluir ${(confirmacaoExclusao.item as MaterialApi | undefined)?.nome}?` : `Excluir ${(confirmacaoExclusao?.item as ResponsavelPesagemApi | undefined)?.nome}?`} descricao={confirmacaoExclusao?.tipo === "material" ? "A exclusão só será permitida quando o material não possuir pesagens vinculadas." : "O cadastro será excluído definitivamente. Nas pesagens antigas, somente o nome do responsável continuará preservado para auditoria."} textoConfirmar="Confirmar exclusão" perigoso aoFechar={() => setConfirmacaoExclusao(null)} aoConfirmar={() => void confirmarExclusao()} />
  </section>;
}

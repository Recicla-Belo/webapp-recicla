"use client";

/* eslint-disable jsx-a11y/label-has-associated-control, jsx-a11y/no-autofocus, @next/next/no-img-element -- controles aninhados e fotos autenticadas */

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Camera, Plus, Search, Trash2 } from "lucide-react";
import { requisitarApi, URL_API, type CatadorApi, type CooperativaApi } from "@/app/dados/api";

const etapas = ["Identificação", "Contato e endereço", "Pagamento", "Foto e revisão"];
const vazio = { nomeCompleto: "", apelido: "", cooperativaUuid: "", genero: "", racaCor: "", dataNascimento: "", cpf: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "Belo Horizonte", estado: "MG", tipoPagamento: "pix", tipoChavePix: "CPF", chavePix: "", banco: "", agencia: "", numeroConta: "", tipoConta: "corrente", nomeTitular: "", cpfTitular: "", relacaoTitular: "" };

export function TelaCatadores() {
  const [catadores, setCatadores] = useState<CatadorApi[]>([]);
  const [cooperativas, setCooperativas] = useState<CooperativaApi[]>([]);
  const [busca, setBusca] = useState("");
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [erro, setErro] = useState("");
  const carregar = useCallback(async () => {
    try {
      const [listaCatadores, listaCooperativas] = await Promise.all([
        requisitarApi<{ dados: CatadorApi[] }>("/api/catadores?limite=100"),
        requisitarApi<{ dados: CooperativaApi[] }>("/api/cooperativas"),
      ]);
      setCatadores(listaCatadores.dados); setCooperativas(listaCooperativas.dados); setErro("");
    } catch (falha) { setErro(falha instanceof Error ? falha.message : "Não foi possível carregar os catadores."); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void carregar(); }, [carregar]);
  const filtrados = useMemo(() => catadores.filter((item) => `${item.nome_completo} ${item.apelido ?? ""} ${item.codigo}`.toLowerCase().includes(busca.toLowerCase())), [busca, catadores]);

  return <section className="pagina-interna">
    <div className="resumo-pagina"><div><h2>{catadores.length} catadores cadastrados</h2><p>Todos os registros exibidos vêm do PostgreSQL.</p></div><button className="botao-primario" onClick={() => setCadastroAberto(true)}><Plus /> Cadastrar catador</button></div>
    {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
    <div className="barra-ferramentas"><label className="campo-busca"><Search /><input value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="Buscar por nome, apelido ou código..." /></label></div>
    <div className="tabela-responsiva"><table><thead><tr><th>Catador</th><th>Código</th><th>Cooperativa</th><th>Contato</th><th>Coletado</th><th>Status</th></tr></thead><tbody>{filtrados.map((catador) => <tr key={catador.uuid}><td><div className="pessoa">{catador.tem_foto ? <img className="foto-lista" src={`${URL_API}/api/catadores/${catador.uuid}/foto`} alt={`Foto de ${catador.nome_completo}`} /> : <span>{iniciais(catador.nome_completo)}</span>}<div><strong>{catador.nome_completo}</strong><small>{catador.apelido ? `Prefere: ${catador.apelido}` : "Sem apelido informado"}</small></div></div></td><td><code>{catador.codigo}</code></td><td>{catador.cooperativa ?? "Sem vínculo"}</td><td>{catador.contatos[0]?.valor ?? "Não informado"}</td><td><strong>{Number(catador.total_quilos).toLocaleString("pt-BR")} kg</strong></td><td><span className={catador.status === "ativo" ? "status ativo" : "status"}>● {catador.status}</span></td></tr>)}</tbody></table>{filtrados.length === 0 && <p className="estado-vazio">Nenhum catador encontrado.</p>}</div>
    {cadastroAberto && <CadastroCatador cooperativas={cooperativas} onFechar={() => setCadastroAberto(false)} onSalvo={carregar} />}
  </section>;
}

function iniciais(nome: string) { return nome.split(/\s+/).slice(0, 2).map((parte) => parte[0]).join("").toUpperCase(); }
function somenteNumeros(valor: string) { return valor.replace(/\D/g, ""); }

function CadastroCatador({ cooperativas, onFechar, onSalvo }: { cooperativas: CooperativaApi[]; onFechar: () => void; onSalvo: () => Promise<void> }) {
  const [etapa, setEtapa] = useState(0);
  const [dados, setDados] = useState(vazio);
  const [contatos, setContatos] = useState([{ tipo: "celular", valor: "", principal: true }]);
  const [endereco, setEndereco] = useState(false);
  const [pagamento, setPagamento] = useState(false);
  const [terceiro, setTerceiro] = useState(false);
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
    setSalvando(true); setErro("");
    try {
      const corpo = {
        nomeCompleto: dados.nomeCompleto.trim(), apelido: dados.apelido.trim() || undefined, cooperativaUuid: dados.cooperativaUuid || undefined,
        genero: dados.genero || undefined, racaCor: dados.racaCor || undefined, dataNascimento: dados.dataNascimento || undefined, cpf: somenteNumeros(dados.cpf) || undefined,
        contatos: contatos.filter((item) => item.valor.trim()).map((item) => ({ ...item, valor: item.valor.trim() })),
        endereco: endereco ? { cep: somenteNumeros(dados.cep) || undefined, logradouro: dados.logradouro || undefined, numero: dados.numero || undefined, complemento: dados.complemento || undefined, bairro: dados.bairro || undefined, cidade: dados.cidade, estado: dados.estado } : undefined,
        contaFinanceira: pagamento ? { tipo: dados.tipoPagamento, tipoChavePix: dados.tipoPagamento === "pix" ? dados.tipoChavePix : undefined, chavePix: dados.tipoPagamento === "pix" ? dados.chavePix || undefined : undefined, banco: dados.tipoPagamento === "conta_bancaria" ? dados.banco || undefined : undefined, agencia: dados.tipoPagamento === "conta_bancaria" ? dados.agencia || undefined : undefined, numeroConta: dados.tipoPagamento === "conta_bancaria" ? dados.numeroConta || undefined : undefined, tipoConta: dados.tipoPagamento === "conta_bancaria" ? dados.tipoConta : undefined, deTerceiro: terceiro, nomeTitular: terceiro ? dados.nomeTitular || undefined : undefined, cpfTitular: terceiro ? somenteNumeros(dados.cpfTitular) || undefined : undefined, relacaoTitular: terceiro ? dados.relacaoTitular || undefined : undefined } : undefined,
      };
      const criado = await requisitarApi<{ uuid: string; codigo: string }>("/api/catadores", { method: "POST", body: JSON.stringify(corpo) });
      if (foto) { const formulario = new FormData(); formulario.append("foto", foto); await requisitarApi(`/api/catadores/${criado.uuid}/foto`, { method: "POST", body: formulario }); }
      await onSalvo(); onFechar();
    } catch (falha) { setErro(falha instanceof Error ? falha.message : "Não foi possível cadastrar o catador."); }
    finally { setSalvando(false); }
  }

  return <div className="sobreposicao" role="dialog" aria-modal="true" aria-labelledby="titulo-cadastro"><div className="modal cadastro">
    <header className="cabecalho-modal"><div><span>NOVO CADASTRO</span><h2 id="titulo-cadastro">Cadastrar catador</h2><p>Os dados serão gravados no PostgreSQL.</p></div><button onClick={onFechar} aria-label="Fechar">×</button></header>
    <div className="etapas">{etapas.map((item, indice) => <div className={indice === etapa ? "etapa atual" : indice < etapa ? "etapa concluida" : "etapa"} key={item}><span>{indice < etapa ? "✓" : indice + 1}</span><small>{item}</small></div>)}</div>
    <form className="formulario" onSubmit={(evento) => evento.preventDefault()}>
      {etapa === 0 && <div className="animar-etapa"><h3>Identificação</h3><div className="grade-formulario"><Campo rotulo="Nome completo" valor={dados.nomeCompleto} aoMudar={(v) => atualizar("nomeCompleto", v)} autoFocus /><Campo rotulo="Apelido" valor={dados.apelido} aoMudar={(v) => atualizar("apelido", v)} opcional /><label className="campo">Gênero <select value={dados.genero} onChange={(e) => atualizar("genero", e.target.value)}><option value="">Não informado</option><option>Feminino</option><option>Masculino</option><option>Não binário</option><option>Outro</option></select></label><label className="campo">Raça / Cor <select value={dados.racaCor} onChange={(e) => atualizar("racaCor", e.target.value)}><option value="">Não informado</option><option>Branca</option><option>Preta</option><option>Parda</option><option>Amarela</option><option>Indígena</option></select></label><Campo rotulo="Data de nascimento" valor={dados.dataNascimento} aoMudar={(v) => atualizar("dataNascimento", v)} tipo="date" opcional /><Campo rotulo="CPF" valor={dados.cpf} aoMudar={(v) => atualizar("cpf", v)} opcional /><label className="campo campo-largo">Cooperativa / Associação <select value={dados.cooperativaUuid} onChange={(e) => atualizar("cooperativaUuid", e.target.value)}><option value="">Sem vínculo</option>{cooperativas.filter((item) => item.status === "ativo").map((item) => <option value={item.uuid} key={item.uuid}>{item.nome}</option>)}</select></label></div></div>}
      {etapa === 1 && <div className="animar-etapa"><h3>Contatos</h3>{contatos.map((contato, indice) => <div className="grupo-repetivel" key={indice}><label className="campo">Tipo<select value={contato.tipo} onChange={(e) => setContatos((lista) => lista.map((item, i) => i === indice ? { ...item, tipo: e.target.value } : item))}><option value="celular">Celular</option><option value="telefone">Telefone</option><option value="whatsapp">WhatsApp</option><option value="recado">Recado</option><option value="email">E-mail</option></select></label><Campo rotulo="Contato" valor={contato.valor} aoMudar={(valor) => setContatos((lista) => lista.map((item, i) => i === indice ? { ...item, valor } : item))} opcional />{indice > 0 && <button type="button" onClick={() => setContatos((lista) => lista.filter((_, i) => i !== indice))} aria-label="Remover contato"><Trash2 /></button>}</div>)}<button className="botao-texto" type="button" onClick={() => setContatos((lista) => [...lista, { tipo: "celular", valor: "", principal: false }])}><Plus /> Adicionar contato</button><div className="bloco-opcional"><Interruptor marcado={endereco} aoMudar={setEndereco} titulo="Preencher endereço" />{endereco && <div className="grade-formulario animar-etapa"><Campo rotulo="CEP" valor={dados.cep} aoMudar={(v) => atualizar("cep", v)} opcional /><Campo rotulo="Logradouro" valor={dados.logradouro} aoMudar={(v) => atualizar("logradouro", v)} /><Campo rotulo="Número" valor={dados.numero} aoMudar={(v) => atualizar("numero", v)} /><Campo rotulo="Complemento" valor={dados.complemento} aoMudar={(v) => atualizar("complemento", v)} opcional /><Campo rotulo="Bairro" valor={dados.bairro} aoMudar={(v) => atualizar("bairro", v)} /><Campo rotulo="Cidade" valor={dados.cidade} aoMudar={(v) => atualizar("cidade", v)} /><Campo rotulo="Estado" valor={dados.estado} aoMudar={(v) => atualizar("estado", v)} /></div>}</div></div>}
      {etapa === 2 && <div className="animar-etapa"><h3>Dados para recebimento</h3><div className="bloco-opcional"><Interruptor marcado={pagamento} aoMudar={setPagamento} titulo="Informar Pix ou conta bancária" />{pagamento && <div className="grade-formulario animar-etapa"><label className="campo">Forma de pagamento<select value={dados.tipoPagamento} onChange={(e) => atualizar("tipoPagamento", e.target.value)}><option value="pix">Pix</option><option value="conta_bancaria">Conta bancária</option></select></label>{dados.tipoPagamento === "pix" ? <><label className="campo">Tipo da chave<select value={dados.tipoChavePix} onChange={(e) => atualizar("tipoChavePix", e.target.value)}><option>CPF</option><option>Celular</option><option>E-mail</option><option>Chave aleatória</option></select></label><Campo rotulo="Chave Pix" valor={dados.chavePix} aoMudar={(v) => atualizar("chavePix", v)} /></> : <><Campo rotulo="Banco" valor={dados.banco} aoMudar={(v) => atualizar("banco", v)} /><Campo rotulo="Agência" valor={dados.agencia} aoMudar={(v) => atualizar("agencia", v)} /><Campo rotulo="Número da conta" valor={dados.numeroConta} aoMudar={(v) => atualizar("numeroConta", v)} /><label className="campo">Tipo de conta<select value={dados.tipoConta} onChange={(e) => atualizar("tipoConta", e.target.value)}><option value="corrente">Corrente</option><option value="poupanca">Poupança</option></select></label></>}<div className="campo-largo"><Interruptor marcado={terceiro} aoMudar={setTerceiro} titulo="Dados de terceiro" /></div>{terceiro && <><Campo rotulo="Nome do titular" valor={dados.nomeTitular} aoMudar={(v) => atualizar("nomeTitular", v)} /><Campo rotulo="CPF do titular" valor={dados.cpfTitular} aoMudar={(v) => atualizar("cpfTitular", v)} /><Campo rotulo="Relação com o catador" valor={dados.relacaoTitular} aoMudar={(v) => atualizar("relacaoTitular", v)} opcional /></>}</div>}</div></div>}
      {etapa === 3 && <div className="animar-etapa"><h3>Foto e revisão</h3><div className="area-foto"><div className="moldura-rosto">{foto ? <img src={URL.createObjectURL(foto)} alt="Prévia da foto" /> : <Camera />}</div><div><strong>Fotografe o rosto do catador</strong><p>A foto será armazenada com acesso restrito.</p><label className="botao-secundario botao-arquivo" htmlFor="foto-catador"><Camera /> Abrir câmera</label><input id="foto-catador" type="file" hidden accept="image/jpeg,image/png,image/webp" capture="user" onChange={(e: ChangeEvent<HTMLInputElement>) => setFoto(e.target.files?.[0] ?? null)} /></div></div><div className="resumo-cadastro"><strong>{dados.nomeCompleto || "Nome não informado"}</strong><span>{contatos.filter((item) => item.valor).length} contato(s) · {dados.cooperativaUuid ? "Com cooperativa" : "Sem cooperativa"}</span></div></div>}
      {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
    </form>
    <footer className="rodape-modal"><button type="button" className="botao-secundario" onClick={etapa === 0 ? onFechar : () => setEtapa((v) => v - 1)}>{etapa === 0 ? "Cancelar" : "← Voltar"}</button><span>Etapa {etapa + 1} de {etapas.length}</span><button type="button" className="botao-primario" disabled={salvando} onClick={etapa === etapas.length - 1 ? () => void salvar() : () => setEtapa((v) => v + 1)}>{salvando ? "Salvando..." : etapa === etapas.length - 1 ? "Concluir cadastro" : "Continuar →"}</button></footer>
  </div></div>;
}

function Campo({ rotulo, valor, aoMudar, opcional, tipo = "text", autoFocus = false }: { rotulo: string; valor: string; aoMudar: (valor: string) => void; opcional?: boolean; tipo?: string; autoFocus?: boolean }) { return <label className="campo">{rotulo} {opcional && <small>Opcional</small>}<input type={tipo} value={valor} onChange={(e) => aoMudar(e.target.value)} autoFocus={autoFocus} /></label>; }
function Interruptor({ marcado, aoMudar, titulo }: { marcado: boolean; aoMudar: (valor: boolean) => void; titulo: string }) { return <label className="interruptor"><input type="checkbox" checked={marcado} onChange={(e) => aoMudar(e.target.checked)} /><span /><div><strong>{titulo}</strong><small>Opcional</small></div></label>; }

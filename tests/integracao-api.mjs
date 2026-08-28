import assert from "node:assert/strict";
import pg from "../servidor/node_modules/pg/lib/index.js";

const urlApi = process.env.NEXT_PUBLIC_URL_API ?? "http://localhost:3333";
const bancoTeste = new pg.Pool({ connectionString: process.env.URL_BANCO });
let cookie = "";
const entidadesCriadas = new Set();

async function chamar(caminho, opcoes = {}, autenticado = true) {
  const cabecalhos = new Headers(opcoes.headers);
  if (opcoes.body && !cabecalhos.has("content-type")) cabecalhos.set("content-type", "application/json");
  if (autenticado && cookie) cabecalhos.set("cookie", cookie);
  const resposta = await fetch(`${urlApi}${caminho}`, { ...opcoes, headers: cabecalhos });
  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : undefined;
  if (!resposta.ok) throw new Error(`${opcoes.method ?? "GET"} ${caminho}: ${resposta.status} ${texto}`);
  return { resposta, dados };
}

async function executar() {
  const inicioTeste = new Date();
  for (const caminho of ["/api/notificacoes", "/api/notificacoes/f58b2e08-145c-47d2-8842-228cd0a35df9"]) {
    const preflightExclusao = await fetch(`${urlApi}${caminho}`, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3001",
        "access-control-request-method": "DELETE",
      },
    });
    assert.equal(preflightExclusao.status, 204);
    assert.equal(preflightExclusao.headers.get("access-control-allow-origin"), "http://localhost:3001");
    assert.match(preflightExclusao.headers.get("access-control-allow-methods") ?? "", /(?:^|,\s*)DELETE(?:,|$)/);
    assert.equal(preflightExclusao.headers.get("access-control-allow-credentials"), "true");
  }

  const sessaoSemCookie = await chamar("/api/autenticacao/sessao", {}, false);
  assert.equal(sessaoSemCookie.resposta.status, 200);
  assert.equal(sessaoSemCookie.dados.autenticado, false);
  assert.equal((await fetch(`${urlApi}/api/painel`)).status, 401);

  const login = await chamar("/api/autenticacao/entrar", { method: "POST", body: JSON.stringify({ email: process.env.ADMIN_EMAIL, senha: process.env.ADMIN_SENHA }) }, false);
  cookie = (login.resposta.headers.get("set-cookie") ?? "").split(";", 1)[0];
  assert.ok(cookie.startsWith("reciclabelo_sessao="));
  assert.equal((await chamar("/api/autenticacao/sessao")).dados.autenticado, true);
  const perfilAdministrador = (await chamar("/api/administrador/perfil")).dados;
  assert.equal(perfilAdministrador.email, process.env.ADMIN_EMAIL);
  assert.equal(perfilAdministrador.perfil, "administrador");

  const cookieAdministradorPermissoes = cookie;
  const emailRestrito = `cadastro-${Date.now()}-${process.pid}@reciclabelo.local`;
  const senhaRestrita = `Cadastro!${Date.now()}Aa`;
  let usuarioRestritoUuid;
  let cooperativaRestritaUuid;
  try {
    usuarioRestritoUuid = (await chamar("/api/usuarios", { method: "POST", body: JSON.stringify({ nome: "Operador de cadastro", email: emailRestrito, senha: senhaRestrita, ativo: true }) })).dados.uuid;
    const loginRestrito = await chamar("/api/autenticacao/entrar", { method: "POST", body: JSON.stringify({ email: emailRestrito, senha: senhaRestrita }) }, false);
    const cookieRestrito = (loginRestrito.resposta.headers.get("set-cookie") ?? "").split(";", 1)[0];
    assert.equal(loginRestrito.dados.usuario.perfil, "operador_cadastro");
    cookie = cookieRestrito;
    assert.equal((await chamar("/api/painel")).resposta.status, 200);
    cooperativaRestritaUuid = (await chamar("/api/cooperativas", { method: "POST", body: JSON.stringify({ nome: `Cadastro restrito ${Date.now()}`, nomeResponsavel: "Equipe operacional", ativa: true }) })).dados.uuid;
    const acessoUsuarios = await fetch(`${urlApi}/api/usuarios`, { headers: { cookie: cookieRestrito } });
    assert.equal(acessoUsuarios.status, 403);
    const alteracaoBloqueada = await fetch(`${urlApi}/api/cooperativas/${cooperativaRestritaUuid}`, { method: "PUT", headers: { "content-type": "application/json", cookie: cookieRestrito }, body: JSON.stringify({ nome: "Tentativa", nomeResponsavel: "Tentativa", ativa: true }) });
    assert.equal(alteracaoBloqueada.status, 403);
    const exclusaoBloqueada = await fetch(`${urlApi}/api/cooperativas/${cooperativaRestritaUuid}`, { method: "DELETE", headers: { cookie: cookieRestrito } });
    assert.equal(exclusaoBloqueada.status, 403);
    const configuracaoBloqueada = await fetch(`${urlApi}/api/materiais`, { method: "POST", headers: { "content-type": "application/json", cookie: cookieRestrito }, body: JSON.stringify({ nome: "Material indevido", tipoMaterial: "Teste", unidade: "kg", quantidadeReferencia: 1, valorReferencia: 1, metaDiaria: 0, ativo: true }) });
    assert.equal(configuracaoBloqueada.status, 403);
    cookie = cookieAdministradorPermissoes;
    await chamar(`/api/cooperativas/${cooperativaRestritaUuid}`, { method: "DELETE" });
    cooperativaRestritaUuid = undefined;
    await chamar(`/api/usuarios/${usuarioRestritoUuid}`, { method: "PATCH", body: JSON.stringify({ nome: "Operador de cadastro", email: emailRestrito, ativo: false }) });
    const sessaoRevogada = await fetch(`${urlApi}/api/autenticacao/sessao`, { headers: { cookie: cookieRestrito } });
    assert.equal(sessaoRevogada.status, 200);
    assert.equal((await sessaoRevogada.json()).autenticado, false);
  } finally {
    cookie = cookieAdministradorPermissoes;
    if (cooperativaRestritaUuid) await bancoTeste.query("DELETE FROM cooperativas WHERE uuid=$1", [cooperativaRestritaUuid]);
    if (usuarioRestritoUuid) {
      await bancoTeste.query("DELETE FROM notificacoes WHERE entidade='usuarios' AND entidade_uuid=$1", [usuarioRestritoUuid]);
      await bancoTeste.query("DELETE FROM auditoria WHERE entidade='usuarios' AND entidade_uuid=$1", [usuarioRestritoUuid]);
      await bancoTeste.query("DELETE FROM usuarios WHERE uuid=$1", [usuarioRestritoUuid]);
    }
  }
  const perfilConfirmado = (await chamar("/api/administrador/perfil", { method: "PATCH", body: JSON.stringify({ nome: perfilAdministrador.nome, email: perfilAdministrador.email, senhaAtual: process.env.ADMIN_SENHA }) })).dados;
  assert.equal(perfilConfirmado.uuid, perfilAdministrador.uuid);
  const senhaTemporariaAdministrador = `Temporaria!${Date.now()}Aa`;
  let senhaTemporariaAtiva = false;
  try {
    const alteracaoSenha = await chamar("/api/administrador/senha", { method: "PATCH", body: JSON.stringify({ senhaAtual: process.env.ADMIN_SENHA, novaSenha: senhaTemporariaAdministrador }) });
    cookie = (alteracaoSenha.resposta.headers.get("set-cookie") ?? "").split(";", 1)[0];
    senhaTemporariaAtiva = true;
    assert.equal(alteracaoSenha.dados.alterada, true);
    assert.equal((await chamar("/api/autenticacao/sessao")).dados.autenticado, true);
    const restauracaoSenha = await chamar("/api/administrador/senha", { method: "PATCH", body: JSON.stringify({ senhaAtual: senhaTemporariaAdministrador, novaSenha: process.env.ADMIN_SENHA }) });
    cookie = (restauracaoSenha.resposta.headers.get("set-cookie") ?? "").split(";", 1)[0];
    senhaTemporariaAtiva = false;
  } finally {
    if (senhaTemporariaAtiva) {
      const restauracao = await chamar("/api/administrador/senha", { method: "PATCH", body: JSON.stringify({ senhaAtual: senhaTemporariaAdministrador, novaSenha: process.env.ADMIN_SENHA }) });
      cookie = (restauracao.resposta.headers.get("set-cookie") ?? "").split(";", 1)[0];
    }
  }

  const enderecoCep = (await chamar("/api/enderecos/cep/30110000")).dados;
  assert.equal(enderecoCep.cidade, "Belo Horizonte");
  assert.equal(enderecoCep.estado, "MG");
  const painelAntes = (await chamar("/api/painel")).dados.indicadores;
  const configuracaoMetaOriginal = (await chamar("/api/configuracoes/meta-geral")).dados;
  await chamar("/api/configuracoes/meta-geral", { method: "PUT", body: JSON.stringify({ ativa: false, metaDiaria: 0, valorPremio: 0, unidade: "kg" }) });
  const sufixo = `${Date.now()}-${process.pid}`;
  const cpfCatador = String(Date.now()).slice(-11).padStart(11, "7");
  const cpfTitular = String(Date.now() + 1).slice(-11).padStart(11, "8");
  let cooperativaUuid;
  let materialUuid;
  let materialSemMetaUuid;
  let materialForaMetaUuid;
  let catadorUuid;
  let pesagemUuid;
  let primeiraPesagemUuid;
  let caixaUuid;
  let responsavelUuid;
  let catadorMetaGeralUuid;
  const pesagensMetaGeral = [];

  try {
    cooperativaUuid = (await chamar("/api/cooperativas", { method: "POST", body: JSON.stringify({ nome: `Integração ${sufixo}`, nomeResponsavel: "Teste automatizado", ativa: true }) })).dados.uuid;
    entidadesCriadas.add(cooperativaUuid);
    materialUuid = (await chamar("/api/materiais", { method: "POST", body: JSON.stringify({ nome: `Material ${sufixo}`, tipoMaterial: "Teste", unidade: "kg", quantidadeReferencia: 20, valorReferencia: 10, metaDiaria: 20, ativo: true }) })).dados.uuid;
    entidadesCriadas.add(materialUuid);

    const pixTerceiroSemTitular = await fetch(`${urlApi}/api/catadores`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ nomeCompleto: "Cadastro inválido", contatos: [], contaFinanceira: { tipo: "pix", tipoChavePix: "Celular", chavePix: "31999999999", deTerceiro: true } }) });
    assert.equal(pixTerceiroSemTitular.status, 400);

    const catador = (await chamar("/api/catadores", { method: "POST", body: JSON.stringify({
      nomeCompleto: `Catador Integração ${sufixo}`,
      cooperativaUuid,
      contatos: [],
      contaFinanceira: { tipo: "conta_bancaria", banco: "Banco Teste", agencia: "0001", numeroConta: "12345-6", tipoConta: "corrente", deTerceiro: true, nomeTitular: "Titular Teste", cpfTitular },
    }) })).dados;
    catadorUuid = catador.uuid;
    entidadesCriadas.add(catadorUuid);
    assert.match(catador.codigo, /^CAT-\d{4,}$/);
    await chamar(`/api/catadores/${catadorUuid}`, { method: "PUT", body: JSON.stringify({
      nomeCompleto: `Catador Integração Editado ${sufixo}`,
      apelido: "Integrado",
      cooperativaUuid,
      genero: "Outro",
      racaCor: "Parda",
      dataNascimento: "1990-05-20",
      cpf: cpfCatador,
      contatos: [{ tipo: "celular", valor: "31999999999", principal: true }, { tipo: "recado", valor: "3133334444", principal: false }],
      endereco: { cep: "30110000", logradouro: "Avenida Afonso Pena", numero: "100", bairro: "Centro", cidade: "Belo Horizonte", estado: "MG" },
      contaFinanceira: { tipo: "conta_bancaria", banco: "Banco Teste Editado", agencia: "0002", numeroConta: "98765-4", tipoConta: "corrente", deTerceiro: true, nomeTitular: "Titular Editado", cpfTitular },
    }) });
    const perfilEditado = (await chamar(`/api/catadores/${catadorUuid}/perfil`)).dados.catador;
    assert.equal(perfilEditado.nome_completo, `Catador Integração Editado ${sufixo}`);
    assert.equal(perfilEditado.cpf, cpfCatador);
    assert.equal(perfilEditado.contatos.length, 2);
    assert.equal(perfilEditado.endereco.cep, "30110000");
    assert.equal(perfilEditado.contas_financeiras[0].banco, "Banco Teste Editado");
    const paginaCatadores = (await chamar(`/api/catadores?busca=${encodeURIComponent(`Catador Integração ${sufixo}`)}&status=ativo&limite=5&deslocamento=0`)).dados;
    assert.equal(paginaCatadores.total, 1);
    assert.equal(paginaCatadores.dados[0]?.uuid, catadorUuid);
    const buscaParcialCatador = (await chamar(`/api/catadores?busca=${encodeURIComponent("Catador Int")}&status=ativo&limite=5&deslocamento=0`)).dados;
    assert.ok(buscaParcialCatador.dados.some((item) => item.uuid === catadorUuid));
    const paginaCooperativas = (await chamar(`/api/cooperativas?busca=${encodeURIComponent(`Integração ${sufixo}`)}&limite=4&deslocamento=0`)).dados;
    assert.equal(paginaCooperativas.total, 1);
    assert.equal(paginaCooperativas.dados[0]?.uuid, cooperativaUuid);
    const buscaParcialCooperativa = (await chamar(`/api/cooperativas?busca=${encodeURIComponent("Integra")}&limite=4&deslocamento=0`)).dados;
    assert.ok(buscaParcialCooperativa.dados.some((item) => item.uuid === cooperativaUuid));
    await chamar(`/api/catadores/${catadorUuid}/status`, { method: "PATCH", body: JSON.stringify({ ativo: false }) });
    assert.equal((await chamar(`/api/catadores?busca=${encodeURIComponent(catador.codigo)}&status=ativo`)).dados.total, 0);
    await chamar(`/api/catadores/${catadorUuid}/status`, { method: "PATCH", body: JSON.stringify({ ativo: true }) });

    const pontos = (await chamar("/api/pontos-apoio")).dados.dados;
    responsavelUuid = (await chamar("/api/responsaveis-pesagem", { method: "POST", body: JSON.stringify({ nome: `Responsável ${sufixo}`, ativo: true }) })).dados.uuid;
    await chamar(`/api/responsaveis-pesagem/${responsavelUuid}`, { method: "PUT", body: JSON.stringify({ nome: `Responsável Editado ${sufixo}`, ativo: true }) });
    const responsaveis = (await chamar("/api/responsaveis-pesagem")).dados.dados;
    assert.ok(pontos.length > 0 && responsaveis.some((item) => item.uuid === responsavelUuid && item.nome === `Responsável Editado ${sufixo}`));

    const dataHoraPesagem = new Date().toISOString();
    const dataCaixa = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date(dataHoraPesagem));
    const primeiraPesagem = (await chamar("/api/pesagens", { method: "POST", body: JSON.stringify({ catadorUuid, cooperativaUuid, pontoApoioUuid: pontos[0].uuid, responsavelPesagemUuid: responsavelUuid, materialUuid, peso: 5, observacao: "Abaixo da meta", dataHora: dataHoraPesagem, status: "concluida" }) })).dados;
    primeiraPesagemUuid = primeiraPesagem.uuid;
    entidadesCriadas.add(primeiraPesagemUuid);
    assert.equal(primeiraPesagem.valorTotal, 0);
    assert.equal(primeiraPesagem.progressoMeta.peso, 5);
    assert.equal(primeiraPesagem.progressoMeta.falta, 15);
    assert.equal(primeiraPesagem.metaAtingidaAgora, false);
    const pesagem = (await chamar("/api/pesagens", { method: "POST", body: JSON.stringify({ catadorUuid, cooperativaUuid, pontoApoioUuid: pontos[0].uuid, responsavelPesagemUuid: responsavelUuid, materialUuid, peso: 15, observacao: "Completa a meta acumulada", dataHora: new Date(new Date(dataHoraPesagem).getTime() + 1000).toISOString(), status: "concluida" }) })).dados;
    pesagemUuid = pesagem.uuid;
    entidadesCriadas.add(pesagemUuid);
    assert.equal(pesagem.valorTotal, 10);
    assert.equal(pesagem.status, "concluida");
    assert.equal(pesagem.metaAtingidaAgora, true);
    assert.equal(pesagem.progressoMeta.percentual, 100);
    const progresso = (await chamar(`/api/catadores/${catadorUuid}/metas?data=${dataCaixa}`)).dados;
    assert.equal(progresso.metas.find((item) => item.material_uuid === materialUuid).atingida, true);
    assert.equal(progresso.caixa.status, "aberto");
    caixaUuid = progresso.caixa.uuid;
    entidadesCriadas.add(caixaUuid);

    const caixaFechado = (await chamar(`/api/catadores/${catadorUuid}/caixa/fechar`, { method: "POST", body: JSON.stringify({ data: dataCaixa }) })).dados;
    assert.equal(caixaFechado.status, "fechado");
    const edicaoBloqueada = await fetch(`${urlApi}/api/pesagens/${pesagemUuid}`, { method: "PUT", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ catadorUuid, cooperativaUuid, pontoApoioUuid: pontos[0].uuid, responsavelPesagemUuid: responsavelUuid, materialUuid, peso: 31, dataHora: dataHoraPesagem, status: "concluida", motivoAlteracao: "Deve ser bloqueada" }) });
    assert.equal(edicaoBloqueada.status, 409);
    const caixaReaberto = (await chamar(`/api/catadores/${catadorUuid}/caixa/reabrir`, { method: "POST", body: JSON.stringify({ data: dataCaixa, motivo: "Correção controlada do teste" }) })).dados;
    assert.equal(caixaReaberto.status, "aberto");

    const painelDepois = (await chamar("/api/painel")).dados;
    assert.ok(painelDepois.producaoSemanal.every((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.data)));
    assert.equal(painelDepois.paginacaoAtividades.pagina, 1);
    assert.equal(painelDepois.paginacaoAtividades.limite, 5);
    assert.ok(painelDepois.paginacaoAtividades.total >= painelDepois.atividades.length);
    const segundaPaginaAtividades = (await chamar("/api/painel?paginaAtividades=2&limiteAtividades=5")).dados;
    assert.equal(segundaPaginaAtividades.paginacaoAtividades.pagina, 2);
    assert.ok(segundaPaginaAtividades.atividades.length <= 5);
    assert.equal(Number(painelDepois.indicadores.catadores_ativos), Number(painelAntes.catadores_ativos) + 1);
    assert.equal(Number(painelDepois.indicadores.coletas_realizadas), Number(painelAntes.coletas_realizadas) + 2);
    assert.equal(Number(painelDepois.indicadores.total_coletado), Number(painelAntes.total_coletado) + 20);
    assert.equal(Number(painelDepois.indicadores.valor_total_pagar), Number(painelAntes.valor_total_pagar) + 10);
    assert.ok(painelDepois.atividades.some((item) => item.codigo === pesagem.codigo && item.entidade === "pesagens" && item.catador_uuid === catadorUuid));
    const atividadeCaixa = painelDepois.atividades.find((item) => item.entidade === "caixas_catador" && item.catador_uuid === catadorUuid && item.acao === "reabertura");
    assert.equal(atividadeCaixa.codigo_catador, catador.codigo);
    assert.equal(atividadeCaixa.motivo, "Correção controlada do teste");
    assert.equal(Number(atividadeCaixa.valor_caixa), 10);

    const alterada = (await chamar(`/api/pesagens/${pesagemUuid}`, { method: "PUT", body: JSON.stringify({ catadorUuid, cooperativaUuid, pontoApoioUuid: pontos[0].uuid, responsavelPesagemUuid: responsavelUuid, materialUuid, peso: 40, observacao: "Peso corrigido", dataHora: dataHoraPesagem, status: "agendada", motivoAlteracao: "Correção automatizada do peso e status" }) })).dados;
    assert.equal(alterada.valorTotal, 0);
    assert.equal(alterada.status, "agendada");
    assert.equal(Number((await chamar("/api/painel")).dados.indicadores.coletas_realizadas), Number(painelAntes.coletas_realizadas) + 1);

    const respostaRelatorio = (await chamar(`/api/relatorios/pesagens?catadorUuid=${catadorUuid}&limite=5&deslocamento=0`)).dados;
    assert.equal(respostaRelatorio.total, 2);
    assert.equal(Number(respostaRelatorio.totais.peso), 5);
    assert.equal(Number(respostaRelatorio.totais.valor), 0);
    let relatorio = respostaRelatorio.dados;
    assert.ok(relatorio.some((item) => item.uuid === pesagemUuid && item.status === "agendada" && Number(item.valor_total) === 0 && item.historico.some((evento) => evento.acao === "alteracao")));
    const perfil = (await chamar(`/api/catadores/${catadorUuid}/perfil`)).dados;
    assert.equal(perfil.catador.uuid, catadorUuid);
    assert.ok(perfil.caixas.some((item) => String(item.data_caixa).slice(0, 10) === dataCaixa && item.reaberto_em));

    const notificacoes = (await chamar("/api/notificacoes?limite=5")).dados;
    assert.ok(notificacoes.dados.length <= 5);
    assert.ok(notificacoes.total >= notificacoes.dados.length);
    assert.ok(notificacoes.naoLidas >= 0);
    assert.ok(notificacoes.proximoCursor);
    const cursor = new URLSearchParams({
      limite: "5",
      cursorData: notificacoes.proximoCursor.criadoEm,
      cursorUuid: notificacoes.proximoCursor.uuid,
    });
    const paginaSeguinte = (await chamar(`/api/notificacoes?${cursor.toString()}`)).dados;
    assert.equal(paginaSeguinte.dados.some((item) => notificacoes.dados.some((anterior) => anterior.uuid === item.uuid)), false);
    const notificacaoTeste = [...notificacoes.dados, ...paginaSeguinte.dados].find((item) => entidadesCriadas.has(item.entidade_uuid));
    assert.ok(notificacaoTeste);
    await chamar(`/api/notificacoes/${notificacaoTeste.uuid}/lida`, { method: "PATCH" });
    assert.ok((await chamar("/api/notificacoes")).dados.dados.find((item) => item.uuid === notificacaoTeste.uuid)?.lida_em);
    await chamar(`/api/notificacoes/${notificacaoTeste.uuid}`, { method: "DELETE" });
    assert.equal((await chamar("/api/notificacoes")).dados.dados.some((item) => item.uuid === notificacaoTeste.uuid), false);

    const cookieAdministrador = cookie;
    const emailCentralTeste = `notificacoes-${sufixo}@reciclabelo.local`;
    const usuarioCentral = await bancoTeste.query(`INSERT INTO usuarios (nome,email,senha_hash,administrador,perfil,ativo)
      SELECT 'Teste da central de notificações',$1,senha_hash,TRUE,'administrador',TRUE FROM usuarios WHERE email=$2 RETURNING uuid`, [emailCentralTeste, process.env.ADMIN_EMAIL]);
    const usuarioCentralUuid = usuarioCentral.rows[0].uuid;
    try {
      await bancoTeste.query("INSERT INTO notificacoes (usuario_uuid,tipo,titulo,mensagem) VALUES ($1,'sistema','Teste temporário','Validação da limpeza coletiva')", [usuarioCentralUuid]);
      const loginCentral = await chamar("/api/autenticacao/entrar", { method: "POST", body: JSON.stringify({ email: emailCentralTeste, senha: process.env.ADMIN_SENHA }) }, false);
      cookie = (loginCentral.resposta.headers.get("set-cookie") ?? "").split(";", 1)[0];
      assert.equal((await chamar("/api/notificacoes")).dados.total, 1);
      assert.equal((await chamar("/api/notificacoes", { method: "DELETE" })).resposta.status, 204);
      const centralLimpa = (await chamar("/api/notificacoes")).dados;
      assert.equal(centralLimpa.total, 0);
      assert.equal(centralLimpa.naoLidas, 0);
      assert.equal(centralLimpa.dados.length, 0);
    } finally {
      cookie = cookieAdministrador;
      await bancoTeste.query("DELETE FROM usuarios WHERE uuid=$1", [usuarioCentralUuid]);
    }

    await chamar(`/api/pesagens/${pesagemUuid}`, { method: "DELETE", body: JSON.stringify({ motivo: "Registro temporário do teste integrado" }) });
    relatorio = (await chamar(`/api/relatorios/pesagens?catadorUuid=${catadorUuid}`)).dados.dados;
    const excluida = relatorio.find((item) => item.uuid === pesagemUuid);
    assert.ok(excluida.excluida_em);
    assert.equal(excluida.motivo_exclusao, "Registro temporário do teste integrado");
    assert.ok(excluida.historico.some((evento) => evento.acao === "exclusao_logica"));
    assert.equal(Number((await chamar("/api/painel")).dados.indicadores.coletas_realizadas), Number(painelAntes.coletas_realizadas) + 1);

    await chamar(`/api/responsaveis-pesagem/${responsavelUuid}`, { method: "DELETE" });
    assert.equal((await chamar("/api/responsaveis-pesagem")).dados.dados.some((item) => item.uuid === responsavelUuid), false);
    assert.equal((await chamar("/api/responsaveis-pesagem?incluirInativos=true")).dados.dados.some((item) => item.uuid === responsavelUuid), false);
    const historicoComResponsavelExcluido = (await chamar(`/api/relatorios/pesagens?catadorUuid=${catadorUuid}`)).dados.dados;
    assert.ok(historicoComResponsavelExcluido.some((item) => item.responsavel === `Responsável Editado ${sufixo}`));

    materialSemMetaUuid = (await chamar("/api/materiais", { method: "POST", body: JSON.stringify({ nome: `Sem meta ${sufixo}`, tipoMaterial: "Teste", unidade: "kg", quantidadeReferencia: 1, valorReferencia: 2, metaDiaria: 0, ativo: true }) })).dados.uuid;
    entidadesCriadas.add(materialSemMetaUuid);
    materialForaMetaUuid = (await chamar("/api/materiais", { method: "POST", body: JSON.stringify({ nome: `Fora da meta ${sufixo}`, tipoMaterial: "Teste", unidade: "kg", quantidadeReferencia: 1, valorReferencia: 3, metaDiaria: 0, validoParaMeta: false, ativo: true }) })).dados.uuid;
    entidadesCriadas.add(materialForaMetaUuid);
    const responsavelPadrao = responsaveis.find((item) => item.uuid !== responsavelUuid);
    assert.ok(responsavelPadrao);
    const pesagemSemMeta = (await chamar("/api/pesagens", { method: "POST", body: JSON.stringify({ catadorUuid, cooperativaUuid, pontoApoioUuid: pontos[0].uuid, responsavelPesagemUuid: responsavelPadrao.uuid, materialUuid: materialSemMetaUuid, peso: 3, dataHora: new Date(new Date(dataHoraPesagem).getTime() + 2000).toISOString(), status: "concluida" }) })).dados;
    assert.equal(pesagemSemMeta.valorTotal, 6);
    assert.equal(pesagemSemMeta.progressoMeta.semMeta, true);
    await chamar(`/api/pesagens/${pesagemSemMeta.uuid}`, { method: "DELETE", body: JSON.stringify({ motivo: "Validação temporária de material sem meta" }) });

    await chamar("/api/configuracoes/meta-geral", { method: "PUT", body: JSON.stringify({ ativa: true, metaDiaria: 10, valorPremio: 200, unidade: "kg" }) });
    const configuracaoMetaAtiva = (await chamar("/api/configuracoes/meta-geral")).dados;
    assert.equal(configuracaoMetaAtiva.ativa, true);
    assert.equal(Number(configuracaoMetaAtiva.meta_diaria), 10);
    assert.equal(Number(configuracaoMetaAtiva.valor_premio), 200);
    catadorMetaGeralUuid = (await chamar("/api/catadores", { method: "POST", body: JSON.stringify({ nomeCompleto: `Meta Geral ${sufixo}`, cooperativaUuid, contatos: [], ativo: true }) })).dados.uuid;
    entidadesCriadas.add(catadorMetaGeralUuid);
    const materialConfiguradoFora = (await chamar("/api/pesagens", { method: "POST", body: JSON.stringify({ catadorUuid: catadorMetaGeralUuid, cooperativaUuid, pontoApoioUuid: pontos[0].uuid, responsavelPesagemUuid: responsavelPadrao.uuid, materialUuid: materialForaMetaUuid, contabilizarNaMeta: true, peso: 5, dataHora: new Date(new Date(dataHoraPesagem).getTime() + 3000).toISOString(), status: "concluida" }) })).dados;
    pesagensMetaGeral.push(materialConfiguradoFora.uuid); entidadesCriadas.add(materialConfiguradoFora.uuid);
    assert.equal(materialConfiguradoFora.contabilizaMeta, false);
    assert.equal(materialConfiguradoFora.valorTotal, 15);
    assert.equal(materialConfiguradoFora.progressoMetaGeral.peso, 0);
    assert.equal(materialConfiguradoFora.progressoMetaGeral.falta, 10);
    const escolhaForaMeta = (await chamar("/api/pesagens", { method: "POST", body: JSON.stringify({ catadorUuid: catadorMetaGeralUuid, cooperativaUuid, pontoApoioUuid: pontos[0].uuid, responsavelPesagemUuid: responsavelPadrao.uuid, materialUuid, contabilizarNaMeta: false, peso: 4, dataHora: new Date(new Date(dataHoraPesagem).getTime() + 4000).toISOString(), status: "concluida" }) })).dados;
    pesagensMetaGeral.push(escolhaForaMeta.uuid); entidadesCriadas.add(escolhaForaMeta.uuid);
    assert.equal(escolhaForaMeta.contabilizaMeta, false);
    assert.equal(escolhaForaMeta.valorTotal, 2);
    assert.equal(escolhaForaMeta.progressoMetaGeral.peso, 0);
    const primeiraGeral = (await chamar("/api/pesagens", { method: "POST", body: JSON.stringify({ catadorUuid: catadorMetaGeralUuid, cooperativaUuid, pontoApoioUuid: pontos[0].uuid, responsavelPesagemUuid: responsavelPadrao.uuid, materialUuid, contabilizarNaMeta: true, peso: 4, dataHora: new Date(new Date(dataHoraPesagem).getTime() + 5000).toISOString(), status: "concluida" }) })).dados;
    pesagensMetaGeral.push(primeiraGeral.uuid); entidadesCriadas.add(primeiraGeral.uuid);
    assert.equal(primeiraGeral.valorTotal, 0);
    assert.equal(primeiraGeral.progressoMetaGeral.ativa, true);
    assert.equal(primeiraGeral.progressoMetaGeral.falta, 6);
    const segundaGeral = (await chamar("/api/pesagens", { method: "POST", body: JSON.stringify({ catadorUuid: catadorMetaGeralUuid, cooperativaUuid, pontoApoioUuid: pontos[0].uuid, responsavelPesagemUuid: responsavelPadrao.uuid, materialUuid: materialSemMetaUuid, contabilizarNaMeta: true, peso: 6, dataHora: new Date(new Date(dataHoraPesagem).getTime() + 6000).toISOString(), status: "concluida" }) })).dados;
    pesagensMetaGeral.push(segundaGeral.uuid); entidadesCriadas.add(segundaGeral.uuid);
    assert.equal(segundaGeral.metaAtingidaAgora, true);
    assert.equal(segundaGeral.valorTotal, 200);
    assert.equal(segundaGeral.progressoMetaGeral.valorLiberado, 200);
    assert.equal(segundaGeral.progressoMetaGeral.valorPremioLiberado, 200);
    assert.equal(segundaGeral.progressoMetaGeral.valorExcedenteLiberado, 0);
    assert.equal(segundaGeral.progressoMetaGeral.detalhes.length, 2);
    assert.equal(segundaGeral.progressoMetaGeral.detalhes.reduce((total, item) => total + Number(item.valor_premio), 0), 200);
    assert.equal(segundaGeral.progressoMetaGeral.detalhes.reduce((total, item) => total + Number(item.valor_liberado), 0), 0);
    const excedenteGuardado = (await chamar("/api/pesagens", { method: "POST", body: JSON.stringify({ catadorUuid: catadorMetaGeralUuid, cooperativaUuid, pontoApoioUuid: pontos[0].uuid, responsavelPesagemUuid: responsavelPadrao.uuid, materialUuid, contabilizarNaMeta: true, guardarExcedenteMeta: true, peso: 5, dataHora: new Date(new Date(dataHoraPesagem).getTime() + 7000).toISOString(), status: "concluida" }) })).dados;
    pesagensMetaGeral.push(excedenteGuardado.uuid); entidadesCriadas.add(excedenteGuardado.uuid);
    assert.equal(excedenteGuardado.valorTotal, 0);
    assert.equal(excedenteGuardado.progressoMetaGeral.saldoCredito, 5);
    const dataDiaSeguinte = new Date(new Date(dataHoraPesagem).getTime() + 24 * 60 * 60 * 1000);
    const usoParcialCredito = (await chamar("/api/pesagens", { method: "POST", body: JSON.stringify({ catadorUuid: catadorMetaGeralUuid, cooperativaUuid, pontoApoioUuid: pontos[0].uuid, responsavelPesagemUuid: responsavelPadrao.uuid, materialUuid, contabilizarNaMeta: true, peso: 4, dataHora: dataDiaSeguinte.toISOString(), status: "concluida" }) })).dados;
    pesagensMetaGeral.push(usoParcialCredito.uuid); entidadesCriadas.add(usoParcialCredito.uuid);
    assert.equal(usoParcialCredito.valorTotal, 0);
    assert.equal(usoParcialCredito.progressoMetaGeral.creditoUtilizado, 5);
    assert.equal(usoParcialCredito.progressoMetaGeral.peso, 9);
    const metaComCredito = (await chamar("/api/pesagens", { method: "POST", body: JSON.stringify({ catadorUuid: catadorMetaGeralUuid, cooperativaUuid, pontoApoioUuid: pontos[0].uuid, responsavelPesagemUuid: responsavelPadrao.uuid, materialUuid: materialSemMetaUuid, contabilizarNaMeta: true, peso: 1, dataHora: new Date(dataDiaSeguinte.getTime() + 1000).toISOString(), status: "concluida" }) })).dados;
    pesagensMetaGeral.push(metaComCredito.uuid); entidadesCriadas.add(metaComCredito.uuid);
    assert.equal(metaComCredito.metaAtingidaAgora, true);
    assert.equal(metaComCredito.valorTotal, 200);
    assert.equal(metaComCredito.progressoMetaGeral.saldoCredito, 0);
    const perfilMetaGeral = (await chamar(`/api/catadores/${catadorMetaGeralUuid}/perfil`)).dados;
    assert.ok(perfilMetaGeral.metas.some((item) => item.nome === "Meta geral" && item.atingida && Number(item.ganho) === 200));
    assert.equal(Number(perfilMetaGeral.materiais.find((item) => item.uuid === materialUuid).ganho_total), 2);
    assert.equal(Number(perfilMetaGeral.materiais.find((item) => item.uuid === materialSemMetaUuid).ganho_total), 400);
    assert.equal(Number(perfilMetaGeral.materiais.find((item) => item.uuid === materialForaMetaUuid).ganho_total), 15);
    const relatorioGeral = (await chamar(`/api/relatorios/pesagens?catadorUuid=${catadorMetaGeralUuid}&busca=${encodeURIComponent("Meta Ger")}&limite=10&deslocamento=0`)).dados;
    assert.equal(relatorioGeral.total, 7);
    assert.equal(relatorioGeral.dados.filter((item) => item.tipo_meta === "fora_meta").length, 2);
    assert.ok(relatorioGeral.dados.filter((item) => item.tipo_meta === "geral").every((item) => Number(item.percentual_meta) === 100));
    for (const pesagemGeralUuid of pesagensMetaGeral) await chamar(`/api/pesagens/${pesagemGeralUuid}`, { method: "DELETE", body: JSON.stringify({ motivo: "Limpeza do cenário de meta geral" }) });
    await chamar(`/api/catadores/${catadorMetaGeralUuid}`, { method: "DELETE", body: JSON.stringify({ confirmacao: true, motivo: "Limpeza do cenário de meta geral" }) });
    catadorMetaGeralUuid = undefined;

    const exclusaoSemConfirmar = await fetch(`${urlApi}/api/catadores/${catadorUuid}`, { method: "DELETE", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ motivo: "Teste sem confirmação" }) });
    assert.equal(exclusaoSemConfirmar.status, 400);
    await chamar(`/api/catadores/${catadorUuid}`, { method: "DELETE", body: JSON.stringify({ confirmacao: true, motivo: "Exclusão integral do cadastro temporário" }) });
    assert.equal((await fetch(`${urlApi}/api/catadores/${catadorUuid}/perfil`, { headers: { cookie } })).status, 404);
    const dependenciasRemanescentes = await bancoTeste.query(`SELECT
      (SELECT count(*)::int FROM catadores WHERE uuid=$1) AS catadores,
      (SELECT count(*)::int FROM pesagens WHERE catador_uuid=$1) AS pesagens,
      (SELECT count(*)::int FROM caixas_catador WHERE catador_uuid=$1) AS caixas,
      (SELECT count(*)::int FROM contatos_catador WHERE catador_uuid=$1) AS contatos,
      (SELECT count(*)::int FROM enderecos_catador WHERE catador_uuid=$1) AS enderecos,
      (SELECT count(*)::int FROM contas_financeiras_catador WHERE catador_uuid=$1) AS contas`, [catadorUuid]);
    assert.deepEqual(dependenciasRemanescentes.rows[0], { catadores: 0, pesagens: 0, caixas: 0, contatos: 0, enderecos: 0, contas: 0 });
    const auditoriaExclusao = await bancoTeste.query("SELECT dados FROM auditoria WHERE entidade='catadores' AND entidade_uuid=$1 AND acao='exclusao_definitiva'", [catadorUuid]);
    assert.equal(auditoriaExclusao.rowCount, 1);
    assert.equal(auditoriaExclusao.rows[0].dados.motivo, "Exclusão integral do cadastro temporário");
    assert.equal(Number((await chamar("/api/painel")).dados.indicadores.catadores_ativos), Number(painelAntes.catadores_ativos));
  } finally {
    const cliente = await bancoTeste.connect();
    try {
      await cliente.query("BEGIN");
      const entidades = [...entidadesCriadas];
      if (entidades.length) {
        await cliente.query("DELETE FROM notificacoes WHERE entidade_uuid = ANY($1::uuid[])", [entidades]);
        await cliente.query("DELETE FROM auditoria WHERE entidade_uuid = ANY($1::uuid[])", [entidades]);
      }
      if (pesagemUuid) await cliente.query("DELETE FROM movimentacoes_caixa_catador WHERE pesagem_uuid=$1", [pesagemUuid]);
      if (pesagemUuid) await cliente.query("DELETE FROM pesagens WHERE uuid=$1", [pesagemUuid]);
      if (catadorMetaGeralUuid) {
        await cliente.query("DELETE FROM movimentacoes_caixa_catador WHERE caixa_uuid IN (SELECT uuid FROM caixas_catador WHERE catador_uuid=$1)", [catadorMetaGeralUuid]);
        await cliente.query("DELETE FROM pesagens WHERE catador_uuid=$1", [catadorMetaGeralUuid]);
        await cliente.query("DELETE FROM caixas_catador WHERE catador_uuid=$1", [catadorMetaGeralUuid]);
        await cliente.query("DELETE FROM catadores WHERE uuid=$1", [catadorMetaGeralUuid]);
      }
      if (catadorUuid) {
        await cliente.query("DELETE FROM movimentacoes_caixa_catador WHERE caixa_uuid IN (SELECT uuid FROM caixas_catador WHERE catador_uuid=$1) OR pesagem_uuid IN (SELECT uuid FROM pesagens WHERE catador_uuid=$1)", [catadorUuid]);
        await cliente.query("DELETE FROM pesagens WHERE catador_uuid=$1", [catadorUuid]);
        await cliente.query("DELETE FROM caixas_catador WHERE catador_uuid=$1", [catadorUuid]);
        await cliente.query("DELETE FROM catadores WHERE uuid=$1", [catadorUuid]);
      }
      if (materialUuid) await cliente.query("DELETE FROM materiais WHERE uuid=$1", [materialUuid]);
      if (materialSemMetaUuid) await cliente.query("DELETE FROM materiais WHERE uuid=$1", [materialSemMetaUuid]);
      if (materialForaMetaUuid) await cliente.query("DELETE FROM materiais WHERE uuid=$1", [materialForaMetaUuid]);
      if (cooperativaUuid) await cliente.query("DELETE FROM cooperativas WHERE uuid=$1", [cooperativaUuid]);
      if (responsavelUuid) await cliente.query("DELETE FROM responsaveis_pesagem WHERE uuid=$1", [responsavelUuid]);
      await cliente.query("UPDATE configuracoes_meta_geral SET ativa=$1,meta_diaria=$2,valor_premio=$3,unidade=$4,atualizado_em=now() WHERE chave='principal'", [configuracaoMetaOriginal.ativa, configuracaoMetaOriginal.meta_diaria, configuracaoMetaOriginal.valor_premio, configuracaoMetaOriginal.unidade]);
      await cliente.query("DELETE FROM auditoria WHERE entidade='configuracoes_meta_geral' AND criado_em >= $1", [inicioTeste]);
      await cliente.query("DELETE FROM notificacoes WHERE entidade='usuarios' AND entidade_uuid=$1 AND criado_em >= $2", [perfilAdministrador.uuid, inicioTeste]);
      await cliente.query("DELETE FROM auditoria WHERE entidade='usuarios' AND entidade_uuid=$1 AND criado_em >= $2", [perfilAdministrador.uuid, inicioTeste]);
      await cliente.query("COMMIT");
    } catch (falha) {
      await cliente.query("ROLLBACK");
      // eslint-disable-next-line no-unsafe-finally -- falha de limpeza deve invalidar o teste integrado
      throw falha;
    }
    finally { cliente.release(); await bancoTeste.end(); }
  }
}

await executar();
console.log("Integração concluída: perfis de acesso, bloqueios de edição, conta administrativa, sessões, metas, caixa, auditoria, relatórios e notificações.");

import assert from "node:assert/strict";

const urlApi = process.env.NEXT_PUBLIC_URL_API ?? "http://localhost:3333";
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
  const sessaoSemCookie = await chamar("/api/autenticacao/sessao", {}, false);
  assert.equal(sessaoSemCookie.resposta.status, 200);
  assert.equal(sessaoSemCookie.dados.autenticado, false);

  const painelProtegido = await fetch(`${urlApi}/api/painel`);
  assert.equal(painelProtegido.status, 401);

  const login = await chamar("/api/autenticacao/entrar", {
    method: "POST",
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, senha: process.env.ADMIN_SENHA }),
  }, false);
  cookie = (login.resposta.headers.get("set-cookie") ?? "").split(";", 1)[0];
  assert.ok(cookie.startsWith("reciclabelo_sessao="));

  const sessao = await chamar("/api/autenticacao/sessao");
  assert.equal(sessao.dados.autenticado, true);
  const enderecoCep = (await chamar("/api/enderecos/cep/30110000")).dados;
  assert.equal(enderecoCep.cidade, "Belo Horizonte");
  assert.equal(enderecoCep.estado, "MG");
  const painelAntes = (await chamar("/api/painel")).dados.indicadores;
  const sufixo = `${Date.now()}-${process.pid}`;

  let cooperativaUuid;
  let materialUuid;
  let catadorUuid;
  let pesagemUuid;
  try {
    cooperativaUuid = (await chamar("/api/cooperativas", {
      method: "POST",
      body: JSON.stringify({ nome: `Integração ${sufixo}`, nomeResponsavel: "Teste automatizado", ativa: true }),
    })).dados.uuid;
    entidadesCriadas.add(cooperativaUuid);

    materialUuid = (await chamar("/api/materiais", {
      method: "POST",
      body: JSON.stringify({ nome: `Material ${sufixo}`, tipoMaterial: "Teste", unidade: "kg", quantidadeReferencia: 20, valorReferencia: 10, ativo: true }),
    })).dados.uuid;
    entidadesCriadas.add(materialUuid);

    const catador = (await chamar("/api/catadores", {
      method: "POST",
      body: JSON.stringify({
        nomeCompleto: `Catador Integração ${sufixo}`,
        cooperativaUuid,
        contatos: [{ tipo: "celular", valor: "31999999999", principal: true }],
        endereco: { cep: "30110000", cidade: "Belo Horizonte", estado: "MG" },
        contaFinanceira: { tipo: "pix", tipoChavePix: "Celular", chavePix: "31999999999", deTerceiro: false },
      }),
    })).dados;
    catadorUuid = catador.uuid;
    entidadesCriadas.add(catadorUuid);
    assert.match(catador.codigo, /^CAT-\d{4,}$/);

    const pontos = (await chamar("/api/pontos-apoio")).dados.dados;
    const responsaveis = (await chamar("/api/responsaveis-pesagem")).dados.dados;
    assert.ok(pontos.length > 0 && responsaveis.length > 0);

    const pesagem = (await chamar("/api/pesagens", {
      method: "POST",
      body: JSON.stringify({ catadorUuid, pontoApoioUuid: pontos[0].uuid, responsavelPesagemUuid: responsaveis[0].uuid, materialUuid, peso: 30, observacao: "Teste integrado removível" }),
    })).dados;
    pesagemUuid = pesagem.uuid;
    entidadesCriadas.add(pesagemUuid);
    assert.equal(pesagem.valorTotal, 15);

    const painelDepois = (await chamar("/api/painel")).dados;
    assert.equal(Number(painelDepois.indicadores.catadores_ativos), Number(painelAntes.catadores_ativos) + 1);
    assert.equal(Number(painelDepois.indicadores.coletas_realizadas), Number(painelAntes.coletas_realizadas) + 1);
    assert.equal(Number(painelDepois.indicadores.total_coletado), Number(painelAntes.total_coletado) + 30);
    assert.equal(painelDepois.producaoSemanal.length, 7);
    assert.ok(painelDepois.atividades.some((item) => item.uuid === pesagemUuid));

    const relatorio = (await chamar(`/api/relatorios/pesagens?catadorUuid=${catadorUuid}`)).dados.dados;
    assert.ok(relatorio.some((item) => item.uuid === pesagemUuid && Number(item.valor_total) === 15));

    const notificacoes = (await chamar("/api/notificacoes")).dados;
    const notificacaoTeste = notificacoes.dados.find((item) => entidadesCriadas.has(item.entidade_uuid));
    assert.ok(notificacaoTeste);
    await chamar(`/api/notificacoes/${notificacaoTeste.uuid}/lida`, { method: "PATCH" });
    const notificacoesLidas = (await chamar("/api/notificacoes")).dados.dados;
    assert.ok(notificacoesLidas.find((item) => item.uuid === notificacaoTeste.uuid)?.lida_em);
    await chamar(`/api/notificacoes/${notificacaoTeste.uuid}`, { method: "DELETE" });
    assert.ok(!(await chamar("/api/notificacoes")).dados.dados.some((item) => item.uuid === notificacaoTeste.uuid));
  } finally {
    if (pesagemUuid) await chamar(`/api/pesagens/${pesagemUuid}`, { method: "DELETE" }).catch(() => {});
    if (catadorUuid) await chamar(`/api/catadores/${catadorUuid}`, { method: "DELETE" }).catch(() => {});
    if (materialUuid) await chamar(`/api/materiais/${materialUuid}`, { method: "DELETE" }).catch(() => {});
    if (cooperativaUuid) await chamar(`/api/cooperativas/${cooperativaUuid}`, { method: "DELETE" }).catch(() => {});
    const notificacoes = await chamar("/api/notificacoes").catch(() => null);
    for (const item of notificacoes?.dados?.dados ?? []) {
      if (entidadesCriadas.has(item.entidade_uuid)) await chamar(`/api/notificacoes/${item.uuid}`, { method: "DELETE" }).catch(() => {});
    }
  }
}

await executar();
console.log("Integração concluída: sessão, proteção, CEP, CRUD, cálculo, painel, relatório e notificações.");

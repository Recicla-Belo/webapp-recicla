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

  const enderecoCep = (await chamar("/api/enderecos/cep/30110000")).dados;
  assert.equal(enderecoCep.cidade, "Belo Horizonte");
  assert.equal(enderecoCep.estado, "MG");
  const painelAntes = (await chamar("/api/painel")).dados.indicadores;
  const sufixo = `${Date.now()}-${process.pid}`;
  let cooperativaUuid;
  let materialUuid;
  let catadorUuid;
  let pesagemUuid;
  let caixaUuid;

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
      contaFinanceira: { tipo: "conta_bancaria", banco: "Banco Teste", agencia: "0001", numeroConta: "12345-6", tipoConta: "corrente", deTerceiro: true, nomeTitular: "Titular Teste", cpfTitular: "12345678901" },
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
      cpf: "12345678901",
      contatos: [{ tipo: "celular", valor: "31999999999", principal: true }, { tipo: "recado", valor: "3133334444", principal: false }],
      endereco: { cep: "30110000", logradouro: "Avenida Afonso Pena", numero: "100", bairro: "Centro", cidade: "Belo Horizonte", estado: "MG" },
      contaFinanceira: { tipo: "conta_bancaria", banco: "Banco Teste Editado", agencia: "0002", numeroConta: "98765-4", tipoConta: "corrente", deTerceiro: true, nomeTitular: "Titular Editado", cpfTitular: "10987654321" },
    }) });
    const perfilEditado = (await chamar(`/api/catadores/${catadorUuid}/perfil`)).dados.catador;
    assert.equal(perfilEditado.nome_completo, `Catador Integração Editado ${sufixo}`);
    assert.equal(perfilEditado.cpf, "12345678901");
    assert.equal(perfilEditado.contatos.length, 2);
    assert.equal(perfilEditado.endereco.cep, "30110000");
    assert.equal(perfilEditado.contas_financeiras[0].banco, "Banco Teste Editado");
    const paginaCatadores = (await chamar(`/api/catadores?busca=${encodeURIComponent(`Catador Integração ${sufixo}`)}&status=ativo&limite=5&deslocamento=0`)).dados;
    assert.equal(paginaCatadores.total, 1);
    assert.equal(paginaCatadores.dados[0]?.uuid, catadorUuid);
    const paginaCooperativas = (await chamar(`/api/cooperativas?busca=${encodeURIComponent(`Integração ${sufixo}`)}&limite=4&deslocamento=0`)).dados;
    assert.equal(paginaCooperativas.total, 1);
    assert.equal(paginaCooperativas.dados[0]?.uuid, cooperativaUuid);

    const pontos = (await chamar("/api/pontos-apoio")).dados.dados;
    const responsaveis = (await chamar("/api/responsaveis-pesagem")).dados.dados;
    assert.ok(pontos.length > 0 && responsaveis.length > 0);

    const dataHoraPesagem = new Date().toISOString();
    const dataCaixa = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date(dataHoraPesagem));
    const pesagem = (await chamar("/api/pesagens", { method: "POST", body: JSON.stringify({ catadorUuid, cooperativaUuid, pontoApoioUuid: pontos[0].uuid, responsavelPesagemUuid: responsaveis[0].uuid, materialUuid, peso: 30, observacao: "Teste integrado removível", dataHora: dataHoraPesagem, status: "concluida" }) })).dados;
    pesagemUuid = pesagem.uuid;
    entidadesCriadas.add(pesagemUuid);
    assert.equal(pesagem.valorTotal, 15);
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
    const edicaoBloqueada = await fetch(`${urlApi}/api/pesagens/${pesagemUuid}`, { method: "PUT", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ catadorUuid, cooperativaUuid, pontoApoioUuid: pontos[0].uuid, responsavelPesagemUuid: responsaveis[0].uuid, materialUuid, peso: 31, dataHora: dataHoraPesagem, status: "concluida", motivoAlteracao: "Deve ser bloqueada" }) });
    assert.equal(edicaoBloqueada.status, 409);
    const caixaReaberto = (await chamar(`/api/catadores/${catadorUuid}/caixa/reabrir`, { method: "POST", body: JSON.stringify({ data: dataCaixa, motivo: "Correção controlada do teste" }) })).dados;
    assert.equal(caixaReaberto.status, "aberto");

    const painelDepois = (await chamar("/api/painel")).dados;
    assert.equal(painelDepois.paginacaoAtividades.pagina, 1);
    assert.equal(painelDepois.paginacaoAtividades.limite, 5);
    assert.ok(painelDepois.paginacaoAtividades.total >= painelDepois.atividades.length);
    const segundaPaginaAtividades = (await chamar("/api/painel?paginaAtividades=2&limiteAtividades=5")).dados;
    assert.equal(segundaPaginaAtividades.paginacaoAtividades.pagina, 2);
    assert.ok(segundaPaginaAtividades.atividades.length <= 5);
    assert.equal(Number(painelDepois.indicadores.catadores_ativos), Number(painelAntes.catadores_ativos) + 1);
    assert.equal(Number(painelDepois.indicadores.coletas_realizadas), Number(painelAntes.coletas_realizadas) + 1);
    assert.equal(Number(painelDepois.indicadores.total_coletado), Number(painelAntes.total_coletado) + 30);
    assert.ok(painelDepois.atividades.some((item) => item.codigo === pesagem.codigo && item.entidade === "pesagens" && item.catador_uuid === catadorUuid));
    const atividadeCaixa = painelDepois.atividades.find((item) => item.entidade === "caixas_catador" && item.catador_uuid === catadorUuid && item.acao === "reabertura");
    assert.equal(atividadeCaixa.codigo_catador, catador.codigo);
    assert.equal(atividadeCaixa.motivo, "Correção controlada do teste");
    assert.equal(Number(atividadeCaixa.valor_caixa), 15);

    const alterada = (await chamar(`/api/pesagens/${pesagemUuid}`, { method: "PUT", body: JSON.stringify({ catadorUuid, cooperativaUuid, pontoApoioUuid: pontos[0].uuid, responsavelPesagemUuid: responsaveis[0].uuid, materialUuid, peso: 40, observacao: "Peso corrigido", dataHora: dataHoraPesagem, status: "agendada", motivoAlteracao: "Correção automatizada do peso e status" }) })).dados;
    assert.equal(alterada.valorTotal, 20);
    assert.equal(alterada.status, "agendada");
    assert.equal(Number((await chamar("/api/painel")).dados.indicadores.coletas_realizadas), Number(painelAntes.coletas_realizadas));

    const respostaRelatorio = (await chamar(`/api/relatorios/pesagens?catadorUuid=${catadorUuid}&limite=5&deslocamento=0`)).dados;
    assert.equal(respostaRelatorio.total, 1);
    assert.equal(Number(respostaRelatorio.totais.peso), 0);
    assert.equal(Number(respostaRelatorio.totais.valor), 0);
    let relatorio = respostaRelatorio.dados;
    assert.ok(relatorio.some((item) => item.uuid === pesagemUuid && item.status === "agendada" && Number(item.valor_total) === 20 && item.historico.some((evento) => evento.acao === "alteracao")));
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
    const usuarioCentral = await bancoTeste.query(`INSERT INTO usuarios (nome,email,senha_hash,administrador,ativo)
      SELECT 'Teste da central de notificações',$1,senha_hash,TRUE,TRUE FROM usuarios WHERE email=$2 RETURNING uuid`, [emailCentralTeste, process.env.ADMIN_EMAIL]);
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
    assert.equal(Number((await chamar("/api/painel")).dados.indicadores.coletas_realizadas), Number(painelAntes.coletas_realizadas));

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
      if (catadorUuid) await cliente.query("DELETE FROM caixas_catador WHERE catador_uuid=$1", [catadorUuid]);
      if (catadorUuid) await cliente.query("DELETE FROM catadores WHERE uuid=$1", [catadorUuid]);
      if (materialUuid) await cliente.query("DELETE FROM materiais WHERE uuid=$1", [materialUuid]);
      if (cooperativaUuid) await cliente.query("DELETE FROM cooperativas WHERE uuid=$1", [cooperativaUuid]);
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
console.log("Integração concluída: sessão, edição e exclusão integral de catador, pesagem, auditoria, painel, relatório e notificações.");

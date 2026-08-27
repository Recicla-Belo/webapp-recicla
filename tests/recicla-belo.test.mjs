import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function renderizar() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("teste", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Não encontrado", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("renderiza a experiência do Recicla Belô", async () => {
  const resposta = await renderizar();
  assert.equal(resposta.status, 200);
  assert.match(resposta.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await resposta.text();
  assert.match(html, /Recicla Belô/);
  assert.match(html, /Gestão que transforma/);
  assert.match(html, /Carregando seu painel/);
  assert.doesNotMatch(html, /Cada pesagem conta|Cada pessoa importa/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
});

test("mantém ambiente, banco e instalação documentados", async () => {
  const [exemplo, estilos, migracao, migracaoNotificacoes, migracaoAuditoria, migracaoCaixas, migracaoLimpeza, migracaoNotificacoesOrfas, migracaoPagamentoMeta, migracaoMetaGeral, migracaoSessao, sqlCompleto, instalador, instaladorProducao, composeProducao, dockerfileProducao, supervisor, servidor, estrutura, api, painel, telaLogin, telaPesagem, telaCatadores, telaCooperativas, telaRelatorios, telaConfiguracoes, paginacao, leiaMe, pacote] = await Promise.all([
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../servidor/migracoes/001_estrutura_inicial.sql", import.meta.url), "utf8"),
    readFile(new URL("../servidor/migracoes/004_notificacoes.sql", import.meta.url), "utf8"),
    readFile(new URL("../servidor/migracoes/006_auditoria_pesagens.sql", import.meta.url), "utf8"),
    readFile(new URL("../servidor/migracoes/008_metas_e_caixas_catadores.sql", import.meta.url), "utf8"),
    readFile(new URL("../servidor/migracoes/009_limpa_auditorias_caixa_orfas.sql", import.meta.url), "utf8"),
    readFile(new URL("../servidor/migracoes/010_limpa_notificacoes_orfas.sql", import.meta.url), "utf8"),
    readFile(new URL("../servidor/migracoes/011_pagamento_por_meta_e_responsaveis.sql", import.meta.url), "utf8"),
    readFile(new URL("../servidor/migracoes/012_meta_geral_catadores_e_busca_prefixada.sql", import.meta.url), "utf8"),
    readFile(new URL("../servidor/migracoes/013_seguranca_sessao_administrador.sql", import.meta.url), "utf8"),
    readFile(new URL("../servidor/sql/recicla-belo-completo.sql", import.meta.url), "utf8"),
    readFile(new URL("../scripts/instalar-e-iniciar.sh", import.meta.url), "utf8"),
    readFile(new URL("../scripts/instalar-producao.sh", import.meta.url), "utf8"),
    readFile(new URL("../docker-compose.producao.yml", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile.producao", import.meta.url), "utf8"),
    readFile(new URL("../scripts/desenvolver.mjs", import.meta.url), "utf8"),
    readFile(new URL("../servidor/src/principal.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/componentes/estrutura-aplicacao.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dados/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/componentes/painel-principal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/componentes/tela-login.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/componentes/tela-pesagem.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/componentes/tela-catadores.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/componentes/tela-cooperativas.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/componentes/tela-relatorios.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/componentes/tela-configuracoes.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/componentes/paginacao.tsx", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(exemplo, /NEXT_PUBLIC_COR_PRIMARIA/);
  assert.match(exemplo, /ADMIN_EMAIL/);
  assert.match(exemplo, /PORTA_FRONTEND/);
  assert.match(exemplo, /HOST_API="127\.0\.0\.1"/);
  assert.match(estilos, /\.pagina-login\{width:100%;grid-template-columns:minmax\(0,1fr\);justify-items:center;align-items:center\}/);
  assert.match(exemplo, /NEXT_PUBLIC_ICONE_APLICACAO="\/favicon\.svg"/);
  assert.match(migracao, /gen_random_uuid\(\)/);
  assert.match(migracao, /websearch_to_tsquery|to_tsvector/);
  assert.match(sqlCompleto, /CREATE TABLE IF NOT EXISTS pesagens/);
  assert.match(sqlCompleto, /REFERENCES catadores\(uuid\)/);
  assert.match(migracaoNotificacoes, /CREATE TABLE IF NOT EXISTS notificacoes/);
  assert.match(sqlCompleto, /CREATE TABLE IF NOT EXISTS notificacoes/);
  assert.match(migracaoAuditoria, /excluida_em TIMESTAMPTZ/);
  assert.match(migracaoAuditoria, /contas_terceiro_identificado/);
  assert.match(migracaoCaixas, /CREATE TABLE IF NOT EXISTS caixas_catador/);
  assert.match(migracaoCaixas, /CREATE TABLE IF NOT EXISTS movimentacoes_caixa_catador/);
  assert.match(migracaoCaixas, /meta_diaria/);
  assert.match(migracaoSessao, /versao_sessao/);
  assert.match(sqlCompleto, /versao_sessao INTEGER/);
  assert.match(migracaoLimpeza, /NOT EXISTS/);
  assert.match(migracaoNotificacoesOrfas, /DELETE FROM notificacoes/);
  assert.match(migracaoNotificacoesOrfas, /caixas_catador/);
  assert.match(migracaoPagamentoMeta, /materiais_meta_diaria_nao_negativa/);
  assert.match(migracaoPagamentoMeta, /valor_bruto_acumulado/);
  assert.match(migracaoMetaGeral, /CREATE TABLE IF NOT EXISTS configuracoes_meta_geral/);
  assert.match(migracaoMetaGeral, /consulta_busca_prefixada/);
  assert.match(migracaoMetaGeral, /meta_geral_ativa/);
  assert.match(sqlCompleto, /ALTER TYPE status_pesagem ADD VALUE IF NOT EXISTS 'agendada'/);
  assert.match(instalador, /docker compose up -d banco/);
  assert.match(instalador, /exec npm run dev/);
  assert.match(supervisor, /esperarBanco/);
  assert.match(supervisor, /esperarFrontend/);
  assert.match(supervisor, /liberarFrontendAnterior/);
  assert.match(supervisor, /\.vinext\/dev\/lock\.json/);
  assert.ok(supervisor.indexOf("for (const processo of processos) encerrarArvore(processo)") < supervisor.indexOf('spawnSync(docker, ["compose", "stop", "banco"]'));
  assert.match(servidor, /httpOnly: true/);
  assert.match(servidor, /sameSite: "strict"/);
  assert.match(servidor, /addHook\("onRequest"/);
  assert.match(servidor, /rateLimit/);
  assert.match(servidor, /methods: \["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"\]/);
  assert.match(servidor, /rotasPublicas = new Set\(\["\/api\/autenticacao\/entrar", rotaConsultarSessao\]\)/);
  assert.match(servidor, /if \(!requisicao\.cookies\.reciclabelo_sessao\) return \{ autenticado: false \}/);
  assert.match(servidor, /ativo = TRUE AND administrador = TRUE/);
  assert.match(estrutura, /useState<boolean \| null>\(null\)/);
  assert.match(estrutura, /setAutenticado\(dados\.autenticado === true\)/);
  assert.match(estrutura, /aria-controls="painel-notificacoes"/);
  assert.match(estrutura, /\/api\/notificacoes\/lidas/);
  assert.match(estrutura, /abrirNotificacao/);
  assert.match(estrutura, /paginaDaNotificacao/);
  assert.match(estrutura, /erroNotificacoes/);
  assert.match(estrutura, /Tentar novamente/);
  assert.match(estrutura, /proximoCursorNotificacoes/);
  assert.match(estrutura, /onScroll=\{carregarAoRolar\}/);
  assert.match(estrutura, /carregandoMaisNotificacoes/);
  assert.match(api, /Não foi possível conectar ao servidor/);
  assert.match(api, /catch \(falha\)/);
  assert.match(estrutura, /Carregando seu painel/);
  assert.doesNotMatch(estrutura, /JosÃ© concluiu|Maria atingiu|Coopesol Leste registrou/);
  assert.doesNotMatch(painel, /RESUMO DO DIA|3,2 t|O trabalho de hoje gera/);
  assert.match(painel, /\/api\/painel/);
  assert.match(painel, /avatar-atividade/);
  assert.match(painel, /Motivo:/);
  assert.match(painel, /paginacaoAtividades/);
  assert.match(painel, /<Paginacao/);
  assert.match(painel, /function rotuloDia/);
  assert.match(telaLogin, /useState\(""\)/);
  assert.match(telaLogin, /placeholder="Digite seu e-mail"/);
  assert.match(telaLogin, /Lembrar meu acesso/);
  assert.match(telaLogin, /localStorage\.setItem\(CHAVE_EMAIL_LEMBRADO/);
  assert.doesNotMatch(telaLogin, /useState\("admin@reciclabelo"\)/);
  assert.match(telaPesagem, /CONFIRMAÇÃO FINAL/);
  assert.match(telaPesagem, /Código do catador/);
  assert.match(telaPesagem, /metaAtingidaAgora/);
  assert.match(telaPesagem, /Cooperativa \/ associação/);
  assert.match(telaPesagem, /<Paginacao/);
  assert.match(telaPesagem, /Valores sujeitos ao atingimento da meta/);
  assert.match(telaPesagem, /progressoMetaGeral/);
  assert.match(telaPesagem, /DetalhesPagamento/);
  assert.match(telaPesagem, /function iniciarProximaPesagem\(\)/);
  assert.match(telaPesagem, /setEtapa\(1\)/);
  assert.match(telaConfiguracoes, /Responsáveis pela pesagem/);
  assert.match(telaConfiguracoes, /\/api\/responsaveis-pesagem\?incluirInativos=true/);
  assert.match(telaConfiguracoes, /\/api\/configuracoes\/meta-geral/);
  assert.match(telaConfiguracoes, /Meta geral diária/);
  assert.match(telaConfiguracoes, /metaDiaria: ""/);
  assert.match(telaConfiguracoes, /placeholder="Sem meta"/);
  assert.match(telaConfiguracoes, /Conta do administrador/);
  assert.match(telaConfiguracoes, /\/api\/administrador\/perfil/);
  assert.match(telaConfiguracoes, /\/api\/administrador\/senha/);
  assert.match(servidor, /alteracao_senha/);
  assert.match(servidor, /versaoSessao/);
  assert.match(servidor, /aplicacao\.post\("\/api\/responsaveis-pesagem"/);
  assert.match(servidor, /DELETE FROM responsaveis_pesagem WHERE uuid=\$1/);
  assert.match(servidor, /pesagensComHistoricoPreservado/);
  assert.match(servidor, /recalcularPagamentoMetaDiaria/);
  assert.match(telaCatadores, /PerfilCatador/);
  assert.match(telaCatadores, /caixa\/\$\{acao\}/);
  assert.match(telaCatadores, /<Paginacao/);
  assert.match(telaCatadores, /formatarCpf/);
  assert.match(telaCatadores, /placeholder="000\.000\.000-00"/);
  assert.match(telaCatadores, /method: "PUT"/);
  assert.match(telaCatadores, /method: "PATCH"/);
  assert.match(telaCatadores, /ModalConfirmacao/);
  assert.match(telaCatadores, /Excluir todos os dados/);
  assert.match(servidor, /aplicacao\.put\("\/api\/catadores\/:uuid"/);
  assert.match(servidor, /exclusao_definitiva/);
  assert.match(servidor, /DELETE FROM movimentacoes_caixa_catador/);
  assert.match(estilos, /@media\(min-width:821px\)\{\.barra-lateral\{[^}]*overflow-y:auto/);
  assert.match(estrutura, /className="conteudo-barra-lateral"/);
  assert.match(estilos, /\.barra-lateral\{position:relative;top:auto;height:auto;min-height:100dvh;max-height:none;align-self:stretch/);
  assert.match(estilos, /\.conteudo-barra-lateral\{position:sticky;top:0;[^}]*height:100dvh;[^}]*overflow-y:auto/);
  assert.match(estilos, /\.modal\.cadastro>\.formulario\{[^}]*overflow-y:auto/);
  assert.match(estilos, /\.acoes-material\{[^}]*display:flex!important/);
  assert.match(estilos, /titulo-cabecalho h1\{max-width:none;white-space:normal/);
  assert.match(telaCooperativas, /<Paginacao/);
  assert.match(telaCooperativas, /ModalConfirmacao/);
  assert.match(telaRelatorios, /CORREÇÃO AUDITÁVEL/);
  assert.match(telaRelatorios, /exclusao_logica/);
  assert.match(telaRelatorios, /<Paginacao/);
  assert.match(paginacao, /paginasVisiveis/);
  assert.match(estilos, /\.paginacao\{[^}]*max-width:100%/);
  assert.match(servidor, /registrarAuditoria/);
  assert.match(servidor, /motivoAlteracao/);
  assert.match(estilos, /\.usuario\{[^}]*cursor:pointer/);
  assert.match(estilos, /\.campo input,\.campo select,\.campo textarea\{height:58px/);
  assert.match(estilos, /\.conteudo:before\{/);
  assert.match(estilos, /env\(safe-area-inset-bottom/);
  assert.match(estilos, /\.barra-lateral nav\{[^}]*overflow-x:auto!important/);
  assert.match(estilos, /\.erro-notificacoes\{/);
  assert.match(estilos, /\.lista-notificacoes\{[^}]*overflow-y:scroll/);
  assert.match(estilos, /\.lista-notificacoes::-webkit-scrollbar/);
  assert.match(servidor, /proximoCursor/);
  assert.equal(JSON.parse(pacote).dependencies["lucide-react"], "^1.33.0");
  assert.equal(JSON.parse(pacote).scripts.dev, "node scripts/desenvolver.mjs");
  assert.match(instaladorProducao, /--dominio/);
  assert.match(instaladorProducao, /nginx -t/);
  assert.match(instaladorProducao, /Conta administrativa existente preservada/);
  assert.match(composeProducao, /127\.0\.0\.1:\$\{PORTA_API/);
  assert.doesNotMatch(composeProducao, /BANCO_PORTA[^\n]*:5432/);
  assert.match(dockerfileProducao, /npm run lint/);
  assert.match(dockerfileProducao, /npm test/);
  assert.match(leiaMe, /PostgreSQL 18\.6/);
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("../app/dados/demonstracao.ts", import.meta.url)));
});

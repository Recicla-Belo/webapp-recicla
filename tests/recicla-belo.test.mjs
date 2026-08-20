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
  const [exemplo, estilos, migracao, migracaoNotificacoes, sqlCompleto, instalador, supervisor, servidor, estrutura, painel, leiaMe, pacote] = await Promise.all([
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../servidor/migracoes/001_estrutura_inicial.sql", import.meta.url), "utf8"),
    readFile(new URL("../servidor/migracoes/004_notificacoes.sql", import.meta.url), "utf8"),
    readFile(new URL("../servidor/sql/recicla-belo-completo.sql", import.meta.url), "utf8"),
    readFile(new URL("../scripts/instalar-e-iniciar.sh", import.meta.url), "utf8"),
    readFile(new URL("../scripts/desenvolver.mjs", import.meta.url), "utf8"),
    readFile(new URL("../servidor/src/principal.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/componentes/estrutura-aplicacao.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/componentes/painel-principal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(exemplo, /NEXT_PUBLIC_COR_PRIMARIA/);
  assert.match(exemplo, /ADMIN_EMAIL/);
  assert.match(exemplo, /PORTA_FRONTEND/);
  assert.match(estilos, /\.pagina-login\{width:100%;grid-template-columns:minmax\(0,1fr\);justify-items:center;align-items:center\}/);
  assert.match(exemplo, /NEXT_PUBLIC_ICONE_APLICACAO="\/favicon\.svg"/);
  assert.match(migracao, /gen_random_uuid\(\)/);
  assert.match(migracao, /websearch_to_tsquery|to_tsvector/);
  assert.match(sqlCompleto, /CREATE TABLE IF NOT EXISTS pesagens/);
  assert.match(sqlCompleto, /REFERENCES catadores\(uuid\)/);
  assert.match(migracaoNotificacoes, /CREATE TABLE IF NOT EXISTS notificacoes/);
  assert.match(sqlCompleto, /CREATE TABLE IF NOT EXISTS notificacoes/);
  assert.match(instalador, /docker compose up -d banco/);
  assert.match(instalador, /exec npm run dev/);
  assert.match(supervisor, /esperarBanco/);
  assert.match(supervisor, /esperarFrontend/);
  assert.match(servidor, /httpOnly: true/);
  assert.match(servidor, /sameSite: "strict"/);
  assert.match(servidor, /addHook\("onRequest"/);
  assert.match(servidor, /rateLimit/);
  assert.match(servidor, /rotasPublicas = new Set\(\["\/api\/autenticacao\/entrar", rotaConsultarSessao\]\)/);
  assert.match(servidor, /if \(!requisicao\.cookies\.reciclabelo_sessao\) return \{ autenticado: false \}/);
  assert.match(servidor, /ativo = TRUE AND administrador = TRUE/);
  assert.match(estrutura, /useState<boolean \| null>\(null\)/);
  assert.match(estrutura, /setAutenticado\(dados\.autenticado === true\)/);
  assert.match(estrutura, /aria-controls="painel-notificacoes"/);
  assert.match(estrutura, /\/api\/notificacoes\/lidas/);
  assert.match(estrutura, /Carregando seu painel/);
  assert.doesNotMatch(estrutura, /JosÃ© concluiu|Maria atingiu|Coopesol Leste registrou/);
  assert.doesNotMatch(painel, /RESUMO DO DIA|3,2 t|O trabalho de hoje gera/);
  assert.match(painel, /\/api\/painel/);
  assert.match(estilos, /\.usuario\{[^}]*cursor:pointer/);
  assert.match(estilos, /\.campo input,\.campo select,\.campo textarea\{height:58px/);
  assert.match(estilos, /\.conteudo:before\{/);
  assert.equal(JSON.parse(pacote).dependencies["lucide-react"], "^1.33.0");
  assert.equal(JSON.parse(pacote).scripts.dev, "node scripts/desenvolver.mjs");
  assert.match(leiaMe, /PostgreSQL 18\.6/);
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("../app/dados/demonstracao.ts", import.meta.url)));
});

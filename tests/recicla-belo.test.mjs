import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const raiz = new URL("../", import.meta.url);

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
  assert.match(html, /Bem-vindo de volta/);
  assert.match(html, /Acesso exclusivo do administrador/);
  assert.match(html, /Gestão que transforma/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
});

test("mantém ambiente, banco e instalação documentados", async () => {
  const [exemplo, migracao, instalador, leiaMe] = await Promise.all([
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../servidor/migracoes/001_estrutura_inicial.sql", import.meta.url), "utf8"),
    readFile(new URL("../scripts/instalar-e-iniciar.sh", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);
  assert.match(exemplo, /NEXT_PUBLIC_COR_PRIMARIA/);
  assert.match(exemplo, /ADMIN_EMAIL/);
  assert.match(migracao, /gen_random_uuid\(\)/);
  assert.match(migracao, /websearch_to_tsquery|to_tsvector/);
  assert.match(instalador, /docker compose up -d banco/);
  assert.match(leiaMe, /PostgreSQL 18\.6/);
  await access(new URL("../public/og.png", import.meta.url));
});

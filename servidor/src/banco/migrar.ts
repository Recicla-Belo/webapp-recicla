import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { banco } from "./conexao.js";

async function migrar() {
  await banco.query(`CREATE TABLE IF NOT EXISTS controle_migracoes (
    nome TEXT PRIMARY KEY,
    aplicado_em TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  // O contêiner oficial também executa os SQLs no primeiro boot. Quando isso
  // acontecer, sincronizamos o histórico sem repetir tipos e tabelas já criados.
  const estruturaExistente = await banco.query<{ existe: boolean }>("SELECT to_regclass('public.usuarios') IS NOT NULL AS existe");
  if (estruturaExistente.rows[0]?.existe) {
    await banco.query("INSERT INTO controle_migracoes (nome) VALUES ('001_estrutura_inicial.sql') ON CONFLICT DO NOTHING");
    const dadosExistentes = await banco.query<{ existe: boolean }>("SELECT EXISTS(SELECT 1 FROM materiais WHERE nome = 'Material misturado') AS existe");
    if (dadosExistentes.rows[0]?.existe) {
      await banco.query("INSERT INTO controle_migracoes (nome) VALUES ('002_dados_iniciais.sql') ON CONFLICT DO NOTHING");
    }
  }
  const pasta = resolve(process.cwd(), "migracoes");
  const arquivos = (await readdir(pasta)).filter((nome) => nome.endsWith(".sql")).sort();
  for (const nome of arquivos) {
    const aplicada = await banco.query<{ existe: boolean }>("SELECT EXISTS(SELECT 1 FROM controle_migracoes WHERE nome = $1) AS existe", [nome]);
    if (aplicada.rows[0]?.existe) continue;
    const sql = await readFile(resolve(pasta, nome), "utf8");
    await banco.query(sql);
    await banco.query("INSERT INTO controle_migracoes (nome) VALUES ($1)", [nome]);
    console.log(`Migração aplicada: ${nome}`);
  }
}

migrar().finally(() => banco.end());

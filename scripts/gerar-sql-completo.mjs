import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const raiz = process.cwd();
const pastaMigracoes = resolve(raiz, "servidor", "migracoes");
const pastaSaida = resolve(raiz, "servidor", "sql");
const destino = resolve(pastaSaida, "recicla-belo-completo.sql");
const arquivos = (await readdir(pastaMigracoes)).filter((nome) => nome.endsWith(".sql")).sort();
const partes = [
  "-- Recicla Belô — estrutura completa do PostgreSQL 18.6",
  "-- Arquivo gerado a partir das migrações oficiais. Execute em um banco vazio.",
  "-- O administrador é criado separadamente por `npm run banco:seed`, pois a senha é protegida com bcrypt.",
  "\\set ON_ERROR_STOP on",
  "",
];

for (const arquivo of arquivos) {
  partes.push(`-- ============================================================================\n-- ${arquivo}\n-- ============================================================================`);
  partes.push(await readFile(resolve(pastaMigracoes, arquivo), "utf8"));
}

await mkdir(pastaSaida, { recursive: true });
await writeFile(destino, `${partes.join("\n\n").trim()}\n`, "utf8");
console.log(destino);

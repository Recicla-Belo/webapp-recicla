import pg from "pg";
import { ambiente } from "../configuracao/ambiente.js";

const { Pool } = pg;

export const banco = new Pool({
  connectionString: ambiente.URL_BANCO,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: ambiente.usarSsl ? { rejectUnauthorized: true } : false,
  application_name: "recicla-belo-api",
});

banco.on("error", (erro) => {
  console.error("Conexão ociosa com o banco falhou", erro);
});

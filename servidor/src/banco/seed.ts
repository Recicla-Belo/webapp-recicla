import bcrypt from "bcrypt";
import { banco } from "./conexao.js";
import { ambiente } from "../configuracao/ambiente.js";

async function executarSeed() {
  const senhaHash = await bcrypt.hash(ambiente.ADMIN_SENHA, 12);
  await banco.query(
    `INSERT INTO usuarios (nome, email, senha_hash, administrador)
     VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (email) DO UPDATE SET
       nome = EXCLUDED.nome,
       senha_hash = EXCLUDED.senha_hash,
       administrador = TRUE,
       ativo = TRUE,
       atualizado_em = now()`,
    [ambiente.ADMIN_NOME, ambiente.ADMIN_EMAIL, senhaHash],
  );
  console.log(`Administrador preparado: ${ambiente.ADMIN_EMAIL}`);
}

executarSeed().finally(() => banco.end());

import { config } from "dotenv";
import { z } from "zod";

config({ path: new URL("../../../.env", import.meta.url).pathname.replace(/^\/(.:)/, "$1") });

const esquemaAmbiente = z.object({
  AMBIENTE: z.enum(["desenvolvimento", "teste", "producao"]).default("desenvolvimento"),
  CONFIAR_PROXY: z.enum(["true", "false"]).default("false"),
  HOST_API: z.string().trim().min(1).max(255).regex(/^[a-zA-Z0-9.:_-]+$/).default("127.0.0.1"),
  PORTA_API: z.coerce.number().int().positive().default(3333),
  ORIGEM_FRONTEND: z.string().default("http://localhost:3000"),
  SEGREDO_JWT: z.string().min(32),
  EXPIRACAO_SESSAO: z.string().default("8h"),
  URL_BANCO: z.string().url(),
  BANCO_SSL: z.enum(["true", "false"]).default("false"),
  ADMIN_EMAIL: z.string().regex(/^[^\s@]+@[^\s@]+$/).transform((valor) => valor.toLowerCase()),
  ADMIN_SENHA: z.string().min(12),
  ADMIN_NOME: z.string().min(2),
  LIMITE_ARQUIVO_MB: z.coerce.number().positive().default(8),
  PASTA_ARQUIVOS: z.string().default("servidor/arquivos"),
});

const resultado = esquemaAmbiente.safeParse(process.env);
if (!resultado.success) {
  throw new Error(`Variáveis de ambiente inválidas: ${z.prettifyError(resultado.error)}`);
}

export const ambiente = {
  ...resultado.data,
  origensPermitidas: resultado.data.ORIGEM_FRONTEND.split(",").map((origem) => origem.trim()),
  usarSsl: resultado.data.BANCO_SSL === "true",
  confiarProxy: resultado.data.CONFIAR_PROXY === "true",
};

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import bcrypt from "bcrypt";
import { z } from "zod";
import { banco } from "./banco/conexao.js";
import { ambiente } from "./configuracao/ambiente.js";

const aplicacao = Fastify({
  logger: {
    level: ambiente.AMBIENTE === "producao" ? "info" : "debug",
    redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
  },
  bodyLimit: ambiente.LIMITE_ARQUIVO_MB * 1024 * 1024,
  trustProxy: ambiente.confiarProxy,
});

await aplicacao.register(cors, {
  origin(origem, retorno) {
    if (!origem || ambiente.origensPermitidas.includes(origem)) return retorno(null, true);
    return retorno(new Error("Origem não permitida"), false);
  },
  credentials: true,
});
await aplicacao.register(helmet, { global: true });
await aplicacao.register(rateLimit, {
  global: true,
  max: 240,
  timeWindow: "1 minute",
  errorResponseBuilder: () => ({ mensagem: "Muitas requisições. Aguarde alguns instantes e tente novamente." }),
});
await aplicacao.register(cookie);
await aplicacao.register(jwt, {
  secret: ambiente.SEGREDO_JWT,
  cookie: { cookieName: "reciclabelo_sessao", signed: false },
  sign: { expiresIn: ambiente.EXPIRACAO_SESSAO, algorithm: "HS256", iss: "recicla-belo-api", aud: "recicla-belo-web" },
  verify: { algorithms: ["HS256"], allowedIss: "recicla-belo-api", allowedAud: "recicla-belo-web" },
});
await aplicacao.register(multipart, { limits: { fileSize: ambiente.LIMITE_ARQUIVO_MB * 1024 * 1024, files: 1 } });

const rotaConsultarSessao = "/api/autenticacao/sessao";
const rotasPublicas = new Set(["/api/autenticacao/entrar", rotaConsultarSessao]);
const senhaFicticiaHash = await bcrypt.hash(`acesso-inexistente-${randomUUID()}`, 12);
const opcoesCookieSessao = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: ambiente.AMBIENTE === "producao",
  path: "/",
};

type AdministradorAtivo = { uuid: string; nome: string; email: string; administrador: boolean };
type ExecutorSql = { query: (texto: string, valores?: unknown[]) => Promise<unknown> };
type EnderecoCep = { cep: string; logradouro: string; complemento: string; bairro: string; cidade: string; estado: string };
const cacheEnderecosCep = new Map<string, { endereco: EnderecoCep; expiraEm: number }>();

async function buscarAdministradorAtivo(usuarioUuid: string) {
  const resultado = await banco.query<AdministradorAtivo>(
    "SELECT uuid, nome, email, administrador FROM usuarios WHERE uuid = $1 AND ativo = TRUE AND administrador = TRUE LIMIT 1",
    [usuarioUuid],
  );
  return resultado.rows[0];
}

async function criarNotificacao(executor: ExecutorSql, usuarioUuid: string, tipo: string, titulo: string, mensagem: string, entidade?: string, entidadeUuid?: string) {
  await executor.query(
    `INSERT INTO notificacoes (usuario_uuid, tipo, titulo, mensagem, entidade, entidade_uuid)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [usuarioUuid, tipo, titulo, mensagem, entidade ?? null, entidadeUuid ?? null],
  );
}

async function registrarAuditoria(executor: ExecutorSql, usuarioUuid: string, acao: string, entidade: string, entidadeUuid: string, dados: Record<string, unknown>, enderecoIp?: string) {
  await executor.query(
    `INSERT INTO auditoria (usuario_uuid, acao, entidade, entidade_uuid, dados, endereco_ip)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [usuarioUuid, acao, entidade, entidadeUuid, dados, enderecoIp ?? null],
  );
}

async function exigirAutenticacao(requisicao: FastifyRequest, resposta: FastifyReply) {
  try {
    await requisicao.jwtVerify();
  } catch {
    return resposta.code(401).send({ mensagem: "Sessão inválida ou expirada." });
  }
  const usuario = await buscarAdministradorAtivo(requisicao.user.usuarioUuid);
  if (!usuario) {
    resposta.clearCookie("reciclabelo_sessao", opcoesCookieSessao);
    return resposta.code(401).send({ mensagem: "Sessão inválida ou expirada." });
  }
}

aplicacao.addHook("onRequest", async (requisicao, resposta) => {
  const caminho = requisicao.url.split("?", 1)[0] ?? "";
  if (caminho.startsWith("/api/") && !rotasPublicas.has(caminho)) return exigirAutenticacao(requisicao, resposta);
});

aplicacao.addHook("onSend", async (requisicao, resposta, carga) => {
  if ((requisicao.routeOptions.url ?? "").startsWith("/api/")) resposta.header("cache-control", "no-store");
  return carga;
});

aplicacao.get("/saude", async () => {
  await banco.query("SELECT 1");
  return { estado: "saudavel" };
});

aplicacao.post("/api/autenticacao/entrar", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (requisicao, resposta) => {
  const entrada = z.object({ email: z.string().trim().max(254).regex(/^[^\s@]+@[^\s@]+$/), senha: z.string().min(1).max(128) }).safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "E-mail ou senha inválidos." });
  const resultado = await banco.query<{ uuid: string; email: string; nome: string; senha_hash: string; administrador: boolean }>(
    "SELECT uuid, email, nome, senha_hash, administrador FROM usuarios WHERE email = $1 AND ativo = TRUE AND administrador = TRUE LIMIT 1",
    [entrada.data.email.toLowerCase()],
  );
  const usuario = resultado.rows[0];
  const senhaCorreta = await bcrypt.compare(entrada.data.senha, usuario?.senha_hash ?? senhaFicticiaHash);
  if (!usuario || !senhaCorreta) {
    return resposta.code(401).send({ mensagem: "E-mail ou senha inválidos." });
  }
  await banco.query("UPDATE usuarios SET ultimo_acesso_em = now() WHERE uuid = $1", [usuario.uuid]);
  const token = await resposta.jwtSign({ usuarioUuid: usuario.uuid, email: usuario.email, administrador: usuario.administrador });
  resposta.setCookie("reciclabelo_sessao", token, opcoesCookieSessao);
  return { autenticado: true, usuario: { uuid: usuario.uuid, nome: usuario.nome, email: usuario.email, administrador: usuario.administrador } };
});

aplicacao.get(rotaConsultarSessao, { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (requisicao, resposta) => {
  if (!requisicao.cookies.reciclabelo_sessao) return { autenticado: false };
  try {
    await requisicao.jwtVerify();
  } catch {
    resposta.clearCookie("reciclabelo_sessao", opcoesCookieSessao);
    return { autenticado: false };
  }
  const usuario = await buscarAdministradorAtivo(requisicao.user.usuarioUuid);
  if (!usuario) {
    resposta.clearCookie("reciclabelo_sessao", opcoesCookieSessao);
    return { autenticado: false };
  }
  return { autenticado: true, usuario };
});

aplicacao.post("/api/autenticacao/sair", async (_requisicao, resposta) => {
  resposta.clearCookie("reciclabelo_sessao", opcoesCookieSessao);
  return resposta.code(204).send();
});

aplicacao.get("/api/painel", async () => {
  const indicadores = await banco.query(`SELECT
    (SELECT count(*)::int FROM catadores WHERE status = 'ativo') AS catadores_ativos,
    coalesce(sum(p.peso_total), 0)::float8 AS total_coletado,
    coalesce(sum(p.valor_total), 0)::float8 AS valor_total_pagar,
    count(p.uuid)::int AS coletas_realizadas,
    coalesce(sum(p.peso_total) / nullif(count(DISTINCT p.catador_uuid), 0), 0)::float8 AS media_por_catador
    FROM pesagens p WHERE p.status = 'concluida' AND p.excluida_em IS NULL AND date_trunc('month', p.data_hora) = date_trunc('month', now())`);
  const producao = await banco.query(`SELECT dia::date AS data, coalesce(sum(p.peso_total),0)::float8 AS peso
    FROM generate_series(current_date - interval '6 days', current_date, interval '1 day') dia
    LEFT JOIN pesagens p ON p.status='concluida' AND p.excluida_em IS NULL AND p.data_hora >= dia AND p.data_hora < dia + interval '1 day'
    GROUP BY dia ORDER BY dia`);
  const atividades = await banco.query(`SELECT p.uuid,p.codigo,p.data_hora AS criado_em,p.peso_total::float8,p.valor_total::float8,
      c.nome_completo AS catador,m.nome AS material
    FROM pesagens p JOIN catadores c ON c.uuid=p.catador_uuid
    JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid JOIN materiais m ON m.uuid=ip.material_uuid
    WHERE p.status='concluida' AND p.excluida_em IS NULL ORDER BY p.data_hora DESC LIMIT 5`);
  return { indicadores: indicadores.rows[0], producaoSemanal: producao.rows, atividades: atividades.rows };
});

aplicacao.get("/api/catadores", async (requisicao) => {
  const consulta = z.object({ busca: z.string().trim().max(120).default(""), limite: z.coerce.number().int().min(1).max(100).default(30), deslocamento: z.coerce.number().int().min(0).default(0) }).parse(requisicao.query);
  const parametros: unknown[] = [consulta.limite, consulta.deslocamento];
  let filtro = "";
  if (consulta.busca) {
    parametros.push(consulta.busca);
    filtro = `WHERE to_tsvector('portuguese', coalesce(c.nome_completo,'') || ' ' || coalesce(c.apelido,'') || ' ' || c.codigo)
      @@ websearch_to_tsquery('portuguese', $3)`;
  }
  const { rows } = await banco.query(`SELECT c.uuid, c.codigo, c.nome_completo, c.apelido, c.genero, c.raca_cor, c.data_nascimento, c.cpf, c.status,
      co.nome AS cooperativa, coalesce(json_agg(json_build_object('tipo', ct.tipo, 'valor', ct.valor)) FILTER (WHERE ct.uuid IS NOT NULL), '[]') AS contatos
      ,coalesce((SELECT sum(p.peso_total) FROM pesagens p WHERE p.catador_uuid=c.uuid AND p.status='concluida' AND p.excluida_em IS NULL),0)::float8 AS total_quilos,
      EXISTS(SELECT 1 FROM arquivos_catador ar WHERE ar.catador_uuid=c.uuid AND ar.tipo='foto_rosto') AS tem_foto
    FROM catadores c LEFT JOIN cooperativas co ON co.uuid = c.cooperativa_uuid
    LEFT JOIN contatos_catador ct ON ct.catador_uuid = c.uuid ${filtro}
    GROUP BY c.uuid, co.nome ORDER BY c.nome_completo LIMIT $1 OFFSET $2`, parametros);
  return { dados: rows, limite: consulta.limite, deslocamento: consulta.deslocamento };
});

const esquemaCooperativa = z.object({ nome: z.string().trim().min(2).max(160), nomeResponsavel: z.string().trim().min(2).max(160), telefone: z.string().trim().max(30).optional(), observacao: z.string().trim().max(1000).optional(), ativa: z.boolean().default(true) });

aplicacao.get("/api/cooperativas", async () => {
  const { rows } = await banco.query(`SELECT co.uuid,co.nome,co.nome_responsavel,co.telefone,co.observacao,co.status,
      count(c.uuid) FILTER (WHERE c.status='ativo')::int AS catadores_ativos
    FROM cooperativas co LEFT JOIN catadores c ON c.cooperativa_uuid=co.uuid
    GROUP BY co.uuid ORDER BY co.nome`);
  return { dados: rows };
});

aplicacao.post("/api/cooperativas", async (requisicao, resposta) => {
  const entrada = esquemaCooperativa.safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Revise os dados da cooperativa.", detalhes: z.treeifyError(entrada.error) });
  const { rows } = await banco.query<{ uuid: string }>(`INSERT INTO cooperativas (nome,nome_responsavel,telefone,observacao,status)
    VALUES ($1,$2,$3,$4,$5) RETURNING uuid`, [entrada.data.nome, entrada.data.nomeResponsavel, entrada.data.telefone || null, entrada.data.observacao || null, entrada.data.ativa ? "ativo" : "inativo"]);
  await criarNotificacao(banco, requisicao.user.usuarioUuid, "cooperativa", "Cooperativa cadastrada", `${entrada.data.nome} foi adicionada ao sistema.`, "cooperativas", rows[0]!.uuid);
  return resposta.code(201).send({ uuid: rows[0]!.uuid });
});

aplicacao.put("/api/cooperativas/:uuid", async (requisicao, resposta) => {
  const uuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const entrada = esquemaCooperativa.safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Revise os dados da cooperativa.", detalhes: z.treeifyError(entrada.error) });
  const resultado = await banco.query(`UPDATE cooperativas SET nome=$1,nome_responsavel=$2,telefone=$3,observacao=$4,status=$5,atualizado_em=now() WHERE uuid=$6`, [entrada.data.nome, entrada.data.nomeResponsavel, entrada.data.telefone || null, entrada.data.observacao || null, entrada.data.ativa ? "ativo" : "inativo", uuid]);
  if (!resultado.rowCount) return resposta.code(404).send({ mensagem: "Cooperativa não encontrada." });
  await criarNotificacao(banco, requisicao.user.usuarioUuid, "cooperativa", "Cooperativa atualizada", `${entrada.data.nome} teve seus dados atualizados.`, "cooperativas", uuid);
  return resposta.code(204).send();
});

aplicacao.delete("/api/cooperativas/:uuid", async (requisicao, resposta) => {
  const uuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const excluida = await banco.query<{ nome: string }>("DELETE FROM cooperativas WHERE uuid=$1 RETURNING nome", [uuid]);
  if (!excluida.rowCount) return resposta.code(404).send({ mensagem: "Cooperativa não encontrada." });
  await criarNotificacao(banco, requisicao.user.usuarioUuid, "cooperativa", "Cooperativa removida", `${excluida.rows[0]!.nome} foi removida do sistema.`, "cooperativas", uuid);
  return resposta.code(204).send();
});

const esquemaContaFinanceira = z.object({
  tipo: z.enum(["pix", "conta_bancaria"]),
  tipoChavePix: z.string().trim().max(30).optional(),
  chavePix: z.string().trim().max(300).optional(),
  banco: z.string().trim().max(120).optional(),
  agencia: z.string().trim().max(20).optional(),
  numeroConta: z.string().trim().max(30).optional(),
  tipoConta: z.string().trim().max(40).optional(),
  deTerceiro: z.boolean().default(false),
  nomeTitular: z.string().trim().max(200).optional(),
  cpfTitular: z.string().regex(/^\d{11}$/).optional(),
  relacaoTitular: z.string().trim().max(120).optional(),
}).superRefine((conta, contexto) => {
  if (conta.tipo === "pix" && !conta.chavePix) contexto.addIssue({ code: "custom", path: ["chavePix"], message: "Informe a chave Pix." });
  if (conta.tipo === "conta_bancaria") {
    if (!conta.banco) contexto.addIssue({ code: "custom", path: ["banco"], message: "Informe o banco." });
    if (!conta.agencia) contexto.addIssue({ code: "custom", path: ["agencia"], message: "Informe a agência." });
    if (!conta.numeroConta) contexto.addIssue({ code: "custom", path: ["numeroConta"], message: "Informe a conta." });
    if (!conta.tipoConta) contexto.addIssue({ code: "custom", path: ["tipoConta"], message: "Informe o tipo da conta." });
  }
  if (conta.deTerceiro) {
    if (!conta.nomeTitular) contexto.addIssue({ code: "custom", path: ["nomeTitular"], message: "Informe o nome do titular." });
    if (!conta.cpfTitular) contexto.addIssue({ code: "custom", path: ["cpfTitular"], message: "Informe o CPF do titular." });
  }
});

const esquemaCatador = z.object({
  nomeCompleto: z.string().trim().min(2).max(200),
  apelido: z.string().trim().max(100).optional(),
  cooperativaUuid: z.uuid().optional(),
  genero: z.string().max(60).optional(),
  racaCor: z.string().max(60).optional(),
  dataNascimento: z.iso.date().optional(),
  cpf: z.string().regex(/^\d{11}$/).optional(),
  contatos: z.array(z.object({ tipo: z.enum(["celular", "telefone", "whatsapp", "recado", "email"]), valor: z.string().min(3).max(254), principal: z.boolean().default(false) })).default([]),
  endereco: z.object({ cep: z.string().regex(/^\d{8}$/).optional(), logradouro: z.string().max(200).optional(), numero: z.string().max(30).optional(), complemento: z.string().max(120).optional(), bairro: z.string().max(120).optional(), cidade: z.string().max(120).default("Belo Horizonte"), estado: z.string().length(2).default("MG") }).optional(),
  contaFinanceira: esquemaContaFinanceira.optional(),
});

aplicacao.post("/api/catadores", async (requisicao, resposta) => {
  const entrada = esquemaCatador.safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Revise os dados informados.", detalhes: z.treeifyError(entrada.error) });
  const cliente = await banco.connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query("SELECT pg_advisory_xact_lock(hashtext('catadores_codigo'))");
    const proximo = await cliente.query<{ codigo: string }>("SELECT 'CAT-' || lpad((coalesce(max(substring(codigo from '[0-9]+')::int),0) + 1)::text, 4, '0') AS codigo FROM catadores");
    const { nomeCompleto, apelido, cooperativaUuid, genero, racaCor, dataNascimento, cpf, contatos, endereco, contaFinanceira } = entrada.data;
    const criado = await cliente.query<{ uuid: string; codigo: string }>(`INSERT INTO catadores (codigo, cooperativa_uuid, nome_completo, apelido, genero, raca_cor, data_nascimento, cpf)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING uuid,codigo`, [proximo.rows[0]?.codigo, cooperativaUuid ?? null, nomeCompleto, apelido ?? null, genero ?? null, racaCor ?? null, dataNascimento ?? null, cpf ?? null]);
    const catador = criado.rows[0]!;
    for (const contato of contatos) await cliente.query("INSERT INTO contatos_catador (catador_uuid,tipo,valor,principal) VALUES ($1,$2,$3,$4)", [catador.uuid, contato.tipo, contato.valor, contato.principal]);
    if (endereco) await cliente.query(`INSERT INTO enderecos_catador (catador_uuid,cep,logradouro,numero,complemento,bairro,cidade,estado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [catador.uuid, endereco.cep ?? null, endereco.logradouro ?? null, endereco.numero ?? null, endereco.complemento ?? null, endereco.bairro ?? null, endereco.cidade, endereco.estado]);
    if (contaFinanceira) await cliente.query(`INSERT INTO contas_financeiras_catador (catador_uuid,tipo,tipo_chave_pix,chave_pix,banco,agencia,numero_conta,tipo_conta,de_terceiro,nome_titular,cpf_titular,relacao_titular)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [catador.uuid, contaFinanceira.tipo, contaFinanceira.tipoChavePix ?? null, contaFinanceira.chavePix ?? null, contaFinanceira.banco ?? null, contaFinanceira.agencia ?? null, contaFinanceira.numeroConta ?? null, contaFinanceira.tipoConta ?? null, contaFinanceira.deTerceiro, contaFinanceira.nomeTitular ?? null, contaFinanceira.cpfTitular ?? null, contaFinanceira.relacaoTitular ?? null]);
    await criarNotificacao(cliente, requisicao.user.usuarioUuid, "catador", "Catador cadastrado", `${nomeCompleto} foi cadastrado com o código ${catador.codigo}.`, "catadores", catador.uuid);
    await cliente.query("COMMIT");
    return resposta.code(201).send(catador);
  } catch (erro) {
    await cliente.query("ROLLBACK");
    throw erro;
  } finally { cliente.release(); }
});

aplicacao.post("/api/catadores/:uuid/foto", async (requisicao, resposta) => {
  const catadorUuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const arquivo = await requisicao.file();
  if (!arquivo || !["image/jpeg", "image/png", "image/webp"].includes(arquivo.mimetype)) return resposta.code(400).send({ mensagem: "Envie uma foto JPG, PNG ou WebP." });
  const conteudo = await arquivo.toBuffer();
  const extensao = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }[arquivo.mimetype]!;
  const chave = `${catadorUuid}/${randomUUID()}${extensao}`;
  const destino = resolve(ambiente.PASTA_ARQUIVOS, chave);
  const nomeOriginal = [...basename(arquivo.filename)].filter((caractere) => caractere.charCodeAt(0) > 31 && caractere.charCodeAt(0) !== 127).join("").slice(0, 255) || `foto${extensao}`;
  await mkdir(resolve(destino, ".."), { recursive: true });
  await writeFile(destino, conteudo, { flag: "wx" });
  await banco.query(`INSERT INTO arquivos_catador (catador_uuid,nome_arquivo,chave_armazenamento,tipo_mime,tamanho_bytes,hash_sha256)
    VALUES ($1,$2,$3,$4,$5,$6)`, [catadorUuid, nomeOriginal, chave, arquivo.mimetype, conteudo.length, createHash("sha256").update(conteudo).digest("hex")]);
  return resposta.code(201).send({ chave });
});

aplicacao.delete("/api/catadores/:uuid", async (requisicao, resposta) => {
  const uuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const excluido = await banco.query<{ nome_completo: string }>("DELETE FROM catadores WHERE uuid=$1 RETURNING nome_completo", [uuid]);
  if (!excluido.rowCount) return resposta.code(404).send({ mensagem: "Catador não encontrado." });
  await criarNotificacao(banco, requisicao.user.usuarioUuid, "catador", "Catador removido", `${excluido.rows[0]!.nome_completo} foi removido do sistema.`, "catadores", uuid);
  return resposta.code(204).send();
});

aplicacao.get("/api/catadores/:uuid/foto", async (requisicao, resposta) => {
  const catadorUuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const arquivo = await banco.query<{ chave_armazenamento: string; tipo_mime: string }>("SELECT chave_armazenamento,tipo_mime FROM arquivos_catador WHERE catador_uuid=$1 AND tipo='foto_rosto' ORDER BY criado_em DESC LIMIT 1", [catadorUuid]);
  if (!arquivo.rows[0]) return resposta.code(404).send({ mensagem: "Foto não encontrada." });
  const raiz = resolve(ambiente.PASTA_ARQUIVOS);
  const caminho = resolve(raiz, arquivo.rows[0].chave_armazenamento);
  const caminhoRelativo = relative(raiz, caminho);
  if (caminhoRelativo.startsWith("..") || isAbsolute(caminhoRelativo)) return resposta.code(400).send({ mensagem: "Arquivo inválido." });
  return resposta.type(arquivo.rows[0].tipo_mime).send(await readFile(caminho));
});

aplicacao.get("/api/materiais", async () => {
  const { rows } = await banco.query("SELECT * FROM materiais ORDER BY status DESC, nome");
  return { dados: rows };
});

const esquemaMaterial = z.object({ nome: z.string().trim().min(2).max(160), tipoMaterial: z.string().trim().min(2).max(100), unidade: z.string().trim().min(1).max(30), quantidadeReferencia: z.number().positive(), valorReferencia: z.number().nonnegative(), ativo: z.boolean().default(true) });

aplicacao.post("/api/materiais", async (requisicao, resposta) => {
  const entrada = esquemaMaterial.safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Revise os dados do material.", detalhes: z.treeifyError(entrada.error) });
  const { rows } = await banco.query<{ uuid: string }>(`INSERT INTO materiais (nome,tipo_material,unidade,quantidade_referencia,valor_referencia,status)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING uuid`, [entrada.data.nome, entrada.data.tipoMaterial, entrada.data.unidade, entrada.data.quantidadeReferencia, entrada.data.valorReferencia, entrada.data.ativo ? "ativo" : "inativo"]);
  await criarNotificacao(banco, requisicao.user.usuarioUuid, "material", "Material cadastrado", `${entrada.data.nome} está disponível nas configurações.`, "materiais", rows[0]!.uuid);
  return resposta.code(201).send({ uuid: rows[0]!.uuid });
});

aplicacao.put("/api/materiais/:uuid", async (requisicao, resposta) => {
  const uuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const entrada = esquemaMaterial.safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Revise os dados do material.", detalhes: z.treeifyError(entrada.error) });
  const resultado = await banco.query(`UPDATE materiais SET nome=$1,tipo_material=$2,unidade=$3,quantidade_referencia=$4,valor_referencia=$5,status=$6,atualizado_em=now() WHERE uuid=$7`, [entrada.data.nome, entrada.data.tipoMaterial, entrada.data.unidade, entrada.data.quantidadeReferencia, entrada.data.valorReferencia, entrada.data.ativo ? "ativo" : "inativo", uuid]);
  if (!resultado.rowCount) return resposta.code(404).send({ mensagem: "Material não encontrado." });
  await criarNotificacao(banco, requisicao.user.usuarioUuid, "material", "Material atualizado", `${entrada.data.nome} teve valor ou configuração atualizados.`, "materiais", uuid);
  return resposta.code(204).send();
});

aplicacao.delete("/api/materiais/:uuid", async (requisicao, resposta) => {
  const uuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const excluido = await banco.query<{ nome: string }>("DELETE FROM materiais WHERE uuid=$1 RETURNING nome", [uuid]);
  if (!excluido.rowCount) return resposta.code(404).send({ mensagem: "Material não encontrado." });
  await criarNotificacao(banco, requisicao.user.usuarioUuid, "material", "Material removido", `${excluido.rows[0]!.nome} foi removido das configurações.`, "materiais", uuid);
  return resposta.code(204).send();
});

aplicacao.get("/api/pontos-apoio", async () => {
  const { rows } = await banco.query("SELECT uuid,nome FROM pontos_apoio WHERE status='ativo' ORDER BY nome");
  return { dados: rows };
});

aplicacao.get("/api/responsaveis-pesagem", async () => {
  const { rows } = await banco.query("SELECT uuid,nome FROM responsaveis_pesagem WHERE status='ativo' ORDER BY nome");
  return { dados: rows };
});

aplicacao.get("/api/enderecos/cep/:cep", async (requisicao, resposta) => {
  const cep = z.string().regex(/^\d{8}$/).parse((requisicao.params as { cep: string }).cep);
  const armazenado = cacheEnderecosCep.get(cep);
  if (armazenado && armazenado.expiraEm > Date.now()) return armazenado.endereco;
  try {
    const retorno = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { accept: "application/json", "user-agent": "Recicla-Belo/1.0" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!retorno.ok) return resposta.code(502).send({ mensagem: "O serviço de CEP está indisponível no momento." });
    const dados = await retorno.json() as { erro?: boolean; cep?: string; logradouro?: string; complemento?: string; bairro?: string; localidade?: string; uf?: string };
    if (dados.erro) return resposta.code(404).send({ mensagem: "CEP não encontrado." });
    const endereco: EnderecoCep = {
      cep,
      logradouro: dados.logradouro ?? "",
      complemento: dados.complemento ?? "",
      bairro: dados.bairro ?? "",
      cidade: dados.localidade ?? "",
      estado: dados.uf ?? "",
    };
    cacheEnderecosCep.set(cep, { endereco, expiraEm: Date.now() + 24 * 60 * 60 * 1_000 });
    return endereco;
  } catch {
    return resposta.code(502).send({ mensagem: "Não foi possível consultar o CEP. Preencha o endereço manualmente." });
  }
});

const esquemaDadosPesagem = z.object({
  catadorUuid: z.uuid(),
  pontoApoioUuid: z.uuid(),
  responsavelPesagemUuid: z.uuid().optional(),
  responsavelOutro: z.string().trim().min(2).max(160).optional(),
  materialUuid: z.uuid(),
  peso: z.number().positive(),
  observacao: z.string().trim().max(1000).optional(),
  dataHora: z.iso.datetime({ offset: true }),
  status: z.enum(["concluida", "agendada", "cancelada"]),
});

aplicacao.post("/api/pesagens", async (requisicao, resposta) => {
  const entrada = esquemaDadosPesagem.safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Revise os dados da pesagem.", detalhes: z.treeifyError(entrada.error) });
  if (!entrada.data.responsavelPesagemUuid && !entrada.data.responsavelOutro) return resposta.code(400).send({ mensagem: "Informe o responsável pela pesagem." });
  const cliente = await banco.connect();
  try {
    await cliente.query("BEGIN");
    const catador = await cliente.query<{ nome_completo: string }>("SELECT nome_completo FROM catadores WHERE uuid=$1 AND status='ativo' FOR SHARE", [entrada.data.catadorUuid]);
    if (!catador.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Catador não encontrado ou inativo." }); }
    const ponto = await cliente.query("SELECT 1 FROM pontos_apoio WHERE uuid=$1 AND status='ativo' FOR SHARE", [entrada.data.pontoApoioUuid]);
    if (!ponto.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Ponto de apoio não encontrado ou inativo." }); }
    if (entrada.data.responsavelPesagemUuid) {
      const responsavel = await cliente.query("SELECT 1 FROM responsaveis_pesagem WHERE uuid=$1 AND status='ativo' FOR SHARE", [entrada.data.responsavelPesagemUuid]);
      if (!responsavel.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Responsável pela pesagem não encontrado ou inativo." }); }
    }
    const material = await cliente.query<{ unidade: string; quantidade_referencia: number; valor_referencia: number }>("SELECT unidade, quantidade_referencia::float8, valor_referencia::float8 FROM materiais WHERE uuid=$1 AND status='ativo' FOR SHARE", [entrada.data.materialUuid]);
    if (!material.rows[0]) {
      await cliente.query("ROLLBACK");
      return resposta.code(404).send({ mensagem: "Material não encontrado ou inativo." });
    }
    const ref = material.rows[0];
    const valorTotal = Math.round((entrada.data.peso / ref.quantidade_referencia) * ref.valor_referencia * 100) / 100;
    await cliente.query("SELECT pg_advisory_xact_lock(hashtext('pesagens_codigo'))");
    const proximo = await cliente.query<{ codigo: string }>("SELECT 'PES-' || lpad((coalesce(max(substring(codigo from '[0-9]+')::bigint),0) + 1)::text, 6, '0') AS codigo FROM pesagens");
    const codigo = proximo.rows[0]!.codigo;
    const criada = await cliente.query<{ uuid: string }>(`INSERT INTO pesagens (codigo,catador_uuid,ponto_apoio_uuid,responsavel_pesagem_uuid,responsavel_outro,status,observacao,peso_total,valor_total,data_hora,confirmada_em,criada_por_uuid)
      VALUES ($1,$2,$3,$4,$5,$6::status_pesagem,$7,$8,$9,$10,CASE WHEN $6::status_pesagem='concluida'::status_pesagem THEN $10::timestamptz ELSE NULL END,$11) RETURNING uuid`, [codigo, entrada.data.catadorUuid, entrada.data.pontoApoioUuid, entrada.data.responsavelPesagemUuid ?? null, entrada.data.responsavelOutro ?? null, entrada.data.status, entrada.data.observacao ?? null, entrada.data.peso, valorTotal, entrada.data.dataHora, requisicao.user.usuarioUuid]);
    await cliente.query(`INSERT INTO itens_pesagem (pesagem_uuid,material_uuid,peso,unidade,quantidade_referencia,valor_referencia,observacao) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [criada.rows[0]!.uuid, entrada.data.materialUuid, entrada.data.peso, ref.unidade, ref.quantidade_referencia, ref.valor_referencia, entrada.data.observacao ?? null]);
    await registrarAuditoria(cliente, requisicao.user.usuarioUuid, "criacao", "pesagens", criada.rows[0]!.uuid, { codigo, dados: entrada.data, valorTotal }, requisicao.ip);
    await criarNotificacao(cliente, requisicao.user.usuarioUuid, "pesagem", "Pesagem registrada", `${catador.rows[0].nome_completo}: ${entrada.data.peso.toLocaleString("pt-BR")} ${ref.unidade}, total de ${valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`, "pesagens", criada.rows[0]!.uuid);
    await cliente.query("COMMIT");
    return resposta.code(201).send({ uuid: criada.rows[0]!.uuid, codigo, pesoTotal: entrada.data.peso, valorTotal, dataHora: entrada.data.dataHora, status: entrada.data.status });
  } catch (erro) { await cliente.query("ROLLBACK"); throw erro; } finally { cliente.release(); }
});

aplicacao.put("/api/pesagens/:uuid", async (requisicao, resposta) => {
  const uuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const entrada = esquemaDadosPesagem.extend({ motivoAlteracao: z.string().trim().min(3).max(500) }).safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Revise os dados e informe o motivo da alteração.", detalhes: z.treeifyError(entrada.error) });
  if (!entrada.data.responsavelPesagemUuid && !entrada.data.responsavelOutro) return resposta.code(400).send({ mensagem: "Informe o responsável pela pesagem." });
  const cliente = await banco.connect();
  try {
    await cliente.query("BEGIN");
    const atual = await cliente.query<Record<string, unknown> & { codigo: string; item_uuid: string; excluida_em: string | null }>(`SELECT p.*,ip.uuid AS item_uuid,ip.material_uuid,ip.peso AS item_peso,ip.unidade,ip.quantidade_referencia,ip.valor_referencia
      FROM pesagens p JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid WHERE p.uuid=$1 FOR UPDATE OF p,ip`, [uuid]);
    if (!atual.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Pesagem não encontrada." }); }
    if (atual.rows[0].excluida_em) { await cliente.query("ROLLBACK"); return resposta.code(409).send({ mensagem: "Uma pesagem excluída não pode ser alterada." }); }
    const catador = await cliente.query<{ nome_completo: string }>("SELECT nome_completo FROM catadores WHERE uuid=$1 AND status='ativo' FOR SHARE", [entrada.data.catadorUuid]);
    if (!catador.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Catador não encontrado ou inativo." }); }
    const ponto = await cliente.query("SELECT 1 FROM pontos_apoio WHERE uuid=$1 AND status='ativo' FOR SHARE", [entrada.data.pontoApoioUuid]);
    if (!ponto.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Ponto de apoio não encontrado ou inativo." }); }
    if (entrada.data.responsavelPesagemUuid) {
      const responsavel = await cliente.query("SELECT 1 FROM responsaveis_pesagem WHERE uuid=$1 AND status='ativo' FOR SHARE", [entrada.data.responsavelPesagemUuid]);
      if (!responsavel.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Responsável pela pesagem não encontrado ou inativo." }); }
    }
    const material = await cliente.query<{ unidade: string; quantidade_referencia: number; valor_referencia: number }>("SELECT unidade,quantidade_referencia::float8,valor_referencia::float8 FROM materiais WHERE uuid=$1 AND status='ativo' FOR SHARE", [entrada.data.materialUuid]);
    if (!material.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Material não encontrado ou inativo." }); }
    const valorTotal = Math.round((entrada.data.peso / material.rows[0].quantidade_referencia) * material.rows[0].valor_referencia * 100) / 100;
    await cliente.query(`UPDATE pesagens SET catador_uuid=$1,ponto_apoio_uuid=$2,responsavel_pesagem_uuid=$3,responsavel_outro=$4,status=$5::status_pesagem,observacao=$6,peso_total=$7,valor_total=$8,data_hora=$9,confirmada_em=CASE WHEN $5::status_pesagem='concluida'::status_pesagem THEN $9::timestamptz ELSE NULL END,atualizado_em=now() WHERE uuid=$10`, [entrada.data.catadorUuid, entrada.data.pontoApoioUuid, entrada.data.responsavelPesagemUuid ?? null, entrada.data.responsavelOutro ?? null, entrada.data.status, entrada.data.observacao ?? null, entrada.data.peso, valorTotal, entrada.data.dataHora, uuid]);
    await cliente.query(`UPDATE itens_pesagem SET material_uuid=$1,peso=$2,unidade=$3,quantidade_referencia=$4,valor_referencia=$5,observacao=$6 WHERE uuid=$7`, [entrada.data.materialUuid, entrada.data.peso, material.rows[0].unidade, material.rows[0].quantidade_referencia, material.rows[0].valor_referencia, entrada.data.observacao ?? null, atual.rows[0].item_uuid]);
    const depois = { ...entrada.data, valorTotal };
    await registrarAuditoria(cliente, requisicao.user.usuarioUuid, "alteracao", "pesagens", uuid, { motivo: entrada.data.motivoAlteracao, antes: atual.rows[0], depois }, requisicao.ip);
    await criarNotificacao(cliente, requisicao.user.usuarioUuid, "pesagem", "Pesagem alterada", `${atual.rows[0].codigo} foi corrigida. Motivo: ${entrada.data.motivoAlteracao}`, "pesagens", uuid);
    await cliente.query("COMMIT");
    return resposta.send({ uuid, codigo: atual.rows[0].codigo, pesoTotal: entrada.data.peso, valorTotal, dataHora: entrada.data.dataHora, status: entrada.data.status });
  } catch (erro) { await cliente.query("ROLLBACK"); throw erro; } finally { cliente.release(); }
});

aplicacao.delete("/api/pesagens/:uuid", async (requisicao, resposta) => {
  const uuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const entrada = z.object({ motivo: z.string().trim().min(3).max(500) }).safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Informe o motivo da exclusão." });
  const cliente = await banco.connect();
  try {
    await cliente.query("BEGIN");
    const existente = await cliente.query<Record<string, unknown> & { codigo: string; excluida_em: string | null }>("SELECT * FROM pesagens WHERE uuid=$1 FOR UPDATE", [uuid]);
    if (!existente.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Pesagem não encontrada." }); }
    if (existente.rows[0].excluida_em) { await cliente.query("ROLLBACK"); return resposta.code(409).send({ mensagem: "A pesagem já foi excluída." }); }
    await cliente.query("UPDATE pesagens SET excluida_em=now(),excluida_por_uuid=$1,motivo_exclusao=$2,atualizado_em=now() WHERE uuid=$3", [requisicao.user.usuarioUuid, entrada.data.motivo, uuid]);
    await registrarAuditoria(cliente, requisicao.user.usuarioUuid, "exclusao_logica", "pesagens", uuid, { motivo: entrada.data.motivo, registro: existente.rows[0] }, requisicao.ip);
    await criarNotificacao(cliente, requisicao.user.usuarioUuid, "pesagem", "Pesagem excluída", `${existente.rows[0].codigo} foi excluída e preservada para auditoria.`, "pesagens", uuid);
    await cliente.query("COMMIT");
    return resposta.code(204).send();
  } catch (erro) { await cliente.query("ROLLBACK"); throw erro; } finally { cliente.release(); }
});

aplicacao.get("/api/notificacoes", async (requisicao) => {
  const { rows } = await banco.query(`SELECT uuid,tipo,titulo,mensagem,entidade,entidade_uuid,lida_em,criado_em
    FROM notificacoes WHERE usuario_uuid=$1 ORDER BY criado_em DESC LIMIT 50`, [requisicao.user.usuarioUuid]);
  const contagem = await banco.query<{ total: number }>("SELECT count(*)::int AS total FROM notificacoes WHERE usuario_uuid=$1 AND lida_em IS NULL", [requisicao.user.usuarioUuid]);
  return { dados: rows, naoLidas: contagem.rows[0]?.total ?? 0 };
});

aplicacao.patch("/api/notificacoes/lidas", async (requisicao, resposta) => {
  await banco.query("UPDATE notificacoes SET lida_em=coalesce(lida_em,now()) WHERE usuario_uuid=$1", [requisicao.user.usuarioUuid]);
  return resposta.code(204).send();
});

aplicacao.patch("/api/notificacoes/:uuid/lida", async (requisicao, resposta) => {
  const uuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const resultado = await banco.query("UPDATE notificacoes SET lida_em=coalesce(lida_em,now()) WHERE uuid=$1 AND usuario_uuid=$2", [uuid, requisicao.user.usuarioUuid]);
  if (!resultado.rowCount) return resposta.code(404).send({ mensagem: "Notificação não encontrada." });
  return resposta.code(204).send();
});

aplicacao.delete("/api/notificacoes/:uuid", async (requisicao, resposta) => {
  const uuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const resultado = await banco.query("DELETE FROM notificacoes WHERE uuid=$1 AND usuario_uuid=$2", [uuid, requisicao.user.usuarioUuid]);
  if (!resultado.rowCount) return resposta.code(404).send({ mensagem: "Notificação não encontrada." });
  return resposta.code(204).send();
});

aplicacao.delete("/api/notificacoes", async (requisicao, resposta) => {
  await banco.query("DELETE FROM notificacoes WHERE usuario_uuid=$1", [requisicao.user.usuarioUuid]);
  return resposta.code(204).send();
});

aplicacao.get("/api/relatorios/pesagens", async (requisicao) => {
  const filtro = z.object({ inicio: z.iso.date().optional(), fim: z.iso.date().optional(), catadorUuid: z.uuid().optional(), limite: z.coerce.number().int().min(1).max(200).default(50) }).parse(requisicao.query);
  const { rows } = await banco.query(`SELECT p.uuid,p.codigo,p.criado_em,p.data_hora,p.atualizado_em,p.peso_total,p.valor_total,p.status,p.observacao,
      p.excluida_em,p.motivo_exclusao,p.catador_uuid,p.ponto_apoio_uuid,p.responsavel_pesagem_uuid,p.responsavel_outro,
      c.codigo AS codigo_catador,c.nome_completo AS catador,ip.material_uuid,m.nome AS material,pa.nome AS ponto_apoio,
      coalesce(rp.nome,p.responsavel_outro) AS responsavel,
      coalesce((SELECT json_agg(json_build_object('uuid',a.uuid,'acao',a.acao,'dados',a.dados,'criado_em',a.criado_em) ORDER BY a.criado_em DESC)
        FROM auditoria a WHERE a.entidade='pesagens' AND a.entidade_uuid=p.uuid), '[]'::json) AS historico
    FROM pesagens p JOIN catadores c ON c.uuid=p.catador_uuid JOIN pontos_apoio pa ON pa.uuid=p.ponto_apoio_uuid
    LEFT JOIN responsaveis_pesagem rp ON rp.uuid=p.responsavel_pesagem_uuid
    JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid JOIN materiais m ON m.uuid=ip.material_uuid
    WHERE ($1::date IS NULL OR p.data_hora >= $1::date) AND ($2::date IS NULL OR p.data_hora < $2::date + interval '1 day')
      AND ($3::uuid IS NULL OR p.catador_uuid=$3) ORDER BY p.data_hora DESC LIMIT $4`, [filtro.inicio ?? null, filtro.fim ?? null, filtro.catadorUuid ?? null, filtro.limite]);
  return { dados: rows };
});

aplicacao.setNotFoundHandler((_requisicao, resposta) => resposta.code(404).send({ mensagem: "Recurso não encontrado." }));

aplicacao.setErrorHandler((erro, requisicao, resposta) => {
  const status = (erro as { statusCode?: number }).statusCode;
  if (status === 401) return resposta.code(401).send({ mensagem: "Sessão inválida ou expirada." });
  if (status === 429) return resposta.code(429).send({ mensagem: "Muitas requisições. Aguarde alguns instantes e tente novamente." });
  if (status === 415) return resposta.code(415).send({ mensagem: "Formato de conteúdo não aceito." });
  if (erro instanceof z.ZodError) return resposta.code(400).send({ mensagem: "Parâmetros inválidos.", detalhes: z.treeifyError(erro) });
  if ((erro as { code?: string }).code === "23505") return resposta.code(409).send({ mensagem: "Já existe um registro com esses dados." });
  if ((erro as { code?: string }).code === "23503") return resposta.code(409).send({ mensagem: "O registro está em uso e não pode ser excluído." });
  if (["ECONNREFUSED", "57P01", "57P03"].includes((erro as { code?: string }).code ?? "")) {
    return resposta.code(503).send({ mensagem: "O banco de dados está indisponível. Inicie a aplicação com npm run dev." });
  }
  requisicao.log.error(erro);
  return resposta.code(500).send({ mensagem: "Não foi possível concluir a operação." });
});

async function encerrar() {
  await aplicacao.close();
  await banco.end();
}
process.on("SIGTERM", encerrar);
process.on("SIGINT", encerrar);

await banco.query("SELECT 1");
await aplicacao.listen({ port: ambiente.PORTA_API, host: "0.0.0.0" });

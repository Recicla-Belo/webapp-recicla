import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import bcrypt from "bcrypt";
import { z } from "zod";
import { banco } from "./banco/conexao.js";
import { ambiente } from "./configuracao/ambiente.js";

const aplicacao = Fastify({
  logger: { level: ambiente.AMBIENTE === "producao" ? "info" : "debug" },
  bodyLimit: ambiente.LIMITE_ARQUIVO_MB * 1024 * 1024,
  trustProxy: true,
});

await aplicacao.register(cors, {
  origin(origem, retorno) {
    if (!origem || ambiente.origensPermitidas.includes(origem)) return retorno(null, true);
    return retorno(new Error("Origem não permitida"), false);
  },
  credentials: true,
});
await aplicacao.register(jwt, { secret: ambiente.SEGREDO_JWT, sign: { expiresIn: ambiente.EXPIRACAO_SESSAO } });
await aplicacao.register(multipart, { limits: { fileSize: ambiente.LIMITE_ARQUIVO_MB * 1024 * 1024, files: 1 } });

async function exigirAutenticacao(requisicao: FastifyRequest) {
  await requisicao.jwtVerify();
}

aplicacao.get("/saude", async () => {
  await banco.query("SELECT 1");
  return { estado: "saudavel", servico: "recicla-belo-api", horario: new Date().toISOString() };
});

aplicacao.post("/api/autenticacao/entrar", async (requisicao, resposta) => {
  const entrada = z.object({ email: z.string().regex(/^[^\s@]+@[^\s@]+$/), senha: z.string().min(1) }).safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "E-mail ou senha inválidos." });
  const resultado = await banco.query<{ uuid: string; email: string; nome: string; senha_hash: string; administrador: boolean }>(
    "SELECT uuid, email, nome, senha_hash, administrador FROM usuarios WHERE email = $1 AND ativo = TRUE LIMIT 1",
    [entrada.data.email.toLowerCase()],
  );
  const usuario = resultado.rows[0];
  if (!usuario || !(await bcrypt.compare(entrada.data.senha, usuario.senha_hash))) {
    return resposta.code(401).send({ mensagem: "E-mail ou senha inválidos." });
  }
  await banco.query("UPDATE usuarios SET ultimo_acesso_em = now() WHERE uuid = $1", [usuario.uuid]);
  const token = await resposta.jwtSign({ usuarioUuid: usuario.uuid, email: usuario.email, administrador: usuario.administrador });
  return { token, usuario: { uuid: usuario.uuid, nome: usuario.nome, email: usuario.email, administrador: usuario.administrador } };
});

aplicacao.get("/api/painel", { preHandler: exigirAutenticacao }, async () => {
  const { rows } = await banco.query(`SELECT
    (SELECT count(*)::int FROM catadores WHERE status = 'ativo') AS catadores_ativos,
    coalesce(sum(p.peso_total), 0)::float8 AS total_coletado,
    coalesce(sum(p.valor_total), 0)::float8 AS valor_total_pagar,
    count(p.uuid)::int AS coletas_realizadas,
    coalesce(sum(p.peso_total) / nullif(count(DISTINCT p.catador_uuid), 0), 0)::float8 AS media_por_catador
    FROM pesagens p WHERE p.status = 'confirmada' AND date_trunc('month', p.criado_em) = date_trunc('month', now())`);
  return rows[0];
});

aplicacao.get("/api/catadores", { preHandler: exigirAutenticacao }, async (requisicao) => {
  const consulta = z.object({ busca: z.string().trim().max(120).default(""), limite: z.coerce.number().int().min(1).max(100).default(30), deslocamento: z.coerce.number().int().min(0).default(0) }).parse(requisicao.query);
  const parametros: unknown[] = [consulta.limite, consulta.deslocamento];
  let filtro = "";
  if (consulta.busca) {
    parametros.push(consulta.busca);
    filtro = `WHERE to_tsvector('portuguese', coalesce(c.nome_completo,'') || ' ' || coalesce(c.apelido,'') || ' ' || c.codigo)
      @@ websearch_to_tsquery('portuguese', $3)`;
  }
  const { rows } = await banco.query(`SELECT c.uuid, c.codigo, c.nome_completo, c.apelido, c.status,
      co.nome AS cooperativa, coalesce(json_agg(json_build_object('tipo', ct.tipo, 'valor', ct.valor)) FILTER (WHERE ct.uuid IS NOT NULL), '[]') AS contatos
    FROM catadores c LEFT JOIN cooperativas co ON co.uuid = c.cooperativa_uuid
    LEFT JOIN contatos_catador ct ON ct.catador_uuid = c.uuid ${filtro}
    GROUP BY c.uuid, co.nome ORDER BY c.nome_completo LIMIT $1 OFFSET $2`, parametros);
  return { dados: rows, limite: consulta.limite, deslocamento: consulta.deslocamento };
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
});

aplicacao.post("/api/catadores", { preHandler: exigirAutenticacao }, async (requisicao, resposta) => {
  const entrada = esquemaCatador.safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Revise os dados informados.", detalhes: z.treeifyError(entrada.error) });
  const cliente = await banco.connect();
  try {
    await cliente.query("BEGIN");
    const proximo = await cliente.query<{ codigo: string }>("SELECT 'CAT-' || lpad((count(*) + 1)::text, 4, '0') AS codigo FROM catadores");
    const { nomeCompleto, apelido, cooperativaUuid, genero, racaCor, dataNascimento, cpf, contatos, endereco } = entrada.data;
    const criado = await cliente.query<{ uuid: string; codigo: string }>(`INSERT INTO catadores (codigo, cooperativa_uuid, nome_completo, apelido, genero, raca_cor, data_nascimento, cpf)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING uuid,codigo`, [proximo.rows[0]?.codigo, cooperativaUuid ?? null, nomeCompleto, apelido ?? null, genero ?? null, racaCor ?? null, dataNascimento ?? null, cpf ?? null]);
    const catador = criado.rows[0]!;
    for (const contato of contatos) await cliente.query("INSERT INTO contatos_catador (catador_uuid,tipo,valor,principal) VALUES ($1,$2,$3,$4)", [catador.uuid, contato.tipo, contato.valor, contato.principal]);
    if (endereco) await cliente.query(`INSERT INTO enderecos_catador (catador_uuid,cep,logradouro,numero,complemento,bairro,cidade,estado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [catador.uuid, endereco.cep ?? null, endereco.logradouro ?? null, endereco.numero ?? null, endereco.complemento ?? null, endereco.bairro ?? null, endereco.cidade, endereco.estado]);
    await cliente.query("COMMIT");
    return resposta.code(201).send(catador);
  } catch (erro) {
    await cliente.query("ROLLBACK");
    throw erro;
  } finally { cliente.release(); }
});

aplicacao.post("/api/catadores/:uuid/foto", { preHandler: exigirAutenticacao }, async (requisicao, resposta) => {
  const catadorUuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const arquivo = await requisicao.file();
  if (!arquivo || !["image/jpeg", "image/png", "image/webp"].includes(arquivo.mimetype)) return resposta.code(400).send({ mensagem: "Envie uma foto JPG, PNG ou WebP." });
  const conteudo = await arquivo.toBuffer();
  const extensao = extname(arquivo.filename).toLowerCase() || ".jpg";
  const chave = `${catadorUuid}/${randomUUID()}${extensao}`;
  const destino = resolve(ambiente.PASTA_ARQUIVOS, chave);
  await mkdir(resolve(destino, ".."), { recursive: true });
  await writeFile(destino, conteudo, { flag: "wx" });
  await banco.query(`INSERT INTO arquivos_catador (catador_uuid,nome_arquivo,chave_armazenamento,tipo_mime,tamanho_bytes,hash_sha256)
    VALUES ($1,$2,$3,$4,$5,$6)`, [catadorUuid, arquivo.filename, chave, arquivo.mimetype, conteudo.length, createHash("sha256").update(conteudo).digest("hex")]);
  return resposta.code(201).send({ chave });
});

aplicacao.get("/api/materiais", { preHandler: exigirAutenticacao }, async () => {
  const { rows } = await banco.query("SELECT * FROM materiais ORDER BY status DESC, nome");
  return { dados: rows };
});

aplicacao.post("/api/pesagens", { preHandler: exigirAutenticacao }, async (requisicao, resposta) => {
  const entrada = z.object({ catadorUuid: z.uuid(), pontoApoioUuid: z.uuid(), responsavelPesagemUuid: z.uuid().optional(), responsavelOutro: z.string().min(2).max(160).optional(), materialUuid: z.uuid(), peso: z.number().positive(), observacao: z.string().max(1000).optional() }).safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Revise os dados da pesagem.", detalhes: z.treeifyError(entrada.error) });
  if (!entrada.data.responsavelPesagemUuid && !entrada.data.responsavelOutro) return resposta.code(400).send({ mensagem: "Informe o responsável pela pesagem." });
  const cliente = await banco.connect();
  try {
    await cliente.query("BEGIN");
    const material = await cliente.query<{ unidade: string; quantidade_referencia: number; valor_referencia: number }>("SELECT unidade, quantidade_referencia::float8, valor_referencia::float8 FROM materiais WHERE uuid=$1 AND status='ativo' FOR SHARE", [entrada.data.materialUuid]);
    if (!material.rows[0]) return resposta.code(404).send({ mensagem: "Material não encontrado ou inativo." });
    const ref = material.rows[0];
    const valorTotal = Math.round((entrada.data.peso / ref.quantidade_referencia) * ref.valor_referencia * 100) / 100;
    const codigo = `PES-${Date.now().toString().slice(-8)}`;
    const criada = await cliente.query<{ uuid: string }>(`INSERT INTO pesagens (codigo,catador_uuid,ponto_apoio_uuid,responsavel_pesagem_uuid,responsavel_outro,observacao,peso_total,valor_total,confirmada_em,criada_por_uuid)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9) RETURNING uuid`, [codigo, entrada.data.catadorUuid, entrada.data.pontoApoioUuid, entrada.data.responsavelPesagemUuid ?? null, entrada.data.responsavelOutro ?? null, entrada.data.observacao ?? null, entrada.data.peso, valorTotal, requisicao.user.usuarioUuid]);
    await cliente.query(`INSERT INTO itens_pesagem (pesagem_uuid,material_uuid,peso,unidade,quantidade_referencia,valor_referencia,observacao) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [criada.rows[0]!.uuid, entrada.data.materialUuid, entrada.data.peso, ref.unidade, ref.quantidade_referencia, ref.valor_referencia, entrada.data.observacao ?? null]);
    await cliente.query("COMMIT");
    return resposta.code(201).send({ uuid: criada.rows[0]!.uuid, codigo, pesoTotal: entrada.data.peso, valorTotal });
  } catch (erro) { await cliente.query("ROLLBACK"); throw erro; } finally { cliente.release(); }
});

aplicacao.get("/api/relatorios/pesagens", { preHandler: exigirAutenticacao }, async (requisicao) => {
  const filtro = z.object({ inicio: z.iso.date().optional(), fim: z.iso.date().optional(), catadorUuid: z.uuid().optional(), limite: z.coerce.number().int().min(1).max(200).default(50) }).parse(requisicao.query);
  const { rows } = await banco.query(`SELECT p.uuid,p.codigo,p.criado_em,p.peso_total,p.valor_total,p.status,p.observacao,
      c.codigo AS codigo_catador,c.nome_completo AS catador,m.nome AS material,pa.nome AS ponto_apoio,
      coalesce(rp.nome,p.responsavel_outro) AS responsavel
    FROM pesagens p JOIN catadores c ON c.uuid=p.catador_uuid JOIN pontos_apoio pa ON pa.uuid=p.ponto_apoio_uuid
    LEFT JOIN responsaveis_pesagem rp ON rp.uuid=p.responsavel_pesagem_uuid
    JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid JOIN materiais m ON m.uuid=ip.material_uuid
    WHERE ($1::date IS NULL OR p.criado_em >= $1::date) AND ($2::date IS NULL OR p.criado_em < $2::date + interval '1 day')
      AND ($3::uuid IS NULL OR p.catador_uuid=$3) ORDER BY p.criado_em DESC LIMIT $4`, [filtro.inicio ?? null, filtro.fim ?? null, filtro.catadorUuid ?? null, filtro.limite]);
  return { dados: rows };
});

aplicacao.setErrorHandler((erro, requisicao, resposta) => {
  requisicao.log.error(erro);
  if (erro instanceof z.ZodError) return resposta.code(400).send({ mensagem: "Parâmetros inválidos.", detalhes: z.treeifyError(erro) });
  if ((erro as { code?: string }).code === "23505") return resposta.code(409).send({ mensagem: "Já existe um registro com esses dados." });
  return resposta.code(500).send({ mensagem: "Não foi possível concluir a operação." });
});

async function encerrar() {
  await aplicacao.close();
  await banco.end();
}
process.on("SIGTERM", encerrar);
process.on("SIGINT", encerrar);

await aplicacao.listen({ port: ambiente.PORTA_API, host: "0.0.0.0" });

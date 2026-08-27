import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import bcrypt from "bcrypt";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
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
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
  maxAge: 600,
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

type AdministradorAtivo = { uuid: string; nome: string; email: string; administrador: boolean; versao_sessao: number };
type ExecutorSql = { query: <R extends QueryResultRow = QueryResultRow>(texto: string, valores?: unknown[]) => Promise<QueryResult<R>> };
type EnderecoCep = { cep: string; logradouro: string; complemento: string; bairro: string; cidade: string; estado: string };
const cacheEnderecosCep = new Map<string, { endereco: EnderecoCep; expiraEm: number }>();

async function buscarAdministradorAtivo(usuarioUuid: string) {
  const resultado = await banco.query<AdministradorAtivo>(
    "SELECT uuid, nome, email, administrador, versao_sessao FROM usuarios WHERE uuid = $1 AND ativo = TRUE AND administrador = TRUE LIMIT 1",
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

async function obterCaixaAberto(cliente: PoolClient, catadorUuid: string, dataHora: string, usuarioUuid: string, enderecoIp?: string) {
  const data = await cliente.query<{ data_caixa: string }>("SELECT ($1::timestamptz AT TIME ZONE 'America/Bahia')::date::text AS data_caixa", [dataHora]);
  const dataCaixa = data.rows[0]!.data_caixa;
  await cliente.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`caixa:${catadorUuid}:${dataCaixa}`]);
  let caixa = await cliente.query<{ uuid: string; status: "aberto" | "fechado"; meta_geral_ativa: boolean; meta_geral_diaria: number; unidade_meta_geral: string; valor_premio_meta_geral: number }>(
    "SELECT uuid,status,meta_geral_ativa,meta_geral_diaria::float8,unidade_meta_geral,valor_premio_meta_geral::float8 FROM caixas_catador WHERE catador_uuid=$1 AND data_caixa=$2::date FOR UPDATE",
    [catadorUuid, dataCaixa],
  );
  if (!caixa.rows[0]) {
    caixa = await cliente.query<{ uuid: string; status: "aberto" | "fechado"; meta_geral_ativa: boolean; meta_geral_diaria: number; unidade_meta_geral: string; valor_premio_meta_geral: number }>(
      `INSERT INTO caixas_catador (catador_uuid,data_caixa,aberto_por_uuid,meta_geral_ativa,meta_geral_diaria,unidade_meta_geral,valor_premio_meta_geral)
       SELECT $1,$2::date,$3,c.ativa,c.meta_diaria,c.unidade,c.valor_premio FROM configuracoes_meta_geral c WHERE c.chave='principal'
       RETURNING uuid,status,meta_geral_ativa,meta_geral_diaria::float8,unidade_meta_geral,valor_premio_meta_geral::float8`,
      [catadorUuid, dataCaixa, usuarioUuid],
    );
    const catador = await cliente.query<{ codigo: string; nome_completo: string }>("SELECT codigo,nome_completo FROM catadores WHERE uuid=$1", [catadorUuid]);
    await registrarAuditoria(cliente, usuarioUuid, "abertura", "caixas_catador", caixa.rows[0]!.uuid, {
      catadorUuid,
      codigoCatador: catador.rows[0]?.codigo,
      nomeCatador: catador.rows[0]?.nome_completo,
      dataCaixa,
      aberturaAutomatica: true,
      totais: { peso: 0, valor: 0, movimentacoes: 0 },
    }, enderecoIp);
  }
  if (caixa.rows[0]!.status === "fechado") throw Object.assign(new Error("O caixa deste catador está fechado para a data informada. Reabra-o antes de registrar ou corrigir movimentações."), { statusCode: 409 });
  return { uuid: caixa.rows[0]!.uuid, dataCaixa, metaGeralAtiva: caixa.rows[0]!.meta_geral_ativa, metaGeralDiaria: Number(caixa.rows[0]!.meta_geral_diaria), unidadeMetaGeral: caixa.rows[0]!.unidade_meta_geral, valorPremioMetaGeral: Number(caixa.rows[0]!.valor_premio_meta_geral) };
}

async function bloquearMetaDiaria(cliente: PoolClient, catadorUuid: string, materialUuid: string, dataHora: string) {
  await cliente.query(
    `SELECT pg_advisory_xact_lock(hashtextextended(
      'meta:' || $1::text || ':' || $2::text || ':' || (($3::timestamptz AT TIME ZONE 'America/Bahia')::date)::text,
      0
    ))`,
    [catadorUuid, materialUuid, dataHora],
  );
}

async function bloquearDiaCatador(cliente: PoolClient, catadorUuid: string, dataHora: string) {
  await cliente.query(
    `SELECT pg_advisory_xact_lock(hashtextextended(
      'meta-geral:' || $1::text || ':' || (($2::timestamptz AT TIME ZONE 'America/Bahia')::date)::text,
      0
    ))`,
    [catadorUuid, dataHora],
  );
}

async function consultarProgressoMeta(cliente: PoolClient, catadorUuid: string, materialUuid: string, dataHora: string, metaDiaria: number) {
  const resultado = await cliente.query<{ peso: number; ganho: number }>(`SELECT
      coalesce(sum(ip.peso) FILTER (WHERE ip.contabiliza_meta),0)::float8 AS peso,
      coalesce(sum(p.valor_total) FILTER (WHERE ip.contabiliza_meta),0)::float8 AS ganho
    FROM pesagens p JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid
    WHERE p.catador_uuid=$1 AND ip.material_uuid=$2 AND p.status='concluida' AND p.excluida_em IS NULL
      AND (p.data_hora AT TIME ZONE 'America/Bahia')::date = ($3::timestamptz AT TIME ZONE 'America/Bahia')::date`, [catadorUuid, materialUuid, dataHora]);
  const peso = Number(resultado.rows[0]?.peso ?? 0);
  const ganho = Number(resultado.rows[0]?.ganho ?? 0);
  const semMeta = metaDiaria <= 0;
  return { peso, ganho, metaDiaria, percentual: semMeta ? 100 : Math.min(Math.round((peso / metaDiaria) * 10000) / 100, 100), falta: semMeta ? 0 : Math.max(Math.round((metaDiaria - peso) * 1000) / 1000, 0), atingida: semMeta || peso >= metaDiaria, semMeta };
}

async function recalcularPagamentoMetaDiaria(cliente: PoolClient, catadorUuid: string, materialUuid: string, dataHora: string) {
  await bloquearDiaCatador(cliente, catadorUuid, dataHora);
  const configuracaoGeral = await cliente.query<{ ativa: boolean; meta: number }>(`SELECT
      coalesce(cx.meta_geral_ativa,c.ativa) AS ativa,
      coalesce(cx.meta_geral_diaria,c.meta_diaria)::float8 AS meta
    FROM configuracoes_meta_geral c
    LEFT JOIN caixas_catador cx ON cx.catador_uuid=$1
      AND cx.data_caixa=($2::timestamptz AT TIME ZONE 'America/Bahia')::date
    WHERE c.chave='principal'`, [catadorUuid, dataHora]);
  if (configuracaoGeral.rows[0]?.ativa && Number(configuracaoGeral.rows[0].meta) > 0) {
    await recalcularMetasGeraisCatador(cliente, catadorUuid);
    return;
  }
  await bloquearMetaDiaria(cliente, catadorUuid, materialUuid, dataHora);
  await cliente.query(`WITH base AS (
      SELECT p.uuid,p.data_hora,p.criado_em,ip.meta_diaria,
        sum(CASE WHEN ip.contabiliza_meta THEN ip.peso ELSE 0 END) OVER ordem AS peso_meta_acumulado,
        sum(CASE WHEN ip.contabiliza_meta THEN round((ip.peso/ip.quantidade_referencia)*ip.valor_referencia,2) ELSE 0 END) OVER ordem AS valor_meta_acumulado,
        sum(CASE WHEN NOT ip.contabiliza_meta THEN round((ip.peso/ip.quantidade_referencia)*ip.valor_referencia,2) ELSE 0 END) OVER ordem AS valor_fora_meta_acumulado
      FROM pesagens p JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid
      WHERE p.catador_uuid=$1 AND ip.material_uuid=$2 AND p.status='concluida' AND p.excluida_em IS NULL
        AND (p.data_hora AT TIME ZONE 'America/Bahia')::date=($3::timestamptz AT TIME ZONE 'America/Bahia')::date
      WINDOW ordem AS (ORDER BY p.data_hora,p.criado_em,p.uuid ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
    ), direitos AS (
      SELECT uuid,data_hora,criado_em,
        valor_fora_meta_acumulado + CASE WHEN meta_diaria<=0 OR peso_meta_acumulado>=meta_diaria THEN valor_meta_acumulado ELSE 0 END AS direito
      FROM base
    ), valores AS (
      SELECT uuid,round(direito-coalesce(lag(direito) OVER (ORDER BY data_hora,criado_em,uuid),0),2) AS valor FROM direitos
    ), atualizadas AS (
      UPDATE pesagens p SET valor_total=greatest(v.valor,0),atualizado_em=now() FROM valores v WHERE p.uuid=v.uuid RETURNING p.uuid,p.valor_total
    )
    UPDATE movimentacoes_caixa_catador mc SET valor=a.valor_total,atualizado_em=now()
    FROM atualizadas a WHERE mc.pesagem_uuid=a.uuid`, [catadorUuid, materialUuid, dataHora]);
}

type LinhaLiquidacaoMetaGeral = {
  pesagem_uuid: string;
  item_uuid: string;
  caixa_uuid: string;
  data_caixa: string;
  meta: number;
  premio: number;
  contabiliza_meta: boolean;
  guardar_excedente_meta: boolean;
  peso: number;
  quantidade_referencia: number;
  valor_referencia: number;
};

const arredondarDinheiro = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100;
const arredondarPeso = (valor: number) => Math.round((valor + Number.EPSILON) * 1000) / 1000;

async function recalcularMetasGeraisCatador(cliente: PoolClient, catadorUuid: string) {
  await cliente.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`meta-geral-catador:${catadorUuid}`]);
  const resultado = await cliente.query<LinhaLiquidacaoMetaGeral>(`SELECT
      p.uuid AS pesagem_uuid,ip.uuid AS item_uuid,cx.uuid AS caixa_uuid,cx.data_caixa::text,
      cx.meta_geral_diaria::float8 AS meta,cx.valor_premio_meta_geral::float8 AS premio,
      ip.contabiliza_meta,ip.guardar_excedente_meta,ip.peso::float8,
      ip.quantidade_referencia::float8,ip.valor_referencia::float8
    FROM pesagens p
    JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid
    JOIN caixas_catador cx ON cx.catador_uuid=p.catador_uuid
      AND cx.data_caixa=(p.data_hora AT TIME ZONE 'America/Bahia')::date
    WHERE p.catador_uuid=$1 AND p.status='concluida' AND p.excluida_em IS NULL
      AND cx.meta_geral_ativa AND cx.meta_geral_diaria>0
    ORDER BY cx.data_caixa,p.data_hora,p.criado_em,p.uuid`, [catadorUuid]);

  await cliente.query("UPDATE caixas_catador SET credito_meta_utilizado=0,atualizado_em=now() WHERE catador_uuid=$1 AND meta_geral_ativa", [catadorUuid]);
  let creditoDisponivel = 0;
  let dataAtual = "";
  let creditoGeradoNoDia = 0;
  let progresso = 0;
  let premioLiberado = false;
  let creditoConsumidoNoDia = false;

  for (const linha of resultado.rows) {
    if (linha.data_caixa !== dataAtual) {
      creditoDisponivel = arredondarPeso(creditoDisponivel + creditoGeradoNoDia);
      dataAtual = linha.data_caixa;
      creditoGeradoNoDia = 0;
      progresso = 0;
      premioLiberado = false;
      creditoConsumidoNoDia = false;
    }

    const peso = Number(linha.peso);
    const meta = Number(linha.meta);
    let pesoMetaAplicado = 0;
    let pesoExcedentePago = 0;
    let pesoExcedenteCredito = 0;
    let valorPremio = 0;
    let valorExcedente = 0;
    let valorTotal = 0;

    if (!linha.contabiliza_meta) {
      valorTotal = arredondarDinheiro((peso / Number(linha.quantidade_referencia)) * Number(linha.valor_referencia));
    } else {
      if (!creditoConsumidoNoDia) {
        const creditoUtilizado = arredondarPeso(Math.min(creditoDisponivel, meta));
        creditoDisponivel = arredondarPeso(creditoDisponivel - creditoUtilizado);
        progresso = creditoUtilizado;
        creditoConsumidoNoDia = true;
        await cliente.query("UPDATE caixas_catador SET credito_meta_utilizado=$1,atualizado_em=now() WHERE uuid=$2", [creditoUtilizado, linha.caixa_uuid]);
      }
      const restanteMeta = Math.max(meta - progresso, 0);
      pesoMetaAplicado = arredondarPeso(Math.min(peso, restanteMeta));
      progresso = arredondarPeso(progresso + pesoMetaAplicado);
      const excedente = arredondarPeso(Math.max(peso - pesoMetaAplicado, 0));
      if (!premioLiberado && progresso >= meta) {
        valorPremio = arredondarDinheiro(Number(linha.premio));
        premioLiberado = true;
      }
      if (linha.guardar_excedente_meta) {
        pesoExcedenteCredito = excedente;
        creditoGeradoNoDia = arredondarPeso(creditoGeradoNoDia + excedente);
      } else {
        pesoExcedentePago = excedente;
        valorExcedente = arredondarDinheiro((excedente / Number(linha.quantidade_referencia)) * Number(linha.valor_referencia));
      }
      valorTotal = arredondarDinheiro(valorPremio + valorExcedente);
    }

    await cliente.query(`UPDATE itens_pesagem SET
        peso_meta_aplicado=$1,peso_excedente_pago=$2,peso_excedente_credito=$3,
        valor_premio_meta=$4,valor_excedente_material=$5
      WHERE uuid=$6`, [pesoMetaAplicado, pesoExcedentePago, pesoExcedenteCredito, valorPremio, valorExcedente, linha.item_uuid]);
    await cliente.query("UPDATE pesagens SET valor_total=$1,atualizado_em=now() WHERE uuid=$2", [valorTotal, linha.pesagem_uuid]);
    await cliente.query("UPDATE movimentacoes_caixa_catador SET valor=$1,atualizado_em=now() WHERE pesagem_uuid=$2 AND ativa", [valorTotal, linha.pesagem_uuid]);
  }
}

async function consultarProgressoMetaGeral(cliente: ExecutorSql, catadorUuid: string, dataHora: string) {
  const configuracao = await cliente.query<{ ativa: boolean; meta: number; unidade: string; premio: number; credito_utilizado: number }>(`SELECT
      coalesce(cx.meta_geral_ativa,c.ativa) AS ativa,
      coalesce(cx.meta_geral_diaria,c.meta_diaria)::float8 AS meta,
      coalesce(cx.unidade_meta_geral,c.unidade) AS unidade,
      coalesce(cx.valor_premio_meta_geral,c.valor_premio)::float8 AS premio,
      coalesce(cx.credito_meta_utilizado,0)::float8 AS credito_utilizado
    FROM configuracoes_meta_geral c
    LEFT JOIN caixas_catador cx ON cx.catador_uuid=$1
      AND cx.data_caixa=($2::timestamptz AT TIME ZONE 'America/Bahia')::date
    WHERE c.chave='principal'`, [catadorUuid, dataHora]);
  const detalhes = await cliente.query<{ material_uuid: string; nome: string; unidade: string; peso: number; peso_meta: number; peso_excedente_pago: number; peso_excedente_credito: number; valor_bruto: number; valor_liberado: number; valor_premio: number }>(`SELECT
      m.uuid AS material_uuid,m.nome,ip.unidade,
      sum(ip.peso)::float8 AS peso,
      sum(ip.peso_meta_aplicado)::float8 AS peso_meta,
      sum(ip.peso_excedente_pago)::float8 AS peso_excedente_pago,
      sum(ip.peso_excedente_credito)::float8 AS peso_excedente_credito,
      sum(round((ip.peso/ip.quantidade_referencia)*ip.valor_referencia,2))::float8 AS valor_bruto,
      sum(ip.valor_excedente_material)::float8 AS valor_liberado,
      sum(ip.valor_premio_meta)::float8 AS valor_premio
    FROM pesagens p JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid JOIN materiais m ON m.uuid=ip.material_uuid
    WHERE p.catador_uuid=$1 AND p.status='concluida' AND p.excluida_em IS NULL
      AND ip.contabiliza_meta
      AND (p.data_hora AT TIME ZONE 'America/Bahia')::date=($2::timestamptz AT TIME ZONE 'America/Bahia')::date
    GROUP BY m.uuid,m.nome,ip.unidade ORDER BY m.nome`, [catadorUuid, dataHora]);
  const meta = Number(configuracao.rows[0]?.meta ?? 0);
  const ativa = Boolean(configuracao.rows[0]?.ativa && meta > 0);
  const creditoUtilizado = Number(configuracao.rows[0]?.credito_utilizado ?? 0);
  const peso = Math.min(creditoUtilizado + detalhes.rows.reduce((total, item) => total + Number(item.peso_meta), 0), meta);
  const valorBruto = detalhes.rows.reduce((total, item) => total + Number(item.valor_bruto), 0);
  const atingida = !ativa || peso >= meta;
  const valorPremioLiberado = detalhes.rows.reduce((total, item) => total + Number(item.valor_premio), 0);
  const valorExcedenteLiberado = detalhes.rows.reduce((total, item) => total + Number(item.valor_liberado), 0);
  const valorLiberado = valorPremioLiberado + valorExcedenteLiberado;
  const detalhesPagamento = detalhes.rows.map((item) => ({ ...item, valor_liberado: Number(item.valor_liberado), valor_premio: Number(item.valor_premio) }));
  const saldoCredito = await cliente.query<{ saldo: number }>(`SELECT greatest(
      coalesce((SELECT sum(ip.peso_excedente_credito) FROM pesagens p JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid
        WHERE p.catador_uuid=$1 AND p.status='concluida' AND p.excluida_em IS NULL
          AND (p.data_hora AT TIME ZONE 'America/Bahia')::date <= ($2::timestamptz AT TIME ZONE 'America/Bahia')::date),0)
      - coalesce((SELECT sum(cx.credito_meta_utilizado) FROM caixas_catador cx
        WHERE cx.catador_uuid=$1 AND cx.data_caixa <= ($2::timestamptz AT TIME ZONE 'America/Bahia')::date),0),0)::float8 AS saldo`, [catadorUuid, dataHora]);
  return {
    ativa,
    meta,
    unidade: configuracao.rows[0]?.unidade ?? "kg",
    peso,
    percentual: ativa ? Math.min(Math.round((peso / meta) * 10000) / 100, 100) : 100,
    falta: ativa ? Math.max(Math.round((meta - peso) * 1000) / 1000, 0) : 0,
    atingida,
    valorBruto,
    valorLiberado,
    valorPremio: Number(configuracao.rows[0]?.premio ?? 0),
    valorPremioLiberado,
    valorExcedenteLiberado,
    creditoUtilizado,
    saldoCredito: Number(saldoCredito.rows[0]?.saldo ?? 0),
    detalhes: detalhesPagamento,
  };
}

async function exigirAutenticacao(requisicao: FastifyRequest, resposta: FastifyReply) {
  try {
    await requisicao.jwtVerify();
  } catch {
    return resposta.code(401).send({ mensagem: "Sessão inválida ou expirada." });
  }
  const usuario = await buscarAdministradorAtivo(requisicao.user.usuarioUuid);
  if (!usuario || usuario.versao_sessao !== requisicao.user.versaoSessao) {
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
  const resultado = await banco.query<{ uuid: string; email: string; nome: string; senha_hash: string; administrador: boolean; versao_sessao: number }>(
    "SELECT uuid, email, nome, senha_hash, administrador, versao_sessao FROM usuarios WHERE email = $1 AND ativo = TRUE AND administrador = TRUE LIMIT 1",
    [entrada.data.email.toLowerCase()],
  );
  const usuario = resultado.rows[0];
  const senhaCorreta = await bcrypt.compare(entrada.data.senha, usuario?.senha_hash ?? senhaFicticiaHash);
  if (!usuario || !senhaCorreta) {
    return resposta.code(401).send({ mensagem: "E-mail ou senha inválidos." });
  }
  await banco.query("UPDATE usuarios SET ultimo_acesso_em = now() WHERE uuid = $1", [usuario.uuid]);
  const token = await resposta.jwtSign({ usuarioUuid: usuario.uuid, email: usuario.email, administrador: usuario.administrador, versaoSessao: usuario.versao_sessao });
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
  if (!usuario || usuario.versao_sessao !== requisicao.user.versaoSessao) {
    resposta.clearCookie("reciclabelo_sessao", opcoesCookieSessao);
    return { autenticado: false };
  }
  return { autenticado: true, usuario };
});

aplicacao.post("/api/autenticacao/sair", async (_requisicao, resposta) => {
  resposta.clearCookie("reciclabelo_sessao", opcoesCookieSessao);
  return resposta.code(204).send();
});

aplicacao.get("/api/administrador/perfil", async (requisicao) => {
  const usuario = await buscarAdministradorAtivo(requisicao.user.usuarioUuid);
  return { uuid: usuario!.uuid, nome: usuario!.nome, email: usuario!.email, administrador: usuario!.administrador };
});

aplicacao.patch("/api/administrador/perfil", { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } }, async (requisicao, resposta) => {
  const entrada = z.object({
    nome: z.string().trim().min(2).max(160),
    email: z.string().trim().max(254).regex(/^[^\s@]+@[^\s@]+$/).transform((valor) => valor.toLowerCase()),
    senhaAtual: z.string().min(1).max(128),
  }).safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Preencha nome, e-mail e senha atual corretamente." });
  const atual = await banco.query<{ uuid: string; nome: string; email: string; senha_hash: string; administrador: boolean; versao_sessao: number }>(
    "SELECT uuid,nome,email,senha_hash,administrador,versao_sessao FROM usuarios WHERE uuid=$1 AND ativo=TRUE AND administrador=TRUE LIMIT 1",
    [requisicao.user.usuarioUuid],
  );
  const usuario = atual.rows[0];
  if (!usuario || !(await bcrypt.compare(entrada.data.senhaAtual, usuario.senha_hash))) return resposta.code(403).send({ mensagem: "A senha atual está incorreta." });
  const atualizado = await banco.query<AdministradorAtivo>(`UPDATE usuarios SET nome=$1,email=$2,atualizado_em=now() WHERE uuid=$3
    RETURNING uuid,nome,email,administrador,versao_sessao`, [entrada.data.nome, entrada.data.email, usuario.uuid]);
  await registrarAuditoria(banco, usuario.uuid, "alteracao_perfil", "usuarios", usuario.uuid, {
    antes: { nome: usuario.nome, email: usuario.email }, depois: { nome: entrada.data.nome, email: entrada.data.email },
  }, requisicao.ip);
  await criarNotificacao(banco, usuario.uuid, "seguranca", "Dados administrativos atualizados", "O nome ou e-mail da conta administrativa foi atualizado.", "usuarios", usuario.uuid);
  const perfil = atualizado.rows[0]!;
  const token = await resposta.jwtSign({ usuarioUuid: perfil.uuid, email: perfil.email, administrador: perfil.administrador, versaoSessao: perfil.versao_sessao });
  resposta.setCookie("reciclabelo_sessao", token, opcoesCookieSessao);
  return { uuid: perfil.uuid, nome: perfil.nome, email: perfil.email, administrador: perfil.administrador };
});

aplicacao.patch("/api/administrador/senha", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (requisicao, resposta) => {
  const entrada = z.object({ senhaAtual: z.string().min(1).max(128), novaSenha: z.string().min(12).max(128) }).safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "A nova senha deve ter entre 12 e 128 caracteres." });
  const atual = await banco.query<{ uuid: string; nome: string; email: string; senha_hash: string; administrador: boolean; versao_sessao: number }>(
    "SELECT uuid,nome,email,senha_hash,administrador,versao_sessao FROM usuarios WHERE uuid=$1 AND ativo=TRUE AND administrador=TRUE LIMIT 1",
    [requisicao.user.usuarioUuid],
  );
  const usuario = atual.rows[0];
  if (!usuario || !(await bcrypt.compare(entrada.data.senhaAtual, usuario.senha_hash))) return resposta.code(403).send({ mensagem: "A senha atual está incorreta." });
  if (await bcrypt.compare(entrada.data.novaSenha, usuario.senha_hash)) return resposta.code(400).send({ mensagem: "A nova senha deve ser diferente da senha atual." });
  const senhaHash = await bcrypt.hash(entrada.data.novaSenha, 12);
  const atualizado = await banco.query<AdministradorAtivo>(`UPDATE usuarios SET senha_hash=$1,versao_sessao=versao_sessao+1,atualizado_em=now() WHERE uuid=$2
    RETURNING uuid,nome,email,administrador,versao_sessao`, [senhaHash, usuario.uuid]);
  await registrarAuditoria(banco, usuario.uuid, "alteracao_senha", "usuarios", usuario.uuid, { sessoesAnterioresRevogadas: true }, requisicao.ip);
  await criarNotificacao(banco, usuario.uuid, "seguranca", "Senha administrativa alterada", "A senha da conta administrativa foi alterada e as sessões anteriores foram revogadas.", "usuarios", usuario.uuid);
  const perfil = atualizado.rows[0]!;
  const token = await resposta.jwtSign({ usuarioUuid: perfil.uuid, email: perfil.email, administrador: perfil.administrador, versaoSessao: perfil.versao_sessao });
  resposta.setCookie("reciclabelo_sessao", token, opcoesCookieSessao);
  return { alterada: true };
});

aplicacao.get("/api/painel", async (requisicao) => {
  const paginacao = z.object({ paginaAtividades: z.coerce.number().int().min(1).default(1), limiteAtividades: z.coerce.number().int().min(5).max(20).default(5) }).parse(requisicao.query);
  const deslocamentoAtividades = (paginacao.paginaAtividades - 1) * paginacao.limiteAtividades;
  const indicadores = await banco.query(`SELECT
    (SELECT count(*)::int FROM catadores WHERE status = 'ativo') AS catadores_ativos,
    (SELECT count(DISTINCT meta.catador_uuid)::int FROM (
      SELECT p.catador_uuid FROM pesagens p JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid
      JOIN caixas_catador cx ON cx.catador_uuid=p.catador_uuid AND cx.data_caixa=(p.data_hora AT TIME ZONE 'America/Bahia')::date
      WHERE p.status='concluida' AND p.excluida_em IS NULL AND cx.meta_geral_ativa AND cx.meta_geral_diaria>0
        AND ip.contabiliza_meta
        AND (p.data_hora AT TIME ZONE 'America/Bahia')::date=(now() AT TIME ZONE 'America/Bahia')::date
      GROUP BY p.catador_uuid,cx.meta_geral_diaria,cx.credito_meta_utilizado
      HAVING cx.credito_meta_utilizado + sum(ip.peso_meta_aplicado)>=cx.meta_geral_diaria
      UNION
      SELECT p.catador_uuid FROM pesagens p JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid
      LEFT JOIN caixas_catador cx ON cx.catador_uuid=p.catador_uuid AND cx.data_caixa=(p.data_hora AT TIME ZONE 'America/Bahia')::date
      WHERE p.status='concluida' AND p.excluida_em IS NULL AND NOT coalesce(cx.meta_geral_ativa,FALSE)
        AND ip.contabiliza_meta
        AND (p.data_hora AT TIME ZONE 'America/Bahia')::date=(now() AT TIME ZONE 'America/Bahia')::date
      GROUP BY p.catador_uuid,ip.material_uuid HAVING max(ip.meta_diaria)>0 AND sum(ip.peso) >= max(ip.meta_diaria)
    ) meta) AS catadores_meta_atingida,
    coalesce(sum(p.peso_total), 0)::float8 AS total_coletado,
    coalesce(sum(p.valor_total), 0)::float8 AS valor_total_pagar,
    count(p.uuid)::int AS coletas_realizadas,
    coalesce(sum(p.peso_total) / nullif(count(DISTINCT p.catador_uuid), 0), 0)::float8 AS media_por_catador
    FROM pesagens p WHERE p.status = 'concluida' AND p.excluida_em IS NULL AND date_trunc('month', p.data_hora) = date_trunc('month', now())`);
  const producao = await banco.query(`SELECT to_char(dia,'YYYY-MM-DD') AS data, coalesce(sum(p.peso_total),0)::float8 AS peso
    FROM generate_series(current_date - interval '6 days', current_date, interval '1 day') dia
    LEFT JOIN pesagens p ON p.status='concluida' AND p.excluida_em IS NULL AND p.data_hora >= dia AND p.data_hora < dia + interval '1 day'
    GROUP BY dia ORDER BY dia`);
  const atividades = await banco.query(`SELECT a.uuid,a.acao,a.entidade,a.criado_em,a.dados,
      p.codigo,p.peso_total::float8,p.valor_total::float8,p.status,p.excluida_em,
      c.uuid AS catador_uuid,coalesce(c.codigo,a.dados->>'codigo') AS codigo_catador,
      coalesce(c.nome_completo,CASE WHEN a.acao='exclusao_definitiva' THEN 'Cadastro de catador excluído' END) AS catador,
      EXISTS(SELECT 1 FROM arquivos_catador ar WHERE ar.catador_uuid=c.uuid AND ar.tipo='foto_rosto') AS tem_foto,
      (SELECT ct.valor FROM contatos_catador ct WHERE ct.catador_uuid=c.uuid ORDER BY ct.principal DESC,ct.criado_em LIMIT 1) AS contato_catador,
      concat_ws(', ',ec.logradouro,ec.numero,ec.bairro,ec.cidade,ec.estado) AS endereco_catador,
      co_catador.nome AS cooperativa_catador,m.nome AS material,ip.meta_diaria::float8,ip.contabiliza_meta,
      co.nome AS cooperativa,pa.nome AS ponto_apoio,coalesce(rp.nome,p.responsavel_outro) AS responsavel,
      coalesce(cx.data_caixa::text,a.dados->>'data',a.dados->>'dataCaixa') AS data_caixa,
      coalesce(nullif(a.dados#>>'{totais,peso}','')::numeric,totais_caixa.peso,0)::float8 AS peso_caixa,
      coalesce(nullif(a.dados#>>'{totais,valor}','')::numeric,totais_caixa.valor,0)::float8 AS valor_caixa,
      coalesce(nullif(a.dados#>>'{totais,movimentacoes}','')::int,totais_caixa.movimentacoes,0)::int AS movimentacoes_caixa,
      coalesce(a.dados->>'motivo',cx.motivo_reabertura) AS motivo
    FROM auditoria a
    LEFT JOIN pesagens p ON a.entidade='pesagens' AND p.uuid=a.entidade_uuid
    LEFT JOIN caixas_catador cx ON a.entidade='caixas_catador' AND cx.uuid=a.entidade_uuid
    LEFT JOIN catadores c ON c.uuid=coalesce(p.catador_uuid,cx.catador_uuid,CASE WHEN a.entidade='catadores' THEN a.entidade_uuid END)
    LEFT JOIN enderecos_catador ec ON ec.catador_uuid=c.uuid
    LEFT JOIN cooperativas co_catador ON co_catador.uuid=c.cooperativa_uuid
    LEFT JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid
    LEFT JOIN materiais m ON m.uuid=ip.material_uuid
    LEFT JOIN cooperativas co ON co.uuid=p.cooperativa_uuid
    LEFT JOIN pontos_apoio pa ON pa.uuid=p.ponto_apoio_uuid
    LEFT JOIN responsaveis_pesagem rp ON rp.uuid=p.responsavel_pesagem_uuid
    LEFT JOIN LATERAL (
      SELECT coalesce(sum(mc.peso) FILTER (WHERE mc.ativa),0) AS peso,
        coalesce(sum(mc.valor) FILTER (WHERE mc.ativa),0) AS valor,
        count(mc.uuid) FILTER (WHERE mc.ativa)::int AS movimentacoes
      FROM movimentacoes_caixa_catador mc WHERE mc.caixa_uuid=cx.uuid
    ) totais_caixa ON TRUE
    WHERE a.entidade<>'caixas_catador' OR cx.uuid IS NOT NULL
    ORDER BY a.criado_em DESC LIMIT $1 OFFSET $2`, [paginacao.limiteAtividades, deslocamentoAtividades]);
  const totalAtividades = await banco.query<{ total: number }>(`SELECT count(*)::int AS total FROM auditoria a
    LEFT JOIN caixas_catador cx ON a.entidade='caixas_catador' AND cx.uuid=a.entidade_uuid
    WHERE a.entidade<>'caixas_catador' OR cx.uuid IS NOT NULL`);
  return { indicadores: indicadores.rows[0], producaoSemanal: producao.rows, atividades: atividades.rows, paginacaoAtividades: { pagina: paginacao.paginaAtividades, limite: paginacao.limiteAtividades, total: totalAtividades.rows[0]?.total ?? 0 } };
});

aplicacao.get("/api/catadores", async (requisicao) => {
  const consulta = z.object({ busca: z.string().trim().max(120).default(""), status: z.enum(["ativo", "inativo"]).optional(), limite: z.coerce.number().int().min(1).max(100).default(30), deslocamento: z.coerce.number().int().min(0).default(0) }).parse(requisicao.query);
  const { rows } = await banco.query(`SELECT c.uuid, c.codigo, c.nome_completo, c.apelido, c.genero, c.raca_cor, c.data_nascimento, c.cpf, c.status,
      co.nome AS cooperativa, coalesce(json_agg(json_build_object('tipo', ct.tipo, 'valor', ct.valor)) FILTER (WHERE ct.uuid IS NOT NULL), '[]') AS contatos
      ,(SELECT concat_ws(', ',e.logradouro,e.numero,e.bairro,e.cidade,e.estado) FROM enderecos_catador e WHERE e.catador_uuid=c.uuid) AS endereco_resumo
      ,coalesce((SELECT sum(p.peso_total) FROM pesagens p WHERE p.catador_uuid=c.uuid AND p.status='concluida' AND p.excluida_em IS NULL),0)::float8 AS total_quilos,
      EXISTS(SELECT 1 FROM arquivos_catador ar WHERE ar.catador_uuid=c.uuid AND ar.tipo='foto_rosto') AS tem_foto
      ,coalesce((SELECT sum(p.valor_total) FROM pesagens p WHERE p.catador_uuid=c.uuid AND p.status='concluida' AND p.excluida_em IS NULL),0)::float8 AS total_ganhos,
      coalesce((SELECT sum(ip.peso) FROM pesagens p JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid WHERE p.catador_uuid=c.uuid AND ip.contabiliza_meta AND p.status='concluida' AND p.excluida_em IS NULL AND (p.data_hora AT TIME ZONE 'America/Bahia')::date=(now() AT TIME ZONE 'America/Bahia')::date),0)::float8 AS peso_hoje,
      CASE WHEN coalesce(cx.meta_geral_ativa,cfg.ativa) AND coalesce(cx.meta_geral_diaria,cfg.meta_diaria)>0
        THEN coalesce(cx.meta_geral_diaria,cfg.meta_diaria)::float8
        ELSE coalesce((SELECT max(ip.meta_diaria) FROM pesagens p JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid WHERE p.catador_uuid=c.uuid AND ip.contabiliza_meta AND p.status='concluida' AND p.excluida_em IS NULL AND (p.data_hora AT TIME ZONE 'America/Bahia')::date=(now() AT TIME ZONE 'America/Bahia')::date), (SELECT min(meta_diaria) FROM materiais WHERE status='ativo' AND contabiliza_meta), 0)::float8 END AS meta_hoje,
      CASE WHEN coalesce(cx.meta_geral_ativa,cfg.ativa) AND coalesce(cx.meta_geral_diaria,cfg.meta_diaria)>0
        THEN least((coalesce(cx.credito_meta_utilizado,0)+coalesce((SELECT sum(ip.peso_meta_aplicado) FROM pesagens p JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid WHERE p.catador_uuid=c.uuid AND ip.contabiliza_meta AND p.status='concluida' AND p.excluida_em IS NULL AND (p.data_hora AT TIME ZONE 'America/Bahia')::date=(now() AT TIME ZONE 'America/Bahia')::date),0))/coalesce(cx.meta_geral_diaria,cfg.meta_diaria)*100,100)::float8
        ELSE coalesce((SELECT max(progresso) FROM (SELECT CASE WHEN max(ip.meta_diaria)<=0 THEN 100 ELSE least(sum(ip.peso)/max(ip.meta_diaria)*100,100) END::float8 AS progresso FROM pesagens p JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid WHERE p.catador_uuid=c.uuid AND ip.contabiliza_meta AND p.status='concluida' AND p.excluida_em IS NULL AND (p.data_hora AT TIME ZONE 'America/Bahia')::date=(now() AT TIME ZONE 'America/Bahia')::date GROUP BY ip.material_uuid) metas),0)::float8 END AS percentual_meta_hoje,
      coalesce(cx.status::text, 'aberto') AS status_caixa_hoje
    FROM catadores c LEFT JOIN cooperativas co ON co.uuid = c.cooperativa_uuid
    LEFT JOIN contatos_catador ct ON ct.catador_uuid = c.uuid
    CROSS JOIN configuracoes_meta_geral cfg
    LEFT JOIN caixas_catador cx ON cx.catador_uuid=c.uuid AND cx.data_caixa=(now() AT TIME ZONE 'America/Bahia')::date
    WHERE ($3='' OR to_tsvector('portuguese', coalesce(c.nome_completo,'') || ' ' || coalesce(c.apelido,'') || ' ' || c.codigo)
      @@ consulta_busca_prefixada($3))
      AND ($4::text IS NULL OR c.status::text=$4)
    GROUP BY c.uuid,co.nome,cx.uuid,cfg.uuid ORDER BY c.nome_completo LIMIT $1 OFFSET $2`, [consulta.limite, consulta.deslocamento, consulta.busca, consulta.status ?? null]);
  const total = await banco.query<{ total: number }>(`SELECT count(*)::int AS total FROM catadores c
    WHERE ($1='' OR to_tsvector('portuguese', coalesce(c.nome_completo,'') || ' ' || coalesce(c.apelido,'') || ' ' || c.codigo)
      @@ consulta_busca_prefixada($1))
      AND ($2::text IS NULL OR c.status::text=$2)`, [consulta.busca, consulta.status ?? null]);
  return { dados: rows, total: total.rows[0]?.total ?? 0, limite: consulta.limite, deslocamento: consulta.deslocamento };
});

aplicacao.get("/api/catadores/:uuid/perfil", async (requisicao, resposta) => {
  const uuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const catador = await banco.query(`SELECT c.*,co.nome AS cooperativa,
      coalesce((SELECT json_agg(json_build_object('tipo',ct.tipo,'valor',ct.valor,'principal',ct.principal) ORDER BY ct.criado_em) FROM contatos_catador ct WHERE ct.catador_uuid=c.uuid),'[]'::json) AS contatos,
      (SELECT row_to_json(e) FROM (SELECT cep,logradouro,numero,complemento,bairro,cidade,estado,referencia FROM enderecos_catador WHERE catador_uuid=c.uuid) e) AS endereco,
      coalesce((SELECT json_agg(json_build_object('tipo',cf.tipo,'tipo_chave_pix',cf.tipo_chave_pix,'chave_pix',cf.chave_pix,'banco',cf.banco,'agencia',cf.agencia,'numero_conta',cf.numero_conta,'tipo_conta',cf.tipo_conta,'de_terceiro',cf.de_terceiro,'nome_titular',cf.nome_titular,'cpf_titular',cf.cpf_titular,'relacao_titular',cf.relacao_titular)) FROM contas_financeiras_catador cf WHERE cf.catador_uuid=c.uuid AND cf.ativo),'[]'::json) AS contas_financeiras,
      EXISTS(SELECT 1 FROM arquivos_catador ar WHERE ar.catador_uuid=c.uuid AND ar.tipo='foto_rosto') AS tem_foto
    FROM catadores c LEFT JOIN cooperativas co ON co.uuid=c.cooperativa_uuid WHERE c.uuid=$1`, [uuid]);
  if (!catador.rows[0]) return resposta.code(404).send({ mensagem: "Catador não encontrado." });
  const resumo = await banco.query(`SELECT coalesce(sum(p.peso_total),0)::float8 AS peso_total,coalesce(sum(p.valor_total),0)::float8 AS ganho_total,count(p.uuid)::int AS pesagens
    FROM pesagens p WHERE p.catador_uuid=$1 AND p.status='concluida' AND p.excluida_em IS NULL`, [uuid]);
  const materiais = await banco.query(`SELECT m.uuid,m.nome,coalesce(sum(ip.peso),0)::float8 AS peso_total,
      coalesce(sum(p.valor_total),0)::float8 AS ganho_total,count(*)::int AS pesagens
    FROM pesagens p JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid JOIN materiais m ON m.uuid=ip.material_uuid
    LEFT JOIN caixas_catador cx ON cx.catador_uuid=p.catador_uuid AND cx.data_caixa=(p.data_hora AT TIME ZONE 'America/Bahia')::date
    WHERE p.catador_uuid=$1 AND p.status='concluida' AND p.excluida_em IS NULL GROUP BY m.uuid,m.nome ORDER BY ganho_total DESC`, [uuid]);
  const metas = await banco.query(`SELECT * FROM (
      SELECT (p.data_hora AT TIME ZONE 'America/Bahia')::date AS data,'Meta geral'::text AS nome,
        (cx.credito_meta_utilizado+sum(ip.peso_meta_aplicado))::float8 AS peso,cx.meta_geral_diaria::float8 AS meta,
        least(round((cx.credito_meta_utilizado+sum(ip.peso_meta_aplicado))/cx.meta_geral_diaria*100,2),100)::float8 AS percentual,
        cx.credito_meta_utilizado+sum(ip.peso_meta_aplicado)>=cx.meta_geral_diaria AS atingida,sum(p.valor_total) FILTER (WHERE ip.contabiliza_meta)::float8 AS ganho
      FROM pesagens p JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid JOIN caixas_catador cx ON cx.catador_uuid=p.catador_uuid AND cx.data_caixa=(p.data_hora AT TIME ZONE 'America/Bahia')::date
      WHERE p.catador_uuid=$1 AND ip.contabiliza_meta AND p.status='concluida' AND p.excluida_em IS NULL AND cx.meta_geral_ativa AND cx.meta_geral_diaria>0
      GROUP BY (p.data_hora AT TIME ZONE 'America/Bahia')::date,cx.meta_geral_diaria,cx.credito_meta_utilizado
      UNION ALL
      SELECT (p.data_hora AT TIME ZONE 'America/Bahia')::date AS data,m.nome,
        sum(ip.peso)::float8 AS peso,max(ip.meta_diaria)::float8 AS meta,
        CASE WHEN max(ip.meta_diaria)<=0 THEN 100 ELSE least(round(sum(ip.peso)/max(ip.meta_diaria)*100,2),100) END::float8 AS percentual,
        (max(ip.meta_diaria)<=0 OR sum(ip.peso)>=max(ip.meta_diaria)) AS atingida,sum(p.valor_total)::float8 AS ganho
      FROM pesagens p JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid JOIN materiais m ON m.uuid=ip.material_uuid
      LEFT JOIN caixas_catador cx ON cx.catador_uuid=p.catador_uuid AND cx.data_caixa=(p.data_hora AT TIME ZONE 'America/Bahia')::date
      WHERE p.catador_uuid=$1 AND ip.contabiliza_meta AND p.status='concluida' AND p.excluida_em IS NULL AND NOT coalesce(cx.meta_geral_ativa,FALSE)
      GROUP BY (p.data_hora AT TIME ZONE 'America/Bahia')::date,m.uuid,m.nome
    ) historico_metas ORDER BY data DESC,nome LIMIT 120`, [uuid]);
  const caixas = await banco.query(`SELECT cx.uuid,cx.data_caixa,cx.status,cx.aberto_em,cx.fechado_em,cx.reaberto_em,cx.motivo_reabertura,
      ua.nome AS aberto_por,uf.nome AS fechado_por,ur.nome AS reaberto_por,
      coalesce(sum(mc.peso) FILTER (WHERE mc.ativa),0)::float8 AS peso,coalesce(sum(mc.valor) FILTER (WHERE mc.ativa),0)::float8 AS valor,count(mc.uuid) FILTER (WHERE mc.ativa)::int AS movimentacoes
    FROM caixas_catador cx LEFT JOIN movimentacoes_caixa_catador mc ON mc.caixa_uuid=cx.uuid
    LEFT JOIN usuarios ua ON ua.uuid=cx.aberto_por_uuid LEFT JOIN usuarios uf ON uf.uuid=cx.fechado_por_uuid LEFT JOIN usuarios ur ON ur.uuid=cx.reaberto_por_uuid
    WHERE cx.catador_uuid=$1 GROUP BY cx.uuid,ua.nome,uf.nome,ur.nome ORDER BY cx.data_caixa DESC LIMIT 60`, [uuid]);
  const historico = await banco.query(`SELECT p.uuid,p.codigo,p.data_hora,p.status,p.peso_total::float8,p.valor_total::float8,p.excluida_em,ip.contabiliza_meta,m.nome AS material,pa.nome AS ponto_apoio,co.nome AS cooperativa,coalesce(rp.nome,p.responsavel_outro) AS responsavel
    FROM pesagens p JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid JOIN materiais m ON m.uuid=ip.material_uuid JOIN pontos_apoio pa ON pa.uuid=p.ponto_apoio_uuid LEFT JOIN cooperativas co ON co.uuid=p.cooperativa_uuid LEFT JOIN responsaveis_pesagem rp ON rp.uuid=p.responsavel_pesagem_uuid
    WHERE p.catador_uuid=$1 ORDER BY p.data_hora DESC LIMIT 100`, [uuid]);
  return { catador: catador.rows[0], resumo: resumo.rows[0], materiais: materiais.rows, metas: metas.rows, caixas: caixas.rows, historico: historico.rows };
});

const esquemaCooperativa = z.object({ nome: z.string().trim().min(2).max(160), nomeResponsavel: z.string().trim().min(2).max(160), telefone: z.string().trim().max(30).optional(), observacao: z.string().trim().max(1000).optional(), ativa: z.boolean().default(true) });

aplicacao.get("/api/cooperativas", async (requisicao) => {
  const consulta = z.object({ busca: z.string().trim().max(120).default(""), limite: z.coerce.number().int().min(1).max(100).default(100), deslocamento: z.coerce.number().int().min(0).default(0) }).parse(requisicao.query);
  const { rows } = await banco.query(`SELECT co.uuid,co.nome,co.nome_responsavel,co.telefone,co.observacao,co.status,
      count(c.uuid) FILTER (WHERE c.status='ativo')::int AS catadores_ativos
    FROM cooperativas co LEFT JOIN catadores c ON c.cooperativa_uuid=co.uuid
    WHERE ($3='' OR to_tsvector('portuguese',coalesce(co.nome,'') || ' ' || coalesce(co.nome_responsavel,'') || ' ' || coalesce(co.telefone,''))
      @@ consulta_busca_prefixada($3))
    GROUP BY co.uuid ORDER BY co.nome LIMIT $1 OFFSET $2`, [consulta.limite, consulta.deslocamento, consulta.busca]);
  const total = await banco.query<{ total: number }>(`SELECT count(*)::int AS total FROM cooperativas co
    WHERE ($1='' OR to_tsvector('portuguese',coalesce(co.nome,'') || ' ' || coalesce(co.nome_responsavel,'') || ' ' || coalesce(co.telefone,''))
      @@ consulta_busca_prefixada($1))`, [consulta.busca]);
  return { dados: rows, total: total.rows[0]?.total ?? 0, limite: consulta.limite, deslocamento: consulta.deslocamento };
});

aplicacao.post("/api/cooperativas", async (requisicao, resposta) => {
  const entrada = esquemaCooperativa.safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Revise os dados da cooperativa.", detalhes: z.treeifyError(entrada.error) });
  const { rows } = await banco.query<{ uuid: string }>(`INSERT INTO cooperativas (nome,nome_responsavel,telefone,observacao,status)
    VALUES ($1,$2,$3,$4,$5) RETURNING uuid`, [entrada.data.nome, entrada.data.nomeResponsavel, entrada.data.telefone || null, entrada.data.observacao || null, entrada.data.ativa ? "ativo" : "inativo"]);
  await registrarAuditoria(banco, requisicao.user.usuarioUuid, "criacao", "cooperativas", rows[0]!.uuid, entrada.data, requisicao.ip);
  await criarNotificacao(banco, requisicao.user.usuarioUuid, "cooperativa", "Cooperativa cadastrada", `${entrada.data.nome} foi adicionada ao sistema.`, "cooperativas", rows[0]!.uuid);
  return resposta.code(201).send({ uuid: rows[0]!.uuid });
});

aplicacao.put("/api/cooperativas/:uuid", async (requisicao, resposta) => {
  const uuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const entrada = esquemaCooperativa.safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Revise os dados da cooperativa.", detalhes: z.treeifyError(entrada.error) });
  const anterior = await banco.query("SELECT * FROM cooperativas WHERE uuid=$1", [uuid]);
  const resultado = await banco.query(`UPDATE cooperativas SET nome=$1,nome_responsavel=$2,telefone=$3,observacao=$4,status=$5,atualizado_em=now() WHERE uuid=$6`, [entrada.data.nome, entrada.data.nomeResponsavel, entrada.data.telefone || null, entrada.data.observacao || null, entrada.data.ativa ? "ativo" : "inativo", uuid]);
  if (!resultado.rowCount) return resposta.code(404).send({ mensagem: "Cooperativa não encontrada." });
  await registrarAuditoria(banco, requisicao.user.usuarioUuid, "alteracao", "cooperativas", uuid, { antes: anterior.rows[0], depois: entrada.data }, requisicao.ip);
  await criarNotificacao(banco, requisicao.user.usuarioUuid, "cooperativa", "Cooperativa atualizada", `${entrada.data.nome} teve seus dados atualizados.`, "cooperativas", uuid);
  return resposta.code(204).send();
});

aplicacao.delete("/api/cooperativas/:uuid", async (requisicao, resposta) => {
  const uuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const excluida = await banco.query<{ nome: string }>("DELETE FROM cooperativas WHERE uuid=$1 RETURNING nome", [uuid]);
  if (!excluida.rowCount) return resposta.code(404).send({ mensagem: "Cooperativa não encontrada." });
  await banco.query("DELETE FROM notificacoes WHERE usuario_uuid=$1 AND entidade='cooperativas' AND entidade_uuid=$2", [requisicao.user.usuarioUuid, uuid]);
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
  ativo: z.boolean().default(true),
});

aplicacao.post("/api/catadores", async (requisicao, resposta) => {
  const entrada = esquemaCatador.safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Revise os dados informados.", detalhes: z.treeifyError(entrada.error) });
  const cliente = await banco.connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query("SELECT pg_advisory_xact_lock(hashtext('catadores_codigo'))");
    const proximo = await cliente.query<{ codigo: string }>("SELECT 'CAT-' || lpad((coalesce(max(substring(codigo from '[0-9]+')::int),0) + 1)::text, 4, '0') AS codigo FROM catadores");
    const { nomeCompleto, apelido, cooperativaUuid, genero, racaCor, dataNascimento, cpf, contatos, endereco, contaFinanceira, ativo } = entrada.data;
    const criado = await cliente.query<{ uuid: string; codigo: string }>(`INSERT INTO catadores (codigo, cooperativa_uuid, nome_completo, apelido, genero, raca_cor, data_nascimento, cpf, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING uuid,codigo`, [proximo.rows[0]?.codigo, cooperativaUuid ?? null, nomeCompleto, apelido ?? null, genero ?? null, racaCor ?? null, dataNascimento ?? null, cpf ?? null, ativo ? "ativo" : "inativo"]);
    const catador = criado.rows[0]!;
    for (const contato of contatos) await cliente.query("INSERT INTO contatos_catador (catador_uuid,tipo,valor,principal) VALUES ($1,$2,$3,$4)", [catador.uuid, contato.tipo, contato.valor, contato.principal]);
    if (endereco) await cliente.query(`INSERT INTO enderecos_catador (catador_uuid,cep,logradouro,numero,complemento,bairro,cidade,estado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [catador.uuid, endereco.cep ?? null, endereco.logradouro ?? null, endereco.numero ?? null, endereco.complemento ?? null, endereco.bairro ?? null, endereco.cidade, endereco.estado]);
    if (contaFinanceira) await cliente.query(`INSERT INTO contas_financeiras_catador (catador_uuid,tipo,tipo_chave_pix,chave_pix,banco,agencia,numero_conta,tipo_conta,de_terceiro,nome_titular,cpf_titular,relacao_titular)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [catador.uuid, contaFinanceira.tipo, contaFinanceira.tipoChavePix ?? null, contaFinanceira.chavePix ?? null, contaFinanceira.banco ?? null, contaFinanceira.agencia ?? null, contaFinanceira.numeroConta ?? null, contaFinanceira.tipoConta ?? null, contaFinanceira.deTerceiro, contaFinanceira.nomeTitular ?? null, contaFinanceira.cpfTitular ?? null, contaFinanceira.relacaoTitular ?? null]);
    await registrarAuditoria(cliente, requisicao.user.usuarioUuid, "criacao", "catadores", catador.uuid, { codigo: catador.codigo, nomeCompleto, cooperativaUuid: cooperativaUuid ?? null }, requisicao.ip);
    await criarNotificacao(cliente, requisicao.user.usuarioUuid, "catador", "Catador cadastrado", `${nomeCompleto} foi cadastrado com o código ${catador.codigo}.`, "catadores", catador.uuid);
    await cliente.query("COMMIT");
    return resposta.code(201).send(catador);
  } catch (erro) {
    await cliente.query("ROLLBACK");
    throw erro;
  } finally { cliente.release(); }
});

aplicacao.put("/api/catadores/:uuid", async (requisicao, resposta) => {
  const uuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const entrada = esquemaCatador.safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Revise os dados informados.", detalhes: z.treeifyError(entrada.error) });
  const cliente = await banco.connect();
  try {
    await cliente.query("BEGIN");
    const anterior = await cliente.query("SELECT uuid,codigo,nome_completo,status FROM catadores WHERE uuid=$1 FOR UPDATE", [uuid]);
    if (!anterior.rows[0]) {
      await cliente.query("ROLLBACK");
      return resposta.code(404).send({ mensagem: "Catador não encontrado." });
    }
    const { nomeCompleto, apelido, cooperativaUuid, genero, racaCor, dataNascimento, cpf, contatos, endereco, contaFinanceira, ativo } = entrada.data;
    await cliente.query(`UPDATE catadores SET cooperativa_uuid=$1,nome_completo=$2,apelido=$3,genero=$4,raca_cor=$5,data_nascimento=$6,cpf=$7,status=$8,atualizado_em=now() WHERE uuid=$9`,
      [cooperativaUuid ?? null, nomeCompleto, apelido ?? null, genero ?? null, racaCor ?? null, dataNascimento ?? null, cpf ?? null, ativo ? "ativo" : "inativo", uuid]);
    await cliente.query("DELETE FROM contatos_catador WHERE catador_uuid=$1", [uuid]);
    for (const contato of contatos) await cliente.query("INSERT INTO contatos_catador (catador_uuid,tipo,valor,principal) VALUES ($1,$2,$3,$4)", [uuid, contato.tipo, contato.valor, contato.principal]);
    await cliente.query("DELETE FROM enderecos_catador WHERE catador_uuid=$1", [uuid]);
    if (endereco) await cliente.query(`INSERT INTO enderecos_catador (catador_uuid,cep,logradouro,numero,complemento,bairro,cidade,estado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [uuid, endereco.cep ?? null, endereco.logradouro ?? null, endereco.numero ?? null, endereco.complemento ?? null, endereco.bairro ?? null, endereco.cidade, endereco.estado]);
    await cliente.query("DELETE FROM contas_financeiras_catador WHERE catador_uuid=$1", [uuid]);
    if (contaFinanceira) await cliente.query(`INSERT INTO contas_financeiras_catador (catador_uuid,tipo,tipo_chave_pix,chave_pix,banco,agencia,numero_conta,tipo_conta,de_terceiro,nome_titular,cpf_titular,relacao_titular)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [uuid, contaFinanceira.tipo, contaFinanceira.tipoChavePix ?? null, contaFinanceira.chavePix ?? null, contaFinanceira.banco ?? null, contaFinanceira.agencia ?? null, contaFinanceira.numeroConta ?? null, contaFinanceira.tipoConta ?? null, contaFinanceira.deTerceiro, contaFinanceira.nomeTitular ?? null, contaFinanceira.cpfTitular ?? null, contaFinanceira.relacaoTitular ?? null]);
    const registroAnterior = anterior.rows[0] as { codigo: string; nome_completo: string };
    await registrarAuditoria(cliente, requisicao.user.usuarioUuid, "alteracao", "catadores", uuid, {
      codigo: registroAnterior.codigo,
      nomeAnterior: registroAnterior.nome_completo,
      nomeAtual: nomeCompleto,
      camposAtualizados: Object.keys(entrada.data),
    }, requisicao.ip);
    await criarNotificacao(cliente, requisicao.user.usuarioUuid, "catador", "Catador atualizado", `${nomeCompleto} teve o cadastro atualizado.`, "catadores", uuid);
    await cliente.query("COMMIT");
    return resposta.code(204).send();
  } catch (erro) {
    await cliente.query("ROLLBACK");
    throw erro;
  } finally { cliente.release(); }
});

aplicacao.patch("/api/catadores/:uuid/status", async (requisicao, resposta) => {
  const uuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const entrada = z.object({ ativo: z.boolean() }).safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Informe o novo status do catador." });
  const atualizado = await banco.query<{ codigo: string; nome_completo: string; status: string }>(`UPDATE catadores
    SET status=$1,atualizado_em=now() WHERE uuid=$2
    RETURNING codigo,nome_completo,status`, [entrada.data.ativo ? "ativo" : "inativo", uuid]);
  if (!atualizado.rows[0]) return resposta.code(404).send({ mensagem: "Catador não encontrado." });
  await registrarAuditoria(banco, requisicao.user.usuarioUuid, "alteracao_status", "catadores", uuid, {
    codigo: atualizado.rows[0].codigo,
    nome: atualizado.rows[0].nome_completo,
    status: atualizado.rows[0].status,
  }, requisicao.ip);
  await criarNotificacao(banco, requisicao.user.usuarioUuid, "catador", `Catador ${entrada.data.ativo ? "ativado" : "inativado"}`, `${atualizado.rows[0].codigo} — ${atualizado.rows[0].nome_completo} agora está ${atualizado.rows[0].status}.`, "catadores", uuid);
  return resposta.code(204).send();
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
  const confirmacao = z.object({ confirmacao: z.literal(true), motivo: z.string().trim().min(3).max(500) }).safeParse(requisicao.body);
  if (!confirmacao.success) return resposta.code(400).send({ mensagem: "Confirme a exclusão e informe o motivo." });
  const cliente = await banco.connect();
  let chavesArquivos: string[] = [];
  try {
    await cliente.query("BEGIN");
    const catador = await cliente.query<{ codigo: string; nome_completo: string }>("SELECT codigo,nome_completo FROM catadores WHERE uuid=$1 FOR UPDATE", [uuid]);
    if (!catador.rows[0]) {
      await cliente.query("ROLLBACK");
      return resposta.code(404).send({ mensagem: "Catador não encontrado." });
    }
    chavesArquivos = (await cliente.query<{ chave_armazenamento: string }>("SELECT chave_armazenamento FROM arquivos_catador WHERE catador_uuid=$1", [uuid])).rows.map((arquivo) => arquivo.chave_armazenamento);
    const totais = await cliente.query<{ pesagens: number; caixas: number; contatos: number }>(`SELECT
      (SELECT count(*)::int FROM pesagens WHERE catador_uuid=$1) AS pesagens,
      (SELECT count(*)::int FROM caixas_catador WHERE catador_uuid=$1) AS caixas,
      (SELECT count(*)::int FROM contatos_catador WHERE catador_uuid=$1) AS contatos`, [uuid]);
    await cliente.query(`DELETE FROM notificacoes n WHERE
      (n.entidade='catadores' AND n.entidade_uuid=$1) OR
      (n.entidade='pesagens' AND n.entidade_uuid IN (SELECT p.uuid FROM pesagens p WHERE p.catador_uuid=$1)) OR
      (n.entidade='caixas_catador' AND n.entidade_uuid IN (SELECT cx.uuid FROM caixas_catador cx WHERE cx.catador_uuid=$1))`, [uuid]);
    await cliente.query(`DELETE FROM auditoria a WHERE
      (a.entidade='catadores' AND a.entidade_uuid=$1) OR
      (a.entidade='pesagens' AND a.entidade_uuid IN (SELECT p.uuid FROM pesagens p WHERE p.catador_uuid=$1)) OR
      (a.entidade='caixas_catador' AND a.entidade_uuid IN (SELECT cx.uuid FROM caixas_catador cx WHERE cx.catador_uuid=$1))`, [uuid]);
    await cliente.query("DELETE FROM movimentacoes_caixa_catador WHERE caixa_uuid IN (SELECT uuid FROM caixas_catador WHERE catador_uuid=$1) OR pesagem_uuid IN (SELECT uuid FROM pesagens WHERE catador_uuid=$1)", [uuid]);
    await cliente.query("DELETE FROM pesagens WHERE catador_uuid=$1", [uuid]);
    await cliente.query("DELETE FROM caixas_catador WHERE catador_uuid=$1", [uuid]);
    await cliente.query("DELETE FROM catadores WHERE uuid=$1", [uuid]);
    await registrarAuditoria(cliente, requisicao.user.usuarioUuid, "exclusao_definitiva", "catadores", uuid, {
      codigo: catador.rows[0].codigo,
      motivo: confirmacao.data.motivo,
      registrosRemovidos: { ...totais.rows[0], arquivos: chavesArquivos.length },
    }, requisicao.ip);
    await cliente.query("COMMIT");
  } catch (erro) {
    await cliente.query("ROLLBACK");
    throw erro;
  } finally { cliente.release(); }
  const raizArquivos = resolve(ambiente.PASTA_ARQUIVOS);
  await Promise.all(chavesArquivos.map(async (chave) => {
    const caminho = resolve(raizArquivos, chave);
    const caminhoRelativo = relative(raizArquivos, caminho);
    if (caminhoRelativo.startsWith("..") || isAbsolute(caminhoRelativo)) return;
    await unlink(caminho).catch((erro) => aplicacao.log.warn({ erro, chave }, "Não foi possível remover um arquivo do catador excluído."));
  }));
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

const esquemaMaterial = z.object({ nome: z.string().trim().min(2).max(160), tipoMaterial: z.string().trim().min(2).max(100), unidade: z.string().trim().min(1).max(30), quantidadeReferencia: z.number().positive(), valorReferencia: z.number().nonnegative(), metaDiaria: z.number().nonnegative(), validoParaMeta: z.boolean().default(true), ativo: z.boolean().default(true) });

aplicacao.post("/api/materiais", async (requisicao, resposta) => {
  const entrada = esquemaMaterial.safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Revise os dados do material.", detalhes: z.treeifyError(entrada.error) });
  const { rows } = await banco.query<{ uuid: string }>(`INSERT INTO materiais (nome,tipo_material,unidade,quantidade_referencia,valor_referencia,meta_diaria,contabiliza_meta,status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING uuid`, [entrada.data.nome, entrada.data.tipoMaterial, entrada.data.unidade, entrada.data.quantidadeReferencia, entrada.data.valorReferencia, entrada.data.metaDiaria, entrada.data.validoParaMeta, entrada.data.ativo ? "ativo" : "inativo"]);
  await registrarAuditoria(banco, requisicao.user.usuarioUuid, "criacao", "materiais", rows[0]!.uuid, entrada.data, requisicao.ip);
  await criarNotificacao(banco, requisicao.user.usuarioUuid, "material", "Material cadastrado", `${entrada.data.nome} está disponível nas configurações.`, "materiais", rows[0]!.uuid);
  return resposta.code(201).send({ uuid: rows[0]!.uuid });
});

aplicacao.put("/api/materiais/:uuid", async (requisicao, resposta) => {
  const uuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const entrada = esquemaMaterial.safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Revise os dados do material.", detalhes: z.treeifyError(entrada.error) });
  const anterior = await banco.query("SELECT * FROM materiais WHERE uuid=$1", [uuid]);
  const resultado = await banco.query(`UPDATE materiais SET nome=$1,tipo_material=$2,unidade=$3,quantidade_referencia=$4,valor_referencia=$5,meta_diaria=$6,contabiliza_meta=$7,status=$8,atualizado_em=now() WHERE uuid=$9`, [entrada.data.nome, entrada.data.tipoMaterial, entrada.data.unidade, entrada.data.quantidadeReferencia, entrada.data.valorReferencia, entrada.data.metaDiaria, entrada.data.validoParaMeta, entrada.data.ativo ? "ativo" : "inativo", uuid]);
  if (!resultado.rowCount) return resposta.code(404).send({ mensagem: "Material não encontrado." });
  await registrarAuditoria(banco, requisicao.user.usuarioUuid, "alteracao", "materiais", uuid, { antes: anterior.rows[0], depois: entrada.data }, requisicao.ip);
  await criarNotificacao(banco, requisicao.user.usuarioUuid, "material", "Material atualizado", `${entrada.data.nome} teve valor ou configuração atualizados.`, "materiais", uuid);
  return resposta.code(204).send();
});

aplicacao.delete("/api/materiais/:uuid", async (requisicao, resposta) => {
  const uuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const excluido = await banco.query<{ nome: string }>("DELETE FROM materiais WHERE uuid=$1 RETURNING nome", [uuid]);
  if (!excluido.rowCount) return resposta.code(404).send({ mensagem: "Material não encontrado." });
  await banco.query("DELETE FROM notificacoes WHERE usuario_uuid=$1 AND entidade='materiais' AND entidade_uuid=$2", [requisicao.user.usuarioUuid, uuid]);
  return resposta.code(204).send();
});

aplicacao.get("/api/configuracoes/meta-geral", async () => {
  const configuracao = await banco.query(`SELECT uuid,ativa,meta_diaria::float8 AS meta_diaria,valor_premio::float8 AS valor_premio,unidade,atualizado_em
    FROM configuracoes_meta_geral WHERE chave='principal'`);
  return configuracao.rows[0];
});

aplicacao.put("/api/configuracoes/meta-geral", async (requisicao, resposta) => {
  const entrada = z.object({ ativa: z.boolean(), metaDiaria: z.number().nonnegative(), valorPremio: z.number().nonnegative(), unidade: z.string().trim().min(1).max(30).default("kg") })
    .refine((dados) => !dados.ativa || dados.metaDiaria > 0, { message: "Informe uma meta maior que zero para ativá-la.", path: ["metaDiaria"] })
    .refine((dados) => !dados.ativa || dados.valorPremio > 0, { message: "Informe o prêmio fixo para ativar a meta geral.", path: ["valorPremio"] })
    .safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Revise a configuração da meta geral.", detalhes: z.treeifyError(entrada.error) });
  const anterior = await banco.query("SELECT * FROM configuracoes_meta_geral WHERE chave='principal'");
  const atualizada = await banco.query<{ uuid: string }>(`UPDATE configuracoes_meta_geral SET ativa=$1,meta_diaria=$2,valor_premio=$3,unidade=$4,atualizado_por_uuid=$5,atualizado_em=now()
    WHERE chave='principal' RETURNING uuid`, [entrada.data.ativa, entrada.data.metaDiaria, entrada.data.valorPremio, entrada.data.unidade, requisicao.user.usuarioUuid]);
  await registrarAuditoria(banco, requisicao.user.usuarioUuid, "alteracao", "configuracoes_meta_geral", atualizada.rows[0]!.uuid, { antes: anterior.rows[0], depois: entrada.data }, requisicao.ip);
  return resposta.code(204).send();
});

aplicacao.get("/api/pontos-apoio", async () => {
  const { rows } = await banco.query("SELECT uuid,nome FROM pontos_apoio WHERE status='ativo' ORDER BY nome");
  return { dados: rows };
});

const esquemaResponsavelPesagem = z.object({ nome: z.string().trim().min(2).max(160), ativo: z.boolean().default(true) });

aplicacao.get("/api/responsaveis-pesagem", async (requisicao) => {
  const consulta = z.object({ incluirInativos: z.stringbool().default(false) }).parse(requisicao.query);
  const { rows } = await banco.query("SELECT uuid,nome,status,criado_em,atualizado_em FROM responsaveis_pesagem WHERE $1::boolean OR status='ativo' ORDER BY status DESC,nome", [consulta.incluirInativos]);
  return { dados: rows };
});

aplicacao.post("/api/responsaveis-pesagem", async (requisicao, resposta) => {
  const entrada = esquemaResponsavelPesagem.safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Revise o nome do responsável.", detalhes: z.treeifyError(entrada.error) });
  try {
    const criado = await banco.query<{ uuid: string }>("INSERT INTO responsaveis_pesagem (nome,status) VALUES ($1,$2) RETURNING uuid", [entrada.data.nome, entrada.data.ativo ? "ativo" : "inativo"]);
    await registrarAuditoria(banco, requisicao.user.usuarioUuid, "criacao", "responsaveis_pesagem", criado.rows[0]!.uuid, entrada.data, requisicao.ip);
    return resposta.code(201).send({ uuid: criado.rows[0]!.uuid });
  } catch (erro) {
    if ((erro as { code?: string }).code === "23505") return resposta.code(409).send({ mensagem: "Já existe um responsável com este nome." });
    throw erro;
  }
});

aplicacao.put("/api/responsaveis-pesagem/:uuid", async (requisicao, resposta) => {
  const uuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const entrada = esquemaResponsavelPesagem.safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Revise o nome do responsável.", detalhes: z.treeifyError(entrada.error) });
  const anterior = await banco.query("SELECT nome,status FROM responsaveis_pesagem WHERE uuid=$1", [uuid]);
  if (!anterior.rows[0]) return resposta.code(404).send({ mensagem: "Responsável não encontrado." });
  try {
    await banco.query("UPDATE responsaveis_pesagem SET nome=$1,status=$2,atualizado_em=now() WHERE uuid=$3", [entrada.data.nome, entrada.data.ativo ? "ativo" : "inativo", uuid]);
  } catch (erro) {
    if ((erro as { code?: string }).code === "23505") return resposta.code(409).send({ mensagem: "Já existe um responsável com este nome." });
    throw erro;
  }
  await registrarAuditoria(banco, requisicao.user.usuarioUuid, "alteracao", "responsaveis_pesagem", uuid, { antes: anterior.rows[0], depois: entrada.data }, requisicao.ip);
  return resposta.code(204).send();
});

aplicacao.delete("/api/responsaveis-pesagem/:uuid", async (requisicao, resposta) => {
  const uuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const cliente = await banco.connect();
  try {
    await cliente.query("BEGIN");
    const responsavel = await cliente.query<{ nome: string }>("SELECT nome FROM responsaveis_pesagem WHERE uuid=$1 FOR UPDATE", [uuid]);
    if (!responsavel.rows[0]) {
      await cliente.query("ROLLBACK");
      return resposta.code(404).send({ mensagem: "Responsável não encontrado." });
    }
    const pesagensPreservadas = await cliente.query(
      `UPDATE pesagens
       SET responsavel_outro=coalesce(nullif(responsavel_outro,''),$1),responsavel_pesagem_uuid=NULL,atualizado_em=now()
       WHERE responsavel_pesagem_uuid=$2`,
      [responsavel.rows[0].nome, uuid],
    );
    await cliente.query("DELETE FROM responsaveis_pesagem WHERE uuid=$1", [uuid]);
    await registrarAuditoria(cliente, requisicao.user.usuarioUuid, "exclusao_definitiva", "responsaveis_pesagem", uuid, {
      nome: responsavel.rows[0].nome,
      pesagensComHistoricoPreservado: pesagensPreservadas.rowCount ?? 0,
    }, requisicao.ip);
    await cliente.query("COMMIT");
    return resposta.code(204).send();
  } catch (erro) {
    await cliente.query("ROLLBACK");
    throw erro;
  } finally {
    cliente.release();
  }
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
  cooperativaUuid: z.uuid(),
  pontoApoioUuid: z.uuid(),
  responsavelPesagemUuid: z.uuid().optional(),
  responsavelOutro: z.string().trim().min(2).max(160).optional(),
  materialUuid: z.uuid(),
  contabilizarNaMeta: z.boolean().default(true),
  guardarExcedenteMeta: z.boolean().default(false),
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
    const catador = await cliente.query<{ nome_completo: string; codigo: string }>("SELECT nome_completo,codigo FROM catadores WHERE uuid=$1 AND status='ativo' FOR SHARE", [entrada.data.catadorUuid]);
    if (!catador.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Catador não encontrado ou inativo." }); }
    const ponto = await cliente.query("SELECT 1 FROM pontos_apoio WHERE uuid=$1 AND status='ativo' FOR SHARE", [entrada.data.pontoApoioUuid]);
    if (!ponto.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Ponto de apoio não encontrado ou inativo." }); }
    const cooperativa = await cliente.query<{ nome: string }>("SELECT nome FROM cooperativas WHERE uuid=$1 AND status='ativo' FOR SHARE", [entrada.data.cooperativaUuid]);
    if (!cooperativa.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Cooperativa ou associação não encontrada ou inativa." }); }
    if (entrada.data.responsavelPesagemUuid) {
      const responsavel = await cliente.query("SELECT 1 FROM responsaveis_pesagem WHERE uuid=$1 AND status='ativo' FOR SHARE", [entrada.data.responsavelPesagemUuid]);
      if (!responsavel.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Responsável pela pesagem não encontrado ou inativo." }); }
    }
    const material = await cliente.query<{ nome: string; unidade: string; quantidade_referencia: number; valor_referencia: number; meta_diaria: number; contabiliza_meta: boolean }>("SELECT nome,unidade,quantidade_referencia::float8,valor_referencia::float8,meta_diaria::float8,contabiliza_meta FROM materiais WHERE uuid=$1 AND status='ativo' FOR SHARE", [entrada.data.materialUuid]);
    if (!material.rows[0]) {
      await cliente.query("ROLLBACK");
      return resposta.code(404).send({ mensagem: "Material não encontrado ou inativo." });
    }
    const ref = material.rows[0];
    const contabilizaMeta = Boolean(ref.contabiliza_meta && entrada.data.contabilizarNaMeta);
    const guardarExcedenteMeta = Boolean(contabilizaMeta && entrada.data.guardarExcedenteMeta);
    let valorTotal = 0;
    const caixa = entrada.data.status === "concluida" ? await obterCaixaAberto(cliente, entrada.data.catadorUuid, entrada.data.dataHora, requisicao.user.usuarioUuid, requisicao.ip) : null;
    if (entrada.data.status === "concluida") {
      await bloquearDiaCatador(cliente, entrada.data.catadorUuid, entrada.data.dataHora);
      await bloquearMetaDiaria(cliente, entrada.data.catadorUuid, entrada.data.materialUuid, entrada.data.dataHora);
    }
    const progressoMaterialAntes = entrada.data.status === "concluida" ? await consultarProgressoMeta(cliente, entrada.data.catadorUuid, entrada.data.materialUuid, entrada.data.dataHora, ref.meta_diaria) : null;
    const progressoGeralAntes = entrada.data.status === "concluida" ? await consultarProgressoMetaGeral(cliente, entrada.data.catadorUuid, entrada.data.dataHora) : null;
    await cliente.query("SELECT pg_advisory_xact_lock(hashtext('pesagens_codigo'))");
    const proximo = await cliente.query<{ codigo: string }>("SELECT 'PES-' || lpad((coalesce(max(substring(codigo from '[0-9]+')::bigint),0) + 1)::text, 6, '0') AS codigo FROM pesagens");
    const codigo = proximo.rows[0]!.codigo;
    const criada = await cliente.query<{ uuid: string }>(`INSERT INTO pesagens (codigo,catador_uuid,cooperativa_uuid,ponto_apoio_uuid,responsavel_pesagem_uuid,responsavel_outro,status,observacao,peso_total,valor_total,data_hora,confirmada_em,criada_por_uuid)
      VALUES ($1,$2,$3,$4,$5,$6,$7::status_pesagem,$8,$9,$10,$11,CASE WHEN $7::status_pesagem='concluida'::status_pesagem THEN $11::timestamptz ELSE NULL END,$12) RETURNING uuid`, [codigo, entrada.data.catadorUuid, entrada.data.cooperativaUuid, entrada.data.pontoApoioUuid, entrada.data.responsavelPesagemUuid ?? null, entrada.data.responsavelOutro ?? null, entrada.data.status, entrada.data.observacao ?? null, entrada.data.peso, valorTotal, entrada.data.dataHora, requisicao.user.usuarioUuid]);
    await cliente.query(`INSERT INTO itens_pesagem (pesagem_uuid,material_uuid,peso,unidade,quantidade_referencia,valor_referencia,meta_diaria,contabiliza_meta,guardar_excedente_meta,observacao) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [criada.rows[0]!.uuid, entrada.data.materialUuid, entrada.data.peso, ref.unidade, ref.quantidade_referencia, ref.valor_referencia, ref.meta_diaria, contabilizaMeta, guardarExcedenteMeta, entrada.data.observacao ?? null]);
    if (caixa) await cliente.query(`INSERT INTO movimentacoes_caixa_catador (caixa_uuid,pesagem_uuid,peso,valor) VALUES ($1,$2,$3,$4)`, [caixa.uuid, criada.rows[0]!.uuid, entrada.data.peso, valorTotal]);
    if (entrada.data.status === "concluida") {
      await recalcularPagamentoMetaDiaria(cliente, entrada.data.catadorUuid, entrada.data.materialUuid, entrada.data.dataHora);
      const valorCalculado = await cliente.query<{ valor_total: number }>("SELECT valor_total::float8 FROM pesagens WHERE uuid=$1", [criada.rows[0]!.uuid]);
      valorTotal = Number(valorCalculado.rows[0]?.valor_total ?? 0);
    }
    await registrarAuditoria(cliente, requisicao.user.usuarioUuid, "criacao", "pesagens", criada.rows[0]!.uuid, { codigo, dados: { ...entrada.data, contabilizarNaMeta: contabilizaMeta, guardarExcedenteMeta }, valorTotal }, requisicao.ip);
    const progressoMaterial = entrada.data.status === "concluida" ? await consultarProgressoMeta(cliente, entrada.data.catadorUuid, entrada.data.materialUuid, entrada.data.dataHora, ref.meta_diaria) : null;
    const progressoMetaGeral = entrada.data.status === "concluida" ? await consultarProgressoMetaGeral(cliente, entrada.data.catadorUuid, entrada.data.dataHora) : null;
    const usaMetaGeral = Boolean(progressoMetaGeral?.ativa);
    const metaAtingidaAgora = contabilizaMeta && (usaMetaGeral
      ? Boolean(progressoMetaGeral?.atingida && !progressoGeralAntes?.atingida)
      : Boolean(progressoMaterial?.atingida && !progressoMaterialAntes?.atingida));
    const descricaoMeta = usaMetaGeral
      ? `a meta geral de ${progressoMetaGeral!.meta.toLocaleString("pt-BR")} ${progressoMetaGeral!.unidade} e tem ${progressoMetaGeral!.valorLiberado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} liberados no dia`
      : `a meta de ${ref.meta_diaria.toLocaleString("pt-BR")} ${ref.unidade} em ${ref.nome} e faturou ${progressoMaterial!.ganho.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} no dia`;
    const descricaoPagamento = !contabilizaMeta
      ? `${valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} pagos imediatamente fora da meta`
      : valorTotal > 0 ? valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "valor sujeito à meta";
    await criarNotificacao(cliente, requisicao.user.usuarioUuid, metaAtingidaAgora ? "meta" : "pesagem", metaAtingidaAgora ? "Meta diária atingida" : "Pesagem registrada", metaAtingidaAgora ? `${catador.rows[0].nome_completo} bateu ${descricaoMeta}.` : `${catador.rows[0].nome_completo}: ${entrada.data.peso.toLocaleString("pt-BR")} ${ref.unidade}, ${descricaoPagamento}.`, "pesagens", criada.rows[0]!.uuid);
    await cliente.query("COMMIT");
    return resposta.code(201).send({ uuid: criada.rows[0]!.uuid, codigo, pesoTotal: entrada.data.peso, valorTotal, contabilizaMeta, guardarExcedenteMeta, dataHora: entrada.data.dataHora, status: entrada.data.status, progressoMeta: progressoMaterial, progressoMetaGeral, metaAtingidaAgora, caixa: caixa ? { data: caixa.dataCaixa, status: "aberto" } : null });
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
    const atual = await cliente.query<Record<string, unknown> & { codigo: string; catador_uuid: string; data_hora: string; status: string; item_uuid: string; excluida_em: string | null }>(`SELECT p.*,ip.uuid AS item_uuid,ip.material_uuid,ip.peso AS item_peso,ip.unidade,ip.quantidade_referencia,ip.valor_referencia,ip.contabiliza_meta,ip.guardar_excedente_meta
      FROM pesagens p JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid WHERE p.uuid=$1 FOR UPDATE OF p,ip`, [uuid]);
    if (!atual.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Pesagem não encontrada." }); }
    if (atual.rows[0].excluida_em) { await cliente.query("ROLLBACK"); return resposta.code(409).send({ mensagem: "Uma pesagem excluída não pode ser alterada." }); }
    const catador = await cliente.query<{ nome_completo: string }>("SELECT nome_completo FROM catadores WHERE uuid=$1 AND status='ativo' FOR SHARE", [entrada.data.catadorUuid]);
    if (!catador.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Catador não encontrado ou inativo." }); }
    const ponto = await cliente.query("SELECT 1 FROM pontos_apoio WHERE uuid=$1 AND status='ativo' FOR SHARE", [entrada.data.pontoApoioUuid]);
    if (!ponto.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Ponto de apoio não encontrado ou inativo." }); }
    const cooperativa = await cliente.query("SELECT 1 FROM cooperativas WHERE uuid=$1 AND status='ativo' FOR SHARE", [entrada.data.cooperativaUuid]);
    if (!cooperativa.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Cooperativa ou associação não encontrada ou inativa." }); }
    if (entrada.data.responsavelPesagemUuid) {
      const responsavel = await cliente.query("SELECT 1 FROM responsaveis_pesagem WHERE uuid=$1 AND status='ativo' FOR SHARE", [entrada.data.responsavelPesagemUuid]);
      if (!responsavel.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Responsável pela pesagem não encontrado ou inativo." }); }
    }
    const material = await cliente.query<{ unidade: string; quantidade_referencia: number; valor_referencia: number; meta_diaria: number; contabiliza_meta: boolean }>("SELECT unidade,quantidade_referencia::float8,valor_referencia::float8,meta_diaria::float8,contabiliza_meta FROM materiais WHERE uuid=$1 AND status='ativo' FOR SHARE", [entrada.data.materialUuid]);
    if (!material.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Material não encontrado ou inativo." }); }
    const contabilizaMeta = Boolean(material.rows[0].contabiliza_meta && entrada.data.contabilizarNaMeta);
    const guardarExcedenteMeta = Boolean(contabilizaMeta && entrada.data.guardarExcedenteMeta);
    let valorTotal = 0;
    if (atual.rows[0].status === "concluida") await bloquearMetaDiaria(cliente, atual.rows[0].catador_uuid, String(atual.rows[0].material_uuid), atual.rows[0].data_hora);
    if (entrada.data.status === "concluida") await bloquearMetaDiaria(cliente, entrada.data.catadorUuid, entrada.data.materialUuid, entrada.data.dataHora);
    if (atual.rows[0].status === "concluida") await obterCaixaAberto(cliente, atual.rows[0].catador_uuid, atual.rows[0].data_hora, requisicao.user.usuarioUuid, requisicao.ip);
    const caixaDestino = entrada.data.status === "concluida" ? await obterCaixaAberto(cliente, entrada.data.catadorUuid, entrada.data.dataHora, requisicao.user.usuarioUuid, requisicao.ip) : null;
    await cliente.query(`UPDATE pesagens SET catador_uuid=$1,cooperativa_uuid=$2,ponto_apoio_uuid=$3,responsavel_pesagem_uuid=$4,responsavel_outro=$5,status=$6::status_pesagem,observacao=$7,peso_total=$8,valor_total=$9,data_hora=$10,confirmada_em=CASE WHEN $6::status_pesagem='concluida'::status_pesagem THEN $10::timestamptz ELSE NULL END,atualizado_em=now() WHERE uuid=$11`, [entrada.data.catadorUuid, entrada.data.cooperativaUuid, entrada.data.pontoApoioUuid, entrada.data.responsavelPesagemUuid ?? null, entrada.data.responsavelOutro ?? null, entrada.data.status, entrada.data.observacao ?? null, entrada.data.peso, valorTotal, entrada.data.dataHora, uuid]);
    await cliente.query(`UPDATE itens_pesagem SET material_uuid=$1,peso=$2,unidade=$3,quantidade_referencia=$4,valor_referencia=$5,meta_diaria=$6,contabiliza_meta=$7,guardar_excedente_meta=$8,observacao=$9 WHERE uuid=$10`, [entrada.data.materialUuid, entrada.data.peso, material.rows[0].unidade, material.rows[0].quantidade_referencia, material.rows[0].valor_referencia, material.rows[0].meta_diaria, contabilizaMeta, guardarExcedenteMeta, entrada.data.observacao ?? null, atual.rows[0].item_uuid]);
    if (caixaDestino) await cliente.query(`INSERT INTO movimentacoes_caixa_catador (caixa_uuid,pesagem_uuid,peso,valor,ativa) VALUES ($1,$2,$3,$4,TRUE)
      ON CONFLICT (pesagem_uuid) DO UPDATE SET caixa_uuid=EXCLUDED.caixa_uuid,peso=EXCLUDED.peso,valor=EXCLUDED.valor,ativa=TRUE,atualizado_em=now()`, [caixaDestino.uuid, uuid, entrada.data.peso, valorTotal]);
    else await cliente.query("UPDATE movimentacoes_caixa_catador SET ativa=FALSE,atualizado_em=now() WHERE pesagem_uuid=$1", [uuid]);
    if (atual.rows[0].status === "concluida") await recalcularPagamentoMetaDiaria(cliente, atual.rows[0].catador_uuid, String(atual.rows[0].material_uuid), atual.rows[0].data_hora);
    if (entrada.data.status === "concluida") await recalcularPagamentoMetaDiaria(cliente, entrada.data.catadorUuid, entrada.data.materialUuid, entrada.data.dataHora);
    const valorCalculado = await cliente.query<{ valor_total: number }>("SELECT valor_total::float8 FROM pesagens WHERE uuid=$1", [uuid]);
    valorTotal = Number(valorCalculado.rows[0]?.valor_total ?? 0);
    const depois = { ...entrada.data, contabilizarNaMeta: contabilizaMeta, guardarExcedenteMeta, valorTotal };
    await registrarAuditoria(cliente, requisicao.user.usuarioUuid, "alteracao", "pesagens", uuid, { motivo: entrada.data.motivoAlteracao, antes: atual.rows[0], depois }, requisicao.ip);
    await criarNotificacao(cliente, requisicao.user.usuarioUuid, "pesagem", "Pesagem alterada", `${atual.rows[0].codigo} foi corrigida. Motivo: ${entrada.data.motivoAlteracao}`, "pesagens", uuid);
    await cliente.query("COMMIT");
    return resposta.send({ uuid, codigo: atual.rows[0].codigo, pesoTotal: entrada.data.peso, valorTotal, contabilizaMeta, dataHora: entrada.data.dataHora, status: entrada.data.status });
  } catch (erro) { await cliente.query("ROLLBACK"); throw erro; } finally { cliente.release(); }
});

aplicacao.delete("/api/pesagens/:uuid", async (requisicao, resposta) => {
  const uuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const entrada = z.object({ motivo: z.string().trim().min(3).max(500) }).safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Informe o motivo da exclusão." });
  const cliente = await banco.connect();
  try {
    await cliente.query("BEGIN");
    const existente = await cliente.query<Record<string, unknown> & { codigo: string; catador_uuid: string; material_uuid: string; data_hora: string; status: string; excluida_em: string | null }>("SELECT p.*,ip.material_uuid FROM pesagens p JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid WHERE p.uuid=$1 FOR UPDATE OF p", [uuid]);
    if (!existente.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Pesagem não encontrada." }); }
    if (existente.rows[0].excluida_em) { await cliente.query("ROLLBACK"); return resposta.code(409).send({ mensagem: "A pesagem já foi excluída." }); }
    if (existente.rows[0].status === "concluida") {
      await obterCaixaAberto(cliente, existente.rows[0].catador_uuid, existente.rows[0].data_hora, requisicao.user.usuarioUuid, requisicao.ip);
      await bloquearMetaDiaria(cliente, existente.rows[0].catador_uuid, existente.rows[0].material_uuid, existente.rows[0].data_hora);
    }
    await cliente.query("UPDATE pesagens SET excluida_em=now(),excluida_por_uuid=$1,motivo_exclusao=$2,atualizado_em=now() WHERE uuid=$3", [requisicao.user.usuarioUuid, entrada.data.motivo, uuid]);
    await cliente.query("UPDATE movimentacoes_caixa_catador SET ativa=FALSE,atualizado_em=now() WHERE pesagem_uuid=$1", [uuid]);
    if (existente.rows[0].status === "concluida") await recalcularPagamentoMetaDiaria(cliente, existente.rows[0].catador_uuid, existente.rows[0].material_uuid, existente.rows[0].data_hora);
    await registrarAuditoria(cliente, requisicao.user.usuarioUuid, "exclusao_logica", "pesagens", uuid, { motivo: entrada.data.motivo, registro: existente.rows[0] }, requisicao.ip);
    await criarNotificacao(cliente, requisicao.user.usuarioUuid, "pesagem", "Pesagem excluída", `${existente.rows[0].codigo} foi excluída e preservada para auditoria.`, "pesagens", uuid);
    await cliente.query("COMMIT");
    return resposta.code(204).send();
  } catch (erro) { await cliente.query("ROLLBACK"); throw erro; } finally { cliente.release(); }
});

aplicacao.get("/api/catadores/:uuid/metas", async (requisicao) => {
  const catadorUuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const consulta = z.object({ data: z.iso.date().default(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date())) }).parse(requisicao.query);
  const metas = await banco.query(`SELECT m.uuid AS material_uuid,m.nome,m.unidade,m.meta_diaria::float8 AS meta,
      coalesce(sum(ip.peso) FILTER (WHERE p.uuid IS NOT NULL AND ip.contabiliza_meta),0)::float8 AS peso,coalesce(sum(p.valor_total) FILTER (WHERE p.uuid IS NOT NULL AND ip.contabiliza_meta),0)::float8 AS ganho,
      CASE WHEN m.meta_diaria<=0 THEN 100 ELSE least(round(coalesce(sum(ip.peso) FILTER (WHERE p.uuid IS NOT NULL AND ip.contabiliza_meta),0)/m.meta_diaria*100,2),100) END::float8 AS percentual,
      CASE WHEN m.meta_diaria<=0 THEN 0 ELSE greatest(m.meta_diaria-coalesce(sum(ip.peso) FILTER (WHERE p.uuid IS NOT NULL AND ip.contabiliza_meta),0),0) END::float8 AS falta,
      (m.meta_diaria<=0 OR coalesce(sum(ip.peso) FILTER (WHERE p.uuid IS NOT NULL AND ip.contabiliza_meta),0)>=m.meta_diaria) AS atingida,
      (m.meta_diaria<=0) AS sem_meta
    FROM materiais m
    LEFT JOIN itens_pesagem ip ON ip.material_uuid=m.uuid
    LEFT JOIN pesagens p ON p.uuid=ip.pesagem_uuid AND p.catador_uuid=$1 AND p.status='concluida' AND p.excluida_em IS NULL
      AND (p.data_hora AT TIME ZONE 'America/Bahia')::date=$2::date
    WHERE m.status='ativo' AND m.contabiliza_meta GROUP BY m.uuid ORDER BY m.nome`, [catadorUuid, consulta.data]);
  const caixa = await banco.query(`SELECT cx.uuid,cx.status,cx.data_caixa,cx.fechado_em,cx.reaberto_em,
      coalesce(sum(mc.peso) FILTER (WHERE mc.ativa),0)::float8 AS peso,coalesce(sum(mc.valor) FILTER (WHERE mc.ativa),0)::float8 AS valor
    FROM caixas_catador cx LEFT JOIN movimentacoes_caixa_catador mc ON mc.caixa_uuid=cx.uuid
    WHERE cx.catador_uuid=$1 AND cx.data_caixa=$2::date GROUP BY cx.uuid`, [catadorUuid, consulta.data]);
  const referenciaData = `${consulta.data}T12:00:00-03:00`;
  const metaGeral = await consultarProgressoMetaGeral(banco, catadorUuid, referenciaData);
  return { data: consulta.data, metas: metas.rows, metaGeral, caixa: caixa.rows[0] ?? { status: "aberto", data_caixa: consulta.data, peso: 0, valor: 0 } };
});

aplicacao.post("/api/catadores/:uuid/caixa/fechar", async (requisicao, resposta) => {
  const catadorUuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const entrada = z.object({ data: z.iso.date() }).safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Informe a data do caixa." });
  const cliente = await banco.connect();
  try {
    await cliente.query("BEGIN");
    const catador = await cliente.query<{ nome_completo: string; codigo: string }>("SELECT nome_completo,codigo FROM catadores WHERE uuid=$1 FOR SHARE", [catadorUuid]);
    if (!catador.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Catador não encontrado." }); }
    await cliente.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`caixa:${catadorUuid}:${entrada.data.data}`]);
    let caixa = await cliente.query<{ uuid: string; status: string }>("SELECT uuid,status FROM caixas_catador WHERE catador_uuid=$1 AND data_caixa=$2::date FOR UPDATE", [catadorUuid, entrada.data.data]);
    if (!caixa.rows[0]) {
      caixa = await cliente.query<{ uuid: string; status: string }>(`INSERT INTO caixas_catador (catador_uuid,data_caixa,aberto_por_uuid,meta_geral_ativa,meta_geral_diaria,unidade_meta_geral,valor_premio_meta_geral)
        SELECT $1,$2::date,$3,c.ativa,c.meta_diaria,c.unidade,c.valor_premio FROM configuracoes_meta_geral c WHERE c.chave='principal'
        RETURNING uuid,status`, [catadorUuid, entrada.data.data, requisicao.user.usuarioUuid]);
      await registrarAuditoria(cliente, requisicao.user.usuarioUuid, "abertura", "caixas_catador", caixa.rows[0]!.uuid, {
        catadorUuid, codigoCatador: catador.rows[0].codigo, nomeCatador: catador.rows[0].nome_completo,
        dataCaixa: entrada.data.data, aberturaAutomatica: false, totais: { peso: 0, valor: 0, movimentacoes: 0 },
      }, requisicao.ip);
    }
    if (caixa.rows[0]!.status === "fechado") { await cliente.query("ROLLBACK"); return resposta.code(409).send({ mensagem: "Este caixa já está fechado." }); }
    const totais = await cliente.query<{ peso: number; valor: number; movimentacoes: number }>(`SELECT coalesce(sum(peso) FILTER (WHERE ativa),0)::float8 AS peso,coalesce(sum(valor) FILTER (WHERE ativa),0)::float8 AS valor,count(*) FILTER (WHERE ativa)::int AS movimentacoes FROM movimentacoes_caixa_catador WHERE caixa_uuid=$1`, [caixa.rows[0]!.uuid]);
    await cliente.query("UPDATE caixas_catador SET status='fechado',fechado_por_uuid=$1,fechado_em=now(),atualizado_em=now() WHERE uuid=$2", [requisicao.user.usuarioUuid, caixa.rows[0]!.uuid]);
    await registrarAuditoria(cliente, requisicao.user.usuarioUuid, "fechamento", "caixas_catador", caixa.rows[0]!.uuid, { catadorUuid, codigoCatador: catador.rows[0]!.codigo, nomeCatador: catador.rows[0]!.nome_completo, data: entrada.data.data, totais: totais.rows[0] }, requisicao.ip);
    await criarNotificacao(cliente, requisicao.user.usuarioUuid, "caixa", "Caixa individual fechado", `${catador.rows[0]!.codigo} — ${catador.rows[0]!.nome_completo}: caixa de ${entrada.data.data} fechado em ${Number(totais.rows[0]?.valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`, "caixas_catador", caixa.rows[0]!.uuid);
    await cliente.query("COMMIT");
    return { uuid: caixa.rows[0]!.uuid, status: "fechado", totais: totais.rows[0] };
  } catch (erro) { await cliente.query("ROLLBACK"); throw erro; } finally { cliente.release(); }
});

aplicacao.post("/api/catadores/:uuid/caixa/reabrir", async (requisicao, resposta) => {
  const catadorUuid = z.uuid().parse((requisicao.params as { uuid: string }).uuid);
  const entrada = z.object({ data: z.iso.date(), motivo: z.string().trim().min(3).max(500) }).safeParse(requisicao.body);
  if (!entrada.success) return resposta.code(400).send({ mensagem: "Informe a data e o motivo da reabertura." });
  const cliente = await banco.connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`caixa:${catadorUuid}:${entrada.data.data}`]);
    const caixa = await cliente.query<{ uuid: string; status: string }>("SELECT uuid,status FROM caixas_catador WHERE catador_uuid=$1 AND data_caixa=$2::date FOR UPDATE", [catadorUuid, entrada.data.data]);
    if (!caixa.rows[0]) { await cliente.query("ROLLBACK"); return resposta.code(404).send({ mensagem: "Caixa não encontrado para esta data." }); }
    if (caixa.rows[0].status === "aberto") { await cliente.query("ROLLBACK"); return resposta.code(409).send({ mensagem: "Este caixa já está aberto." }); }
    const catador = await cliente.query<{ nome_completo: string; codigo: string }>("SELECT nome_completo,codigo FROM catadores WHERE uuid=$1 FOR SHARE", [catadorUuid]);
    const totais = await cliente.query<{ peso: number; valor: number; movimentacoes: number }>(`SELECT coalesce(sum(peso) FILTER (WHERE ativa),0)::float8 AS peso,coalesce(sum(valor) FILTER (WHERE ativa),0)::float8 AS valor,count(*) FILTER (WHERE ativa)::int AS movimentacoes FROM movimentacoes_caixa_catador WHERE caixa_uuid=$1`, [caixa.rows[0].uuid]);
    await cliente.query("UPDATE caixas_catador SET status='aberto',reaberto_por_uuid=$1,reaberto_em=now(),motivo_reabertura=$2,atualizado_em=now() WHERE uuid=$3", [requisicao.user.usuarioUuid, entrada.data.motivo, caixa.rows[0].uuid]);
    await registrarAuditoria(cliente, requisicao.user.usuarioUuid, "reabertura", "caixas_catador", caixa.rows[0].uuid, { catadorUuid, codigoCatador: catador.rows[0]?.codigo, nomeCatador: catador.rows[0]?.nome_completo, data: entrada.data.data, motivo: entrada.data.motivo, totais: totais.rows[0] }, requisicao.ip);
    await criarNotificacao(cliente, requisicao.user.usuarioUuid, "caixa", "Caixa individual reaberto", `${catador.rows[0]?.codigo} — ${catador.rows[0]?.nome_completo}: caixa reaberto. Motivo: ${entrada.data.motivo}`, "caixas_catador", caixa.rows[0].uuid);
    await cliente.query("COMMIT");
    return { uuid: caixa.rows[0].uuid, status: "aberto" };
  } catch (erro) { await cliente.query("ROLLBACK"); throw erro; } finally { cliente.release(); }
});

aplicacao.get("/api/notificacoes", async (requisicao) => {
  const consulta = z.object({
    limite: z.coerce.number().int().min(5).max(30).default(10),
    cursorData: z.iso.datetime({ offset: true }).optional(),
    cursorUuid: z.uuid().optional(),
  }).refine((dados) => Boolean(dados.cursorData) === Boolean(dados.cursorUuid), { message: "Informe o cursor completo." }).parse(requisicao.query);
  const notificacaoValida = `CASE n.entidade
      WHEN 'catadores' THEN EXISTS (SELECT 1 FROM catadores c WHERE c.uuid=n.entidade_uuid)
      WHEN 'cooperativas' THEN EXISTS (SELECT 1 FROM cooperativas co WHERE co.uuid=n.entidade_uuid)
      WHEN 'materiais' THEN EXISTS (SELECT 1 FROM materiais m WHERE m.uuid=n.entidade_uuid)
      WHEN 'pesagens' THEN EXISTS (SELECT 1 FROM pesagens p WHERE p.uuid=n.entidade_uuid)
      WHEN 'caixas_catador' THEN EXISTS (SELECT 1 FROM caixas_catador cx WHERE cx.uuid=n.entidade_uuid)
      ELSE TRUE END`;
  const resultado = await banco.query(`SELECT n.uuid,n.tipo,n.titulo,n.mensagem,n.entidade,n.entidade_uuid,n.lida_em,n.criado_em
    FROM notificacoes n WHERE n.usuario_uuid=$1 AND ${notificacaoValida}
      AND ($2::timestamptz IS NULL OR (n.criado_em,n.uuid)<($2::timestamptz,$3::uuid))
    ORDER BY n.criado_em DESC,n.uuid DESC LIMIT $4`, [requisicao.user.usuarioUuid, consulta.cursorData ?? null, consulta.cursorUuid ?? null, consulta.limite + 1]);
  const temMais = resultado.rows.length > consulta.limite;
  const dados = temMais ? resultado.rows.slice(0, consulta.limite) : resultado.rows;
  const ultimo = dados.at(-1) as { uuid?: string; criado_em?: string | Date } | undefined;
  const contagem = await banco.query<{ total: number; nao_lidas: number }>(`SELECT count(*)::int AS total,count(*) FILTER (WHERE n.lida_em IS NULL)::int AS nao_lidas
    FROM notificacoes n WHERE n.usuario_uuid=$1 AND ${notificacaoValida}`, [requisicao.user.usuarioUuid]);
  return {
    dados,
    total: contagem.rows[0]?.total ?? 0,
    naoLidas: contagem.rows[0]?.nao_lidas ?? 0,
    proximoCursor: temMais && ultimo?.uuid && ultimo.criado_em ? { criadoEm: new Date(ultimo.criado_em).toISOString(), uuid: ultimo.uuid } : null,
  };
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
  const filtro = z.object({ inicio: z.iso.date().optional(), fim: z.iso.date().optional(), catadorUuid: z.uuid().optional(), busca: z.string().trim().max(120).default(""), limite: z.coerce.number().int().min(5).max(50).default(10), deslocamento: z.coerce.number().int().min(0).default(0) }).parse(requisicao.query);
  const parametros = [filtro.inicio ?? null, filtro.fim ?? null, filtro.catadorUuid ?? null, filtro.busca, filtro.limite, filtro.deslocamento];
  const { rows } = await banco.query(`SELECT p.uuid,p.codigo,p.criado_em,p.data_hora,p.atualizado_em,p.peso_total,p.valor_total,p.status,p.observacao,
      p.excluida_em,p.motivo_exclusao,p.catador_uuid,p.cooperativa_uuid,p.ponto_apoio_uuid,p.responsavel_pesagem_uuid,p.responsavel_outro,
      c.codigo AS codigo_catador,c.nome_completo AS catador,ip.material_uuid,m.nome AS material,ip.contabiliza_meta,ip.guardar_excedente_meta,
      ip.peso_meta_aplicado::float8,ip.peso_excedente_pago::float8,ip.peso_excedente_credito::float8,
      ip.valor_premio_meta::float8,ip.valor_excedente_material::float8,
      CASE WHEN NOT ip.contabiliza_meta THEN 0 WHEN cx.meta_geral_ativa AND cx.meta_geral_diaria>0 THEN cx.meta_geral_diaria ELSE ip.meta_diaria END::float8 AS meta_diaria,
      CASE WHEN NOT ip.contabiliza_meta THEN 'fora_meta' WHEN cx.meta_geral_ativa AND cx.meta_geral_diaria>0 THEN 'geral' ELSE 'material' END AS tipo_meta,
      round((ip.peso/ip.quantidade_referencia)*ip.valor_referencia,2)::float8 AS valor_bruto,pa.nome AS ponto_apoio,co.nome AS cooperativa,
      cx.status::text AS status_caixa,
      CASE WHEN NOT ip.contabiliza_meta THEN 100
      WHEN cx.meta_geral_ativa AND cx.meta_geral_diaria>0 THEN
        least(round((cx.credito_meta_utilizado + (SELECT coalesce(sum(ip2.peso_meta_aplicado),0) FROM pesagens p2 JOIN itens_pesagem ip2 ON ip2.pesagem_uuid=p2.uuid WHERE p2.catador_uuid=p.catador_uuid AND ip2.contabiliza_meta AND p2.status='concluida' AND p2.excluida_em IS NULL AND (p2.data_hora AT TIME ZONE 'America/Bahia')::date=(p.data_hora AT TIME ZONE 'America/Bahia')::date))/cx.meta_geral_diaria*100,2),100)::float8
      WHEN ip.meta_diaria<=0 THEN 100
      ELSE least(round((SELECT coalesce(sum(ip2.peso),0) FROM pesagens p2 JOIN itens_pesagem ip2 ON ip2.pesagem_uuid=p2.uuid WHERE p2.catador_uuid=p.catador_uuid AND ip2.material_uuid=ip.material_uuid AND ip2.contabiliza_meta AND p2.status='concluida' AND p2.excluida_em IS NULL AND (p2.data_hora AT TIME ZONE 'America/Bahia')::date=(p.data_hora AT TIME ZONE 'America/Bahia')::date)/ip.meta_diaria*100,2),100)::float8 END AS percentual_meta,
      coalesce(rp.nome,p.responsavel_outro) AS responsavel,
      coalesce((SELECT json_agg(json_build_object('uuid',a.uuid,'acao',a.acao,'dados',a.dados,'criado_em',a.criado_em) ORDER BY a.criado_em DESC)
        FROM auditoria a WHERE a.entidade='pesagens' AND a.entidade_uuid=p.uuid), '[]'::json) AS historico
    FROM pesagens p JOIN catadores c ON c.uuid=p.catador_uuid JOIN pontos_apoio pa ON pa.uuid=p.ponto_apoio_uuid
    LEFT JOIN cooperativas co ON co.uuid=p.cooperativa_uuid
    LEFT JOIN caixas_catador cx ON cx.catador_uuid=p.catador_uuid AND cx.data_caixa=(p.data_hora AT TIME ZONE 'America/Bahia')::date
    LEFT JOIN responsaveis_pesagem rp ON rp.uuid=p.responsavel_pesagem_uuid
    JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid JOIN materiais m ON m.uuid=ip.material_uuid
    WHERE ($1::date IS NULL OR p.data_hora >= $1::date) AND ($2::date IS NULL OR p.data_hora < $2::date + interval '1 day')
      AND ($3::uuid IS NULL OR p.catador_uuid=$3)
      AND ($4='' OR to_tsvector('portuguese',c.nome_completo || ' ' || c.codigo || ' ' || p.codigo || ' ' || m.nome || ' ' || p.status::text || ' ' || coalesce(co.nome,'')) @@ consulta_busca_prefixada($4))
    ORDER BY p.data_hora DESC LIMIT $5 OFFSET $6`, parametros);
  const totais = await banco.query<{ total: number; peso: number; valor: number }>(`SELECT count(*)::int AS total,
      coalesce(sum(p.peso_total) FILTER (WHERE p.status='concluida' AND p.excluida_em IS NULL),0)::float8 AS peso,
      coalesce(sum(p.valor_total) FILTER (WHERE p.status='concluida' AND p.excluida_em IS NULL),0)::float8 AS valor
    FROM pesagens p JOIN catadores c ON c.uuid=p.catador_uuid JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid JOIN materiais m ON m.uuid=ip.material_uuid
    LEFT JOIN cooperativas co ON co.uuid=p.cooperativa_uuid
    WHERE ($1::date IS NULL OR p.data_hora >= $1::date) AND ($2::date IS NULL OR p.data_hora < $2::date + interval '1 day')
      AND ($3::uuid IS NULL OR p.catador_uuid=$3)
      AND ($4='' OR to_tsvector('portuguese',c.nome_completo || ' ' || c.codigo || ' ' || p.codigo || ' ' || m.nome || ' ' || p.status::text || ' ' || coalesce(co.nome,'')) @@ consulta_busca_prefixada($4))`, parametros.slice(0, 4));
  return { dados: rows, total: totais.rows[0]?.total ?? 0, totais: { peso: totais.rows[0]?.peso ?? 0, valor: totais.rows[0]?.valor ?? 0 }, limite: filtro.limite, deslocamento: filtro.deslocamento };
});

aplicacao.setNotFoundHandler((_requisicao, resposta) => resposta.code(404).send({ mensagem: "Recurso não encontrado." }));

aplicacao.setErrorHandler((erro, requisicao, resposta) => {
  const status = (erro as { statusCode?: number }).statusCode;
  if (status === 401) return resposta.code(401).send({ mensagem: "Sessão inválida ou expirada." });
  if (status === 429) return resposta.code(429).send({ mensagem: "Muitas requisições. Aguarde alguns instantes e tente novamente." });
  if (status === 415) return resposta.code(415).send({ mensagem: "Formato de conteúdo não aceito." });
  if (status === 409) return resposta.code(409).send({ mensagem: erro instanceof Error ? erro.message : "A operação conflita com o estado atual do registro." });
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
await aplicacao.listen({ port: ambiente.PORTA_API, host: ambiente.HOST_API });

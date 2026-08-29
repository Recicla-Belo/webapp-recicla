-- Recicla Belô — estrutura completa do PostgreSQL 18.6

-- Arquivo gerado a partir das migrações oficiais. Execute em um banco vazio.

-- O administrador é criado separadamente por `npm run banco:seed`, pois a senha é protegida com bcrypt.

\set ON_ERROR_STOP on



-- ============================================================================
-- 001_estrutura_inicial.sql
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE status_cadastro AS ENUM ('ativo', 'inativo');
CREATE TYPE tipo_contato AS ENUM ('celular', 'telefone', 'whatsapp', 'recado', 'email');
CREATE TYPE tipo_conta_financeira AS ENUM ('pix', 'conta_bancaria');
CREATE TYPE status_pesagem AS ENUM ('rascunho', 'confirmada', 'cancelada');

CREATE TABLE IF NOT EXISTS usuarios (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(160) NOT NULL,
  email VARCHAR(254) NOT NULL,
  senha_hash TEXT NOT NULL,
  administrador BOOLEAN NOT NULL DEFAULT FALSE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_acesso_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT usuarios_email_unico UNIQUE (email),
  CONSTRAINT usuarios_email_minusculo CHECK (email = lower(email))
);

CREATE TABLE IF NOT EXISTS cooperativas (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(160) NOT NULL,
  nome_responsavel VARCHAR(160) NOT NULL,
  telefone VARCHAR(30),
  observacao TEXT,
  status status_cadastro NOT NULL DEFAULT 'ativo',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cooperativas_nome_unico UNIQUE (nome)
);

CREATE TABLE IF NOT EXISTS catadores (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(24) NOT NULL,
  cooperativa_uuid UUID REFERENCES cooperativas(uuid) ON DELETE SET NULL,
  nome_completo VARCHAR(200) NOT NULL,
  apelido VARCHAR(100),
  genero VARCHAR(60),
  raca_cor VARCHAR(60),
  data_nascimento DATE,
  cpf CHAR(11),
  status status_cadastro NOT NULL DEFAULT 'ativo',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT catadores_codigo_unico UNIQUE (codigo),
  CONSTRAINT catadores_cpf_unico UNIQUE (cpf),
  CONSTRAINT catadores_cpf_formato CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$')
);

CREATE TABLE IF NOT EXISTS contatos_catador (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catador_uuid UUID NOT NULL REFERENCES catadores(uuid) ON DELETE CASCADE,
  tipo tipo_contato NOT NULL,
  valor VARCHAR(254) NOT NULL,
  principal BOOLEAN NOT NULL DEFAULT FALSE,
  observacao VARCHAR(200),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS enderecos_catador (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catador_uuid UUID NOT NULL REFERENCES catadores(uuid) ON DELETE CASCADE,
  cep CHAR(8),
  logradouro VARCHAR(200),
  numero VARCHAR(30),
  complemento VARCHAR(120),
  bairro VARCHAR(120),
  cidade VARCHAR(120) DEFAULT 'Belo Horizonte',
  estado CHAR(2) DEFAULT 'MG',
  referencia TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enderecos_catador_unico UNIQUE (catador_uuid),
  CONSTRAINT enderecos_cep_formato CHECK (cep IS NULL OR cep ~ '^[0-9]{8}$')
);

CREATE TABLE IF NOT EXISTS contas_financeiras_catador (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catador_uuid UUID NOT NULL REFERENCES catadores(uuid) ON DELETE CASCADE,
  tipo tipo_conta_financeira NOT NULL,
  tipo_chave_pix VARCHAR(30),
  chave_pix TEXT,
  banco VARCHAR(120),
  agencia VARCHAR(20),
  numero_conta VARCHAR(30),
  tipo_conta VARCHAR(40),
  de_terceiro BOOLEAN NOT NULL DEFAULT FALSE,
  nome_titular VARCHAR(200),
  cpf_titular CHAR(11),
  relacao_titular VARCHAR(120),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contas_cpf_titular_formato CHECK (cpf_titular IS NULL OR cpf_titular ~ '^[0-9]{11}$')
);

CREATE TABLE IF NOT EXISTS arquivos_catador (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catador_uuid UUID NOT NULL REFERENCES catadores(uuid) ON DELETE CASCADE,
  tipo VARCHAR(40) NOT NULL DEFAULT 'foto_rosto',
  nome_arquivo TEXT NOT NULL,
  chave_armazenamento TEXT NOT NULL,
  tipo_mime VARCHAR(100) NOT NULL,
  tamanho_bytes BIGINT NOT NULL,
  hash_sha256 CHAR(64),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT arquivos_tamanho_positivo CHECK (tamanho_bytes > 0),
  CONSTRAINT arquivos_chave_unica UNIQUE (chave_armazenamento)
);

CREATE TABLE IF NOT EXISTS pontos_apoio (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(160) NOT NULL UNIQUE,
  status status_cadastro NOT NULL DEFAULT 'ativo',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS responsaveis_pesagem (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(160) NOT NULL,
  status status_cadastro NOT NULL DEFAULT 'ativo',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT responsaveis_nome_unico UNIQUE (nome)
);

CREATE TABLE IF NOT EXISTS materiais (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(160) NOT NULL,
  tipo_material VARCHAR(100) NOT NULL,
  unidade VARCHAR(30) NOT NULL DEFAULT 'kg',
  quantidade_referencia NUMERIC(14,3) NOT NULL DEFAULT 1,
  valor_referencia NUMERIC(14,2) NOT NULL,
  status status_cadastro NOT NULL DEFAULT 'ativo',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT materiais_nome_unico UNIQUE (nome),
  CONSTRAINT materiais_quantidade_positiva CHECK (quantidade_referencia > 0),
  CONSTRAINT materiais_valor_nao_negativo CHECK (valor_referencia >= 0)
);

CREATE TABLE IF NOT EXISTS pesagens (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(24) NOT NULL UNIQUE,
  catador_uuid UUID NOT NULL REFERENCES catadores(uuid) ON DELETE RESTRICT,
  ponto_apoio_uuid UUID NOT NULL REFERENCES pontos_apoio(uuid) ON DELETE RESTRICT,
  responsavel_pesagem_uuid UUID REFERENCES responsaveis_pesagem(uuid) ON DELETE RESTRICT,
  responsavel_outro VARCHAR(160),
  status status_pesagem NOT NULL DEFAULT 'confirmada',
  observacao TEXT,
  peso_total NUMERIC(14,3) NOT NULL DEFAULT 0,
  valor_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  confirmada_em TIMESTAMPTZ,
  criada_por_uuid UUID NOT NULL REFERENCES usuarios(uuid) ON DELETE RESTRICT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pesagens_responsavel_preenchido CHECK (responsavel_pesagem_uuid IS NOT NULL OR responsavel_outro IS NOT NULL),
  CONSTRAINT pesagens_peso_nao_negativo CHECK (peso_total >= 0),
  CONSTRAINT pesagens_valor_nao_negativo CHECK (valor_total >= 0)
);

CREATE TABLE IF NOT EXISTS itens_pesagem (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pesagem_uuid UUID NOT NULL REFERENCES pesagens(uuid) ON DELETE CASCADE,
  material_uuid UUID NOT NULL REFERENCES materiais(uuid) ON DELETE RESTRICT,
  peso NUMERIC(14,3) NOT NULL,
  unidade VARCHAR(30) NOT NULL,
  quantidade_referencia NUMERIC(14,3) NOT NULL,
  valor_referencia NUMERIC(14,2) NOT NULL,
  valor_total NUMERIC(14,2) GENERATED ALWAYS AS (round((peso / quantidade_referencia) * valor_referencia, 2)) STORED,
  observacao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT itens_peso_positivo CHECK (peso > 0),
  CONSTRAINT itens_quantidade_referencia_positiva CHECK (quantidade_referencia > 0)
);

CREATE TABLE IF NOT EXISTS auditoria (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_uuid UUID REFERENCES usuarios(uuid) ON DELETE SET NULL,
  acao VARCHAR(80) NOT NULL,
  entidade VARCHAR(80) NOT NULL,
  entidade_uuid UUID,
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  endereco_ip INET,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX catadores_cooperativa_idx ON catadores(cooperativa_uuid);
CREATE INDEX catadores_busca_textual_idx ON catadores USING GIN (to_tsvector('portuguese', coalesce(nome_completo,'') || ' ' || coalesce(apelido,'') || ' ' || codigo));
CREATE INDEX cooperativas_busca_textual_idx ON cooperativas USING GIN (to_tsvector('portuguese', nome || ' ' || nome_responsavel));
CREATE INDEX contatos_catador_catador_idx ON contatos_catador(catador_uuid);
CREATE INDEX pesagens_catador_data_idx ON pesagens(catador_uuid, criado_em DESC);
CREATE INDEX pesagens_ponto_data_idx ON pesagens(ponto_apoio_uuid, criado_em DESC);
CREATE INDEX itens_pesagem_material_idx ON itens_pesagem(material_uuid);
CREATE INDEX auditoria_entidade_idx ON auditoria(entidade, entidade_uuid, criado_em DESC);

COMMIT;


-- ============================================================================
-- 002_dados_iniciais.sql
-- ============================================================================

BEGIN;

INSERT INTO cooperativas (nome, nome_responsavel) VALUES
  ('Coopesol Leste', 'Responsável a definir'),
  ('Coopesol Barreiro', 'Responsável a definir'),
  ('Asmare', 'Responsável a definir'),
  ('Copemar', 'Responsável a definir'),
  ('Copemarc', 'Responsável a definir'),
  ('Catunidos', 'Responsável a definir'),
  ('Assoce Recicle', 'Responsável a definir'),
  ('Outras', 'Responsável a definir')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO pontos_apoio (nome) VALUES
  ('Praça da Estação'),
  ('Viaduto Santa Tereza'),
  ('Parque Municipal')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO responsaveis_pesagem (nome) VALUES
  ('João da Silva'),
  ('Maria Aparecida'),
  ('Carlos Eduardo')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO materiais (nome, tipo_material, unidade, quantidade_referencia, valor_referencia) VALUES
  ('Material misturado', 'Misto', 'kg', 1, 1.20),
  ('Latinha (Alumínio)', 'Metal', 'kg', 1, 7.00),
  ('Papelão', 'Papel', 'kg', 1, 1.00)
ON CONFLICT (nome) DO NOTHING;

COMMIT;


-- ============================================================================
-- 003_corrigir_cpf_opcional.sql
-- ============================================================================

BEGIN;

ALTER TABLE catadores DROP CONSTRAINT IF EXISTS catadores_cpf_unico;
ALTER TABLE catadores ADD CONSTRAINT catadores_cpf_unico UNIQUE (cpf);

COMMIT;


-- ============================================================================
-- 004_notificacoes.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS notificacoes (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_uuid UUID NOT NULL REFERENCES usuarios(uuid) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,
  titulo VARCHAR(160) NOT NULL,
  mensagem VARCHAR(500) NOT NULL,
  entidade VARCHAR(80),
  entidade_uuid UUID,
  lida_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notificacoes_usuario_data_idx
  ON notificacoes(usuario_uuid, criado_em DESC);
CREATE INDEX IF NOT EXISTS notificacoes_usuario_nao_lida_idx
  ON notificacoes(usuario_uuid, criado_em DESC)
  WHERE lida_em IS NULL;

COMMIT;


-- ============================================================================
-- 005_status_pesagem.sql
-- ============================================================================

ALTER TYPE status_pesagem ADD VALUE IF NOT EXISTS 'agendada';
ALTER TYPE status_pesagem ADD VALUE IF NOT EXISTS 'concluida';


-- ============================================================================
-- 006_auditoria_pesagens.sql
-- ============================================================================

BEGIN;

ALTER TABLE pesagens ADD COLUMN IF NOT EXISTS data_hora TIMESTAMPTZ;
UPDATE pesagens SET data_hora = coalesce(confirmada_em, criado_em) WHERE data_hora IS NULL;
ALTER TABLE pesagens ALTER COLUMN data_hora SET DEFAULT now();
ALTER TABLE pesagens ALTER COLUMN data_hora SET NOT NULL;

ALTER TABLE pesagens ADD COLUMN IF NOT EXISTS excluida_em TIMESTAMPTZ;
ALTER TABLE pesagens ADD COLUMN IF NOT EXISTS excluida_por_uuid UUID REFERENCES usuarios(uuid) ON DELETE RESTRICT;
ALTER TABLE pesagens ADD COLUMN IF NOT EXISTS motivo_exclusao TEXT;

UPDATE pesagens SET status = 'concluida' WHERE status = 'confirmada';
UPDATE pesagens SET status = 'agendada' WHERE status = 'rascunho';
ALTER TABLE pesagens ALTER COLUMN status SET DEFAULT 'concluida';

ALTER TABLE contas_financeiras_catador
  ADD CONSTRAINT contas_dados_pagamento_preenchidos CHECK (
    (tipo = 'pix' AND nullif(btrim(chave_pix), '') IS NOT NULL)
    OR
    (tipo = 'conta_bancaria'
      AND nullif(btrim(banco), '') IS NOT NULL
      AND nullif(btrim(agencia), '') IS NOT NULL
      AND nullif(btrim(numero_conta), '') IS NOT NULL
      AND nullif(btrim(tipo_conta), '') IS NOT NULL)
  ) NOT VALID;

ALTER TABLE contas_financeiras_catador
  ADD CONSTRAINT contas_terceiro_identificado CHECK (
    de_terceiro = FALSE
    OR (nullif(btrim(nome_titular), '') IS NOT NULL AND cpf_titular ~ '^[0-9]{11}$')
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS pesagens_data_hora_idx ON pesagens(data_hora DESC);
CREATE INDEX IF NOT EXISTS pesagens_excluida_em_idx ON pesagens(excluida_em) WHERE excluida_em IS NOT NULL;
CREATE INDEX IF NOT EXISTS auditoria_pesagem_acao_idx ON auditoria(entidade_uuid, acao, criado_em DESC) WHERE entidade = 'pesagens';

COMMIT;


-- ============================================================================
-- 007_normaliza_status_pesagens.sql
-- ============================================================================

UPDATE pesagens SET status = 'agendada' WHERE status = 'rascunho';


-- ============================================================================
-- 008_metas_e_caixas_catadores.sql
-- ============================================================================

BEGIN;

DO $$ BEGIN
  CREATE TYPE status_caixa_catador AS ENUM ('aberto', 'fechado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE materiais ADD COLUMN IF NOT EXISTS meta_diaria NUMERIC(14,3) NOT NULL DEFAULT 20;
ALTER TABLE materiais DROP CONSTRAINT IF EXISTS materiais_meta_diaria_positiva;
ALTER TABLE materiais ADD CONSTRAINT materiais_meta_diaria_positiva CHECK (meta_diaria > 0);

ALTER TABLE pesagens ADD COLUMN IF NOT EXISTS cooperativa_uuid UUID REFERENCES cooperativas(uuid) ON DELETE RESTRICT;
UPDATE pesagens p SET cooperativa_uuid = c.cooperativa_uuid
FROM catadores c WHERE c.uuid = p.catador_uuid AND p.cooperativa_uuid IS NULL;

ALTER TABLE itens_pesagem ADD COLUMN IF NOT EXISTS meta_diaria NUMERIC(14,3);
UPDATE itens_pesagem ip SET meta_diaria = m.meta_diaria
FROM materiais m WHERE m.uuid = ip.material_uuid AND ip.meta_diaria IS NULL;
ALTER TABLE itens_pesagem ALTER COLUMN meta_diaria SET DEFAULT 20;
ALTER TABLE itens_pesagem ALTER COLUMN meta_diaria SET NOT NULL;
ALTER TABLE itens_pesagem DROP CONSTRAINT IF EXISTS itens_meta_diaria_positiva;
ALTER TABLE itens_pesagem ADD CONSTRAINT itens_meta_diaria_positiva CHECK (meta_diaria > 0);

CREATE TABLE IF NOT EXISTS caixas_catador (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catador_uuid UUID NOT NULL REFERENCES catadores(uuid) ON DELETE RESTRICT,
  data_caixa DATE NOT NULL,
  status status_caixa_catador NOT NULL DEFAULT 'aberto',
  aberto_por_uuid UUID NOT NULL REFERENCES usuarios(uuid) ON DELETE RESTRICT,
  aberto_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  fechado_por_uuid UUID REFERENCES usuarios(uuid) ON DELETE RESTRICT,
  fechado_em TIMESTAMPTZ,
  reaberto_por_uuid UUID REFERENCES usuarios(uuid) ON DELETE RESTRICT,
  reaberto_em TIMESTAMPTZ,
  motivo_reabertura TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT caixas_catador_dia_unico UNIQUE (catador_uuid, data_caixa),
  CONSTRAINT caixas_fechamento_coerente CHECK (
    (status = 'aberto') OR (fechado_por_uuid IS NOT NULL AND fechado_em IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS movimentacoes_caixa_catador (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caixa_uuid UUID NOT NULL REFERENCES caixas_catador(uuid) ON DELETE RESTRICT,
  pesagem_uuid UUID NOT NULL REFERENCES pesagens(uuid) ON DELETE RESTRICT,
  peso NUMERIC(14,3) NOT NULL,
  valor NUMERIC(14,2) NOT NULL,
  ativa BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT movimentacoes_pesagem_unica UNIQUE (pesagem_uuid),
  CONSTRAINT movimentacoes_peso_positivo CHECK (peso > 0),
  CONSTRAINT movimentacoes_valor_nao_negativo CHECK (valor >= 0)
);

CREATE INDEX IF NOT EXISTS caixas_catador_data_idx ON caixas_catador(catador_uuid, data_caixa DESC);
CREATE INDEX IF NOT EXISTS caixas_status_data_idx ON caixas_catador(status, data_caixa DESC);
CREATE INDEX IF NOT EXISTS movimentacoes_caixa_ativas_idx ON movimentacoes_caixa_catador(caixa_uuid, criado_em DESC) WHERE ativa;
CREATE INDEX IF NOT EXISTS pesagens_cooperativa_data_idx ON pesagens(cooperativa_uuid, data_hora DESC);

-- Reconstrói o livro-caixa das pesagens históricas concluídas e não excluídas.
INSERT INTO caixas_catador (catador_uuid, data_caixa, aberto_por_uuid, aberto_em)
SELECT p.catador_uuid, (p.data_hora AT TIME ZONE 'America/Bahia')::date, min(p.criada_por_uuid::text)::uuid, min(p.criado_em)
FROM pesagens p
WHERE p.status = 'concluida' AND p.excluida_em IS NULL
GROUP BY p.catador_uuid, (p.data_hora AT TIME ZONE 'America/Bahia')::date
ON CONFLICT (catador_uuid, data_caixa) DO NOTHING;

INSERT INTO movimentacoes_caixa_catador (caixa_uuid, pesagem_uuid, peso, valor)
SELECT cx.uuid, p.uuid, p.peso_total, p.valor_total
FROM pesagens p
JOIN caixas_catador cx ON cx.catador_uuid = p.catador_uuid
  AND cx.data_caixa = (p.data_hora AT TIME ZONE 'America/Bahia')::date
WHERE p.status = 'concluida' AND p.excluida_em IS NULL
ON CONFLICT (pesagem_uuid) DO NOTHING;

COMMIT;


-- ============================================================================
-- 009_limpa_auditorias_caixa_orfas.sql
-- ============================================================================

-- Remove somente eventos de caixa cujo caixa e catador temporários já foram apagados.
-- Esses registros eram resíduos de testes antigos e não representavam movimentações reais.
DELETE FROM auditoria a
WHERE a.entidade = 'caixas_catador'
  AND NOT EXISTS (
    SELECT 1
    FROM caixas_catador cx
    WHERE cx.uuid = a.entidade_uuid
  );


-- ============================================================================
-- 010_limpa_notificacoes_orfas.sql
-- ============================================================================

-- Remove avisos que apontam para registros já apagados por exclusões em cascata.
DELETE FROM notificacoes n
WHERE CASE n.entidade
  WHEN 'catadores' THEN NOT EXISTS (SELECT 1 FROM catadores c WHERE c.uuid=n.entidade_uuid)
  WHEN 'cooperativas' THEN NOT EXISTS (SELECT 1 FROM cooperativas co WHERE co.uuid=n.entidade_uuid)
  WHEN 'materiais' THEN NOT EXISTS (SELECT 1 FROM materiais m WHERE m.uuid=n.entidade_uuid)
  WHEN 'pesagens' THEN NOT EXISTS (SELECT 1 FROM pesagens p WHERE p.uuid=n.entidade_uuid)
  WHEN 'caixas_catador' THEN NOT EXISTS (SELECT 1 FROM caixas_catador cx WHERE cx.uuid=n.entidade_uuid)
  ELSE FALSE
END;


-- ============================================================================
-- 011_pagamento_por_meta_e_responsaveis.sql
-- ============================================================================

BEGIN;

ALTER TABLE materiais DROP CONSTRAINT IF EXISTS materiais_meta_diaria_positiva;
ALTER TABLE materiais ADD CONSTRAINT materiais_meta_diaria_nao_negativa CHECK (meta_diaria >= 0);
ALTER TABLE itens_pesagem DROP CONSTRAINT IF EXISTS itens_meta_diaria_positiva;
ALTER TABLE itens_pesagem ADD CONSTRAINT itens_meta_diaria_nao_negativa CHECK (meta_diaria >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS responsaveis_pesagem_nome_unico_ci
  ON responsaveis_pesagem (lower(nome));

-- Recalcula o histórico: antes da meta não há pagamento; ao alcançá-la,
-- libera-se o valor proporcional de todo o peso acumulado naquele dia/material.
WITH base AS (
  SELECT p.uuid, p.catador_uuid, ip.material_uuid,
    (p.data_hora AT TIME ZONE 'America/Bahia')::date AS data_meta,
    p.data_hora, p.criado_em,
    sum(ip.peso) OVER grupo AS peso_acumulado,
    sum(round((ip.peso / ip.quantidade_referencia) * ip.valor_referencia, 2)) OVER grupo AS valor_bruto_acumulado,
    ip.meta_diaria
  FROM pesagens p
  JOIN itens_pesagem ip ON ip.pesagem_uuid = p.uuid
  WHERE p.status = 'concluida' AND p.excluida_em IS NULL
  WINDOW grupo AS (
    PARTITION BY p.catador_uuid, ip.material_uuid, (p.data_hora AT TIME ZONE 'America/Bahia')::date
    ORDER BY p.data_hora, p.criado_em, p.uuid ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  )
), direitos AS (
  SELECT uuid, catador_uuid, material_uuid, data_meta, data_hora, criado_em,
    CASE WHEN meta_diaria <= 0 OR peso_acumulado >= meta_diaria THEN valor_bruto_acumulado ELSE 0 END AS direito
  FROM base
), valores AS (
  SELECT uuid, round(direito - coalesce(lag(direito) OVER (
    PARTITION BY catador_uuid, material_uuid, data_meta ORDER BY data_hora, criado_em, uuid
  ), 0), 2) AS valor
  FROM direitos
)
UPDATE pesagens p SET valor_total = greatest(v.valor, 0), atualizado_em = now()
FROM valores v WHERE v.uuid = p.uuid;

UPDATE pesagens SET valor_total = 0, atualizado_em = now()
WHERE status <> 'concluida' OR excluida_em IS NOT NULL;

UPDATE movimentacoes_caixa_catador mc SET valor = p.valor_total, atualizado_em = now()
FROM pesagens p WHERE p.uuid = mc.pesagem_uuid;

COMMIT;


-- ============================================================================
-- 012_meta_geral_catadores_e_busca_prefixada.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS configuracoes_meta_geral (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave VARCHAR(30) NOT NULL DEFAULT 'principal' UNIQUE,
  ativa BOOLEAN NOT NULL DEFAULT FALSE,
  meta_diaria NUMERIC(14,3) NOT NULL DEFAULT 0,
  unidade VARCHAR(30) NOT NULL DEFAULT 'kg',
  atualizado_por_uuid UUID REFERENCES usuarios(uuid) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT configuracoes_meta_geral_valor_nao_negativo CHECK (meta_diaria >= 0),
  CONSTRAINT configuracoes_meta_geral_chave_principal CHECK (chave = 'principal')
);

INSERT INTO configuracoes_meta_geral (ativa, meta_diaria, unidade)
SELECT FALSE, 0, 'kg'
WHERE NOT EXISTS (SELECT 1 FROM configuracoes_meta_geral);

ALTER TABLE caixas_catador
  ADD COLUMN IF NOT EXISTS meta_geral_ativa BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS meta_geral_diaria NUMERIC(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unidade_meta_geral VARCHAR(30) NOT NULL DEFAULT 'kg';

ALTER TABLE caixas_catador DROP CONSTRAINT IF EXISTS caixas_meta_geral_nao_negativa;
ALTER TABLE caixas_catador
  ADD CONSTRAINT caixas_meta_geral_nao_negativa CHECK (meta_geral_diaria >= 0);

-- Converte os termos informados em uma consulta full-text por prefixo. Assim,
-- "mar" já encontra "Maria" e "CAT-00" encontra o código durante a digitação.
CREATE OR REPLACE FUNCTION consulta_busca_prefixada(texto TEXT)
RETURNS TSQUERY
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN btrim(coalesce(texto, '')) = '' THEN ''::tsquery
    ELSE coalesce((
      SELECT to_tsquery('portuguese', string_agg(quote_literal(lexema) || ':*', ' & '))
      FROM unnest(tsvector_to_array(to_tsvector('portuguese', texto))) AS termo(lexema)
    ), ''::tsquery)
  END
$$;

COMMIT;


-- ============================================================================
-- 013_seguranca_sessao_administrador.sql
-- ============================================================================

BEGIN;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS versao_sessao INTEGER NOT NULL DEFAULT 1;

ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS usuarios_versao_sessao_positiva;

ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_versao_sessao_positiva CHECK (versao_sessao > 0);

COMMIT;


-- ============================================================================
-- 014_materiais_validos_e_pesagens_fora_meta.sql
-- ============================================================================

ALTER TABLE materiais
  ADD COLUMN IF NOT EXISTS contabiliza_meta BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE itens_pesagem
  ADD COLUMN IF NOT EXISTS contabiliza_meta BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN materiais.contabiliza_meta IS
  'Indica se o material pode ser selecionado para compor metas gerais ou específicas.';

COMMENT ON COLUMN itens_pesagem.contabiliza_meta IS
  'Decisão congelada na pesagem: TRUE compõe a meta; FALSE recebe pagamento imediato fora da meta.';


-- ============================================================================
-- 015_premio_fixo_e_credito_excedente_meta.sql
-- ============================================================================

BEGIN;

ALTER TABLE configuracoes_meta_geral
  ADD COLUMN IF NOT EXISTS valor_premio NUMERIC(14,2) NOT NULL DEFAULT 0;

ALTER TABLE configuracoes_meta_geral DROP CONSTRAINT IF EXISTS configuracoes_meta_geral_premio_nao_negativo;
ALTER TABLE configuracoes_meta_geral
  ADD CONSTRAINT configuracoes_meta_geral_premio_nao_negativo CHECK (valor_premio >= 0);

ALTER TABLE caixas_catador
  ADD COLUMN IF NOT EXISTS valor_premio_meta_geral NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credito_meta_utilizado NUMERIC(14,3) NOT NULL DEFAULT 0;

ALTER TABLE caixas_catador DROP CONSTRAINT IF EXISTS caixas_premio_meta_geral_nao_negativo;
ALTER TABLE caixas_catador DROP CONSTRAINT IF EXISTS caixas_credito_meta_utilizado_nao_negativo;
ALTER TABLE caixas_catador
  ADD CONSTRAINT caixas_premio_meta_geral_nao_negativo CHECK (valor_premio_meta_geral >= 0),
  ADD CONSTRAINT caixas_credito_meta_utilizado_nao_negativo CHECK (credito_meta_utilizado >= 0);

ALTER TABLE itens_pesagem
  ADD COLUMN IF NOT EXISTS guardar_excedente_meta BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS peso_meta_aplicado NUMERIC(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peso_excedente_pago NUMERIC(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peso_excedente_credito NUMERIC(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_premio_meta NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_excedente_material NUMERIC(14,2) NOT NULL DEFAULT 0;

ALTER TABLE itens_pesagem DROP CONSTRAINT IF EXISTS itens_pesagem_liquidacao_meta_nao_negativa;
ALTER TABLE itens_pesagem
  ADD CONSTRAINT itens_pesagem_liquidacao_meta_nao_negativa CHECK (
    peso_meta_aplicado >= 0 AND
    peso_excedente_pago >= 0 AND
    peso_excedente_credito >= 0 AND
    valor_premio_meta >= 0 AND
    valor_excedente_material >= 0
  );

COMMENT ON COLUMN configuracoes_meta_geral.valor_premio IS
  'Valor fixo liberado uma única vez quando o catador alcança a meta geral diária.';
COMMENT ON COLUMN caixas_catador.valor_premio_meta_geral IS
  'Cópia imutável do prêmio vigente quando o caixa diário foi aberto.';
COMMENT ON COLUMN caixas_catador.credito_meta_utilizado IS
  'Peso excedente de dias anteriores consumido no início desta meta diária.';
COMMENT ON COLUMN itens_pesagem.guardar_excedente_meta IS
  'Escolha auditável: guarda o peso que ultrapassou a meta para uma data futura em vez de pagá-lo pelo material.';
COMMENT ON COLUMN itens_pesagem.peso_meta_aplicado IS
  'Parcela do peso da pesagem efetivamente usada para completar a meta geral do dia.';
COMMENT ON COLUMN itens_pesagem.peso_excedente_credito IS
  'Parcela excedente guardada como crédito de peso para uma próxima meta.';

COMMIT;


-- ============================================================================
-- 016_perfis_acesso_usuarios.sql
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'perfil_acesso_usuario') THEN
    CREATE TYPE perfil_acesso_usuario AS ENUM ('administrador', 'operador_cadastro');
  END IF;
END
$$;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS perfil perfil_acesso_usuario;

UPDATE usuarios
SET perfil = CASE WHEN administrador THEN 'administrador'::perfil_acesso_usuario ELSE 'operador_cadastro'::perfil_acesso_usuario END
WHERE perfil IS NULL;

ALTER TABLE usuarios
  ALTER COLUMN perfil SET DEFAULT 'operador_cadastro',
  ALTER COLUMN perfil SET NOT NULL;

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_perfil_administrador_coerente;
ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_perfil_administrador_coerente CHECK (
    administrador = (perfil = 'administrador'::perfil_acesso_usuario)
  );

CREATE INDEX IF NOT EXISTS usuarios_perfil_status_idx ON usuarios(perfil, ativo, nome);

COMMENT ON COLUMN usuarios.perfil IS
  'administrador possui acesso integral; operador_cadastro pode consultar e criar cadastros e pesagens, sem alterar configurações, editar ou excluir dados.';

COMMIT;


-- ============================================================================
-- 017_permissoes_granulares_usuarios.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS permissoes (
  chave VARCHAR(80) PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  descricao VARCHAR(300) NOT NULL,
  grupo VARCHAR(80) NOT NULL,
  ordem SMALLINT NOT NULL DEFAULT 0,
  ativa BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT permissoes_chave_formato CHECK (chave ~ '^[a-z][a-z0-9_]{2,79}$')
);

CREATE TABLE IF NOT EXISTS permissoes_usuario (
  usuario_uuid UUID NOT NULL REFERENCES usuarios(uuid) ON DELETE CASCADE,
  permissao_chave VARCHAR(80) NOT NULL REFERENCES permissoes(chave) ON DELETE RESTRICT,
  concedida_por_uuid UUID REFERENCES usuarios(uuid) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_uuid, permissao_chave)
);

CREATE INDEX IF NOT EXISTS idx_permissoes_usuario_permissao ON permissoes_usuario(permissao_chave, usuario_uuid);

INSERT INTO permissoes (chave,nome,descricao,grupo,ordem) VALUES
  ('painel_visualizar','Visualizar painel','Consultar indicadores e atividades recentes.','Painel',10),
  ('catadores_visualizar','Consultar catadores','Listar e abrir a ficha completa dos catadores.','Catadores',20),
  ('catadores_cadastrar','Cadastrar catadores','Criar catadores e incluir a foto do cadastro.','Catadores',21),
  ('catadores_editar','Editar catadores','Alterar dados, foto e situação ativa ou inativa.','Catadores',22),
  ('catadores_excluir','Excluir catadores','Excluir definitivamente o cadastro e seus dados vinculados.','Catadores',23),
  ('catadores_gerenciar_caixa','Gerenciar caixas','Fechar e reabrir o caixa individual de catadores.','Catadores',24),
  ('cooperativas_visualizar','Consultar cooperativas','Listar cooperativas e associações.','Cooperativas',30),
  ('cooperativas_cadastrar','Cadastrar cooperativas','Criar cooperativas e associações.','Cooperativas',31),
  ('cooperativas_editar','Editar cooperativas','Alterar dados e situação de cooperativas.','Cooperativas',32),
  ('cooperativas_excluir','Excluir cooperativas','Excluir cooperativas sem dependências impeditivas.','Cooperativas',33),
  ('pesagens_cadastrar','Cadastrar pesagens','Registrar novas pesagens e consultar os dados auxiliares necessários.','Pesagens e relatórios',40),
  ('relatorios_visualizar','Consultar relatórios','Consultar e exportar relatórios e históricos de pesagens.','Pesagens e relatórios',41),
  ('pesagens_editar','Corrigir pesagens','Alterar pesagens com motivo e trilha de auditoria.','Pesagens e relatórios',42),
  ('pesagens_excluir','Excluir pesagens','Excluir logicamente pesagens com motivo e auditoria.','Pesagens e relatórios',43),
  ('materiais_gerenciar','Gerenciar materiais','Criar, alterar e excluir materiais e valores.','Configurações',50),
  ('responsaveis_gerenciar','Gerenciar responsáveis','Criar, alterar e excluir responsáveis pela pesagem.','Configurações',51),
  ('metas_gerenciar','Gerenciar meta geral','Consultar e alterar a meta geral e seu prêmio.','Configurações',52),
  ('identidade_visual_gerenciar','Gerenciar identidade visual','Alterar nome, ícone, favicon e cores neste dispositivo.','Configurações',53)
ON CONFLICT (chave) DO UPDATE SET nome=excluded.nome,descricao=excluded.descricao,grupo=excluded.grupo,ordem=excluded.ordem,ativa=TRUE,atualizado_em=now();

-- Mantém o acesso das contas antigas. Novas contas recebem apenas o que o administrador selecionar.
INSERT INTO permissoes_usuario (usuario_uuid,permissao_chave)
SELECT u.uuid,p.chave FROM usuarios u CROSS JOIN (VALUES
  ('painel_visualizar'),('catadores_visualizar'),('catadores_cadastrar'),
  ('cooperativas_visualizar'),('cooperativas_cadastrar'),('pesagens_cadastrar'),('relatorios_visualizar')
) AS p(chave)
WHERE u.perfil='operador_cadastro'
ON CONFLICT DO NOTHING;


-- ============================================================================
-- 018_descricao_permissao_metas_materiais.sql
-- ============================================================================

UPDATE permissoes
SET nome = 'Gerenciar metas e materiais participantes',
    descricao = 'Alterar a meta geral, o prêmio e escolher quais materiais participam das metas.',
    atualizado_em = now()
WHERE chave = 'metas_gerenciar';


-- ============================================================================
-- 019_relatorios_confiaveis_e_auditoria_imutavel.sql
-- ============================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS auditoria_criado_em_idx
  ON auditoria (criado_em DESC, uuid DESC);

CREATE INDEX IF NOT EXISTS auditoria_usuario_data_idx
  ON auditoria (usuario_uuid, criado_em DESC);

CREATE OR REPLACE FUNCTION impedir_alteracao_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'O livro de auditoria é imutável: eventos não podem ser alterados ou excluídos.'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS auditoria_imutavel ON auditoria;
CREATE TRIGGER auditoria_imutavel
BEFORE UPDATE OR DELETE ON auditoria
FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_auditoria();

COMMENT ON TABLE auditoria IS
  'Livro imutável e permanente de eventos de segurança e alterações do Recicla Belô.';

CREATE OR REPLACE VIEW relatorio_resumo_diario AS
WITH producao AS (
  SELECT
    (p.data_hora AT TIME ZONE 'America/Bahia')::date AS data_operacao,
    count(p.uuid)::int AS coletas_realizadas,
    count(DISTINCT p.catador_uuid)::int AS catadores_atendidos,
    coalesce(sum(p.peso_total),0)::numeric(16,3) AS total_coletado,
    coalesce(sum(p.valor_total),0)::numeric(16,2) AS valor_total_pagar,
    coalesce(sum(p.peso_total)/nullif(count(DISTINCT p.catador_uuid),0),0)::numeric(16,3) AS media_por_catador
  FROM pesagens p
  WHERE p.status='concluida' AND p.excluida_em IS NULL
  GROUP BY (p.data_hora AT TIME ZONE 'America/Bahia')::date
), metas_atingidas AS (
  SELECT data_operacao,count(DISTINCT catador_uuid)::int AS catadores_meta_atingida
  FROM (
    SELECT
      (p.data_hora AT TIME ZONE 'America/Bahia')::date AS data_operacao,
      p.catador_uuid
    FROM pesagens p
    JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid
    JOIN caixas_catador cx ON cx.catador_uuid=p.catador_uuid
      AND cx.data_caixa=(p.data_hora AT TIME ZONE 'America/Bahia')::date
    WHERE p.status='concluida' AND p.excluida_em IS NULL
      AND ip.contabiliza_meta AND cx.meta_geral_ativa AND cx.meta_geral_diaria>0
    GROUP BY (p.data_hora AT TIME ZONE 'America/Bahia')::date,p.catador_uuid,cx.meta_geral_diaria,cx.credito_meta_utilizado
    HAVING cx.credito_meta_utilizado+sum(ip.peso_meta_aplicado)>=cx.meta_geral_diaria
    UNION
    SELECT
      (p.data_hora AT TIME ZONE 'America/Bahia')::date AS data_operacao,
      p.catador_uuid
    FROM pesagens p
    JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid
    LEFT JOIN caixas_catador cx ON cx.catador_uuid=p.catador_uuid
      AND cx.data_caixa=(p.data_hora AT TIME ZONE 'America/Bahia')::date
    WHERE p.status='concluida' AND p.excluida_em IS NULL
      AND ip.contabiliza_meta AND NOT coalesce(cx.meta_geral_ativa,FALSE)
    GROUP BY (p.data_hora AT TIME ZONE 'America/Bahia')::date,p.catador_uuid,ip.material_uuid
    HAVING max(ip.meta_diaria)>0 AND sum(ip.peso)>=max(ip.meta_diaria)
  ) metas
  GROUP BY data_operacao
)
SELECT p.data_operacao,p.coletas_realizadas,p.catadores_atendidos,p.total_coletado,
  p.valor_total_pagar,p.media_por_catador,coalesce(m.catadores_meta_atingida,0) AS catadores_meta_atingida
FROM producao p
LEFT JOIN metas_atingidas m USING (data_operacao);

COMMENT ON VIEW relatorio_resumo_diario IS
  'Consolidação diária reproduzível a partir das pesagens válidas; não armazena totais acumulados no dashboard.';

COMMIT;


-- ============================================================================
-- 020_exportacao_excel_catadores.sql
-- ============================================================================

INSERT INTO permissoes (chave,nome,descricao,grupo,ordem) VALUES
  ('catadores_exportar','Exportar catadores em Excel','Baixar a relação completa de catadores, incluindo dados pessoais, contatos, endereço e pagamento.','Catadores',25)
ON CONFLICT (chave) DO UPDATE SET
  nome=excluded.nome,
  descricao=excluded.descricao,
  grupo=excluded.grupo,
  ordem=excluded.ordem,
  ativa=TRUE,
  atualizado_em=now();

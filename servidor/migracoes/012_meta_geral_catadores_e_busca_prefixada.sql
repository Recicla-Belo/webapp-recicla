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

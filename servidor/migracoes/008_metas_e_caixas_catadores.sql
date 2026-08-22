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

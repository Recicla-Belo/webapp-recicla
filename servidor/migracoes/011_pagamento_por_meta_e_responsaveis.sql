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

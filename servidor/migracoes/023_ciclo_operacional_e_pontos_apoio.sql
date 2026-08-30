BEGIN;

INSERT INTO permissoes (chave,nome,descricao,grupo,ordem) VALUES
  ('pontos_apoio_gerenciar','Gerenciar pontos de apoio','Cadastrar, editar, ativar, desativar e excluir pontos de apoio.','Configurações',54)
ON CONFLICT (chave) DO UPDATE SET
  nome=excluded.nome,descricao=excluded.descricao,grupo=excluded.grupo,ordem=excluded.ordem,ativa=TRUE,atualizado_em=now();

-- Corrige a separação indevida causada pela virada do calendário: todas as
-- movimentações dos caixas ainda abertos voltam para o ciclo aberto mais antigo.
WITH caixas_abertos AS (
  SELECT uuid,catador_uuid,
    first_value(uuid) OVER (PARTITION BY catador_uuid ORDER BY data_caixa,criado_em,uuid) AS caixa_principal,
    row_number() OVER (PARTITION BY catador_uuid ORDER BY data_caixa,criado_em,uuid) AS ordem
  FROM caixas_catador WHERE status='aberto'
), transferidas AS (
  UPDATE movimentacoes_caixa_catador mc
  SET caixa_uuid=ca.caixa_principal,atualizado_em=now()
  FROM caixas_abertos ca
  WHERE ca.ordem>1 AND mc.caixa_uuid=ca.uuid
  RETURNING ca.uuid
)
UPDATE caixas_catador cx
SET status='fechado',fechado_por_uuid=cx.aberto_por_uuid,fechado_em=coalesce(cx.fechado_em,now()),atualizado_em=now()
FROM caixas_abertos ca
WHERE ca.ordem>1 AND cx.uuid=ca.uuid;

CREATE UNIQUE INDEX IF NOT EXISTS caixas_catador_um_ciclo_aberto_idx
  ON caixas_catador(catador_uuid) WHERE status='aberto';

COMMENT ON INDEX caixas_catador_um_ciclo_aberto_idx IS
  'Impede a virada automática da meta: cada catador mantém somente um ciclo operacional aberto até o fechamento explícito.';

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
), itens_validos AS (
  SELECT
    (p.data_hora AT TIME ZONE 'America/Bahia')::date AS data_operacao,
    p.catador_uuid,p.uuid AS pesagem_uuid,p.data_hora,p.criado_em,
    cx.uuid AS caixa_uuid,cx.meta_geral_ativa,
    ip.material_uuid,ip.peso,ip.meta_diaria,ip.valor_premio_meta,
    sum(ip.peso) OVER (
      PARTITION BY cx.uuid,ip.material_uuid
      ORDER BY p.data_hora,p.criado_em,p.uuid
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS peso_acumulado_material
  FROM pesagens p
  JOIN itens_pesagem ip ON ip.pesagem_uuid=p.uuid AND ip.contabiliza_meta
  JOIN movimentacoes_caixa_catador mc ON mc.pesagem_uuid=p.uuid AND mc.ativa
  JOIN caixas_catador cx ON cx.uuid=mc.caixa_uuid
  WHERE p.status='concluida' AND p.excluida_em IS NULL
), metas_atingidas AS (
  SELECT data_operacao,count(DISTINCT catador_uuid)::int AS catadores_meta_atingida
  FROM (
    SELECT data_operacao,catador_uuid
    FROM itens_validos
    WHERE meta_geral_ativa AND valor_premio_meta>0
    UNION
    SELECT data_operacao,catador_uuid
    FROM itens_validos
    WHERE NOT meta_geral_ativa AND meta_diaria>0
      AND peso_acumulado_material>=meta_diaria
      AND peso_acumulado_material-peso<meta_diaria
  ) metas
  GROUP BY data_operacao
)
SELECT p.data_operacao,p.coletas_realizadas,p.catadores_atendidos,p.total_coletado,
  p.valor_total_pagar,p.media_por_catador,coalesce(m.catadores_meta_atingida,0) AS catadores_meta_atingida
FROM producao p
LEFT JOIN metas_atingidas m USING (data_operacao);

COMMENT ON VIEW relatorio_resumo_diario IS
  'Consolidação diária reproduzível pelas pesagens, mantendo metas vinculadas ao ciclo operacional até seu fechamento explícito.';

COMMIT;

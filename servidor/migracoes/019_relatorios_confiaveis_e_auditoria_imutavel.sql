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

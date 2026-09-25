-- Mantém os consolidados por ponto/tenda e central eficientes em bases com muitas pesagens.
CREATE INDEX IF NOT EXISTS pesagens_relatorio_ponto_data_validas_idx
  ON pesagens (ponto_apoio_uuid, data_hora DESC)
  INCLUDE (cooperativa_uuid, catador_uuid, peso_total, valor_total)
  WHERE status = 'concluida' AND excluida_em IS NULL;

CREATE INDEX IF NOT EXISTS pesagens_relatorio_central_data_validas_idx
  ON pesagens (cooperativa_uuid, data_hora DESC)
  INCLUDE (ponto_apoio_uuid, catador_uuid, peso_total, valor_total)
  WHERE status = 'concluida' AND excluida_em IS NULL;

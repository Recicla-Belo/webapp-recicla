-- Remove somente eventos de caixa cujo caixa e catador temporários já foram apagados.
-- Esses registros eram resíduos de testes antigos e não representavam movimentações reais.
DELETE FROM auditoria a
WHERE a.entidade = 'caixas_catador'
  AND NOT EXISTS (
    SELECT 1
    FROM caixas_catador cx
    WHERE cx.uuid = a.entidade_uuid
  );

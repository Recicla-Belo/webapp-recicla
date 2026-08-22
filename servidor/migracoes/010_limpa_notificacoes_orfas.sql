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

INSERT INTO permissoes (chave,nome,descricao,grupo,ordem) VALUES
  ('catadores_exportar','Exportar catadores em Excel','Baixar a relação completa de catadores, incluindo dados pessoais, contatos, endereço e pagamento.','Catadores',25)
ON CONFLICT (chave) DO UPDATE SET
  nome=excluded.nome,
  descricao=excluded.descricao,
  grupo=excluded.grupo,
  ordem=excluded.ordem,
  ativa=TRUE,
  atualizado_em=now();

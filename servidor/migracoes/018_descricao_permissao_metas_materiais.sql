UPDATE permissoes
SET nome = 'Gerenciar metas e materiais participantes',
    descricao = 'Alterar a meta geral, o prêmio e escolher quais materiais participam das metas.',
    atualizado_em = now()
WHERE chave = 'metas_gerenciar';

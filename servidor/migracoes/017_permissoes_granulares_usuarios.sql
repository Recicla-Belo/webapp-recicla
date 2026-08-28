CREATE TABLE IF NOT EXISTS permissoes (
  chave VARCHAR(80) PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  descricao VARCHAR(300) NOT NULL,
  grupo VARCHAR(80) NOT NULL,
  ordem SMALLINT NOT NULL DEFAULT 0,
  ativa BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT permissoes_chave_formato CHECK (chave ~ '^[a-z][a-z0-9_]{2,79}$')
);

CREATE TABLE IF NOT EXISTS permissoes_usuario (
  usuario_uuid UUID NOT NULL REFERENCES usuarios(uuid) ON DELETE CASCADE,
  permissao_chave VARCHAR(80) NOT NULL REFERENCES permissoes(chave) ON DELETE RESTRICT,
  concedida_por_uuid UUID REFERENCES usuarios(uuid) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_uuid, permissao_chave)
);

CREATE INDEX IF NOT EXISTS idx_permissoes_usuario_permissao ON permissoes_usuario(permissao_chave, usuario_uuid);

INSERT INTO permissoes (chave,nome,descricao,grupo,ordem) VALUES
  ('painel_visualizar','Visualizar painel','Consultar indicadores e atividades recentes.','Painel',10),
  ('catadores_visualizar','Consultar catadores','Listar e abrir a ficha completa dos catadores.','Catadores',20),
  ('catadores_cadastrar','Cadastrar catadores','Criar catadores e incluir a foto do cadastro.','Catadores',21),
  ('catadores_editar','Editar catadores','Alterar dados, foto e situação ativa ou inativa.','Catadores',22),
  ('catadores_excluir','Excluir catadores','Excluir definitivamente o cadastro e seus dados vinculados.','Catadores',23),
  ('catadores_gerenciar_caixa','Gerenciar caixas','Fechar e reabrir o caixa individual de catadores.','Catadores',24),
  ('cooperativas_visualizar','Consultar cooperativas','Listar cooperativas e associações.','Cooperativas',30),
  ('cooperativas_cadastrar','Cadastrar cooperativas','Criar cooperativas e associações.','Cooperativas',31),
  ('cooperativas_editar','Editar cooperativas','Alterar dados e situação de cooperativas.','Cooperativas',32),
  ('cooperativas_excluir','Excluir cooperativas','Excluir cooperativas sem dependências impeditivas.','Cooperativas',33),
  ('pesagens_cadastrar','Cadastrar pesagens','Registrar novas pesagens e consultar os dados auxiliares necessários.','Pesagens e relatórios',40),
  ('relatorios_visualizar','Consultar relatórios','Consultar e exportar relatórios e históricos de pesagens.','Pesagens e relatórios',41),
  ('pesagens_editar','Corrigir pesagens','Alterar pesagens com motivo e trilha de auditoria.','Pesagens e relatórios',42),
  ('pesagens_excluir','Excluir pesagens','Excluir logicamente pesagens com motivo e auditoria.','Pesagens e relatórios',43),
  ('materiais_gerenciar','Gerenciar materiais','Criar, alterar e excluir materiais e valores.','Configurações',50),
  ('responsaveis_gerenciar','Gerenciar responsáveis','Criar, alterar e excluir responsáveis pela pesagem.','Configurações',51),
  ('metas_gerenciar','Gerenciar meta geral','Consultar e alterar a meta geral e seu prêmio.','Configurações',52),
  ('identidade_visual_gerenciar','Gerenciar identidade visual','Alterar nome, ícone, favicon e cores neste dispositivo.','Configurações',53)
ON CONFLICT (chave) DO UPDATE SET nome=excluded.nome,descricao=excluded.descricao,grupo=excluded.grupo,ordem=excluded.ordem,ativa=TRUE,atualizado_em=now();

-- Mantém o acesso das contas antigas. Novas contas recebem apenas o que o administrador selecionar.
INSERT INTO permissoes_usuario (usuario_uuid,permissao_chave)
SELECT u.uuid,p.chave FROM usuarios u CROSS JOIN (VALUES
  ('painel_visualizar'),('catadores_visualizar'),('catadores_cadastrar'),
  ('cooperativas_visualizar'),('cooperativas_cadastrar'),('pesagens_cadastrar'),('relatorios_visualizar')
) AS p(chave)
WHERE u.perfil='operador_cadastro'
ON CONFLICT DO NOTHING;

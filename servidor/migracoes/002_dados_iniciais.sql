BEGIN;

INSERT INTO cooperativas (nome, nome_responsavel) VALUES
  ('Coopesol Leste', 'Responsável a definir'),
  ('Coopesol Barreiro', 'Responsável a definir'),
  ('Asmare', 'Responsável a definir'),
  ('Copemar', 'Responsável a definir'),
  ('Copemarc', 'Responsável a definir'),
  ('Catunidos', 'Responsável a definir'),
  ('Assoce Recicle', 'Responsável a definir'),
  ('Outras', 'Responsável a definir')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO pontos_apoio (nome) VALUES
  ('Praça da Estação'),
  ('Viaduto Santa Tereza'),
  ('Parque Municipal')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO responsaveis_pesagem (nome) VALUES
  ('João da Silva'),
  ('Maria Aparecida'),
  ('Carlos Eduardo')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO materiais (nome, tipo_material, unidade, quantidade_referencia, valor_referencia) VALUES
  ('Material misturado', 'Misto', 'kg', 1, 1.20),
  ('Latinha (Alumínio)', 'Metal', 'kg', 1, 7.00),
  ('Papelão', 'Papel', 'kg', 1, 1.00)
ON CONFLICT (nome) DO NOTHING;

COMMIT;

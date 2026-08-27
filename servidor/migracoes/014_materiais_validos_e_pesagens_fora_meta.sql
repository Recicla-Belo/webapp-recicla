ALTER TABLE materiais
  ADD COLUMN IF NOT EXISTS contabiliza_meta BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE itens_pesagem
  ADD COLUMN IF NOT EXISTS contabiliza_meta BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN materiais.contabiliza_meta IS
  'Indica se o material pode ser selecionado para compor metas gerais ou específicas.';

COMMENT ON COLUMN itens_pesagem.contabiliza_meta IS
  'Decisão congelada na pesagem: TRUE compõe a meta; FALSE recebe pagamento imediato fora da meta.';

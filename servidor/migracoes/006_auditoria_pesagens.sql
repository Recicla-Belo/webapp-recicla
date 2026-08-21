BEGIN;

ALTER TABLE pesagens ADD COLUMN IF NOT EXISTS data_hora TIMESTAMPTZ;
UPDATE pesagens SET data_hora = coalesce(confirmada_em, criado_em) WHERE data_hora IS NULL;
ALTER TABLE pesagens ALTER COLUMN data_hora SET DEFAULT now();
ALTER TABLE pesagens ALTER COLUMN data_hora SET NOT NULL;

ALTER TABLE pesagens ADD COLUMN IF NOT EXISTS excluida_em TIMESTAMPTZ;
ALTER TABLE pesagens ADD COLUMN IF NOT EXISTS excluida_por_uuid UUID REFERENCES usuarios(uuid) ON DELETE RESTRICT;
ALTER TABLE pesagens ADD COLUMN IF NOT EXISTS motivo_exclusao TEXT;

UPDATE pesagens SET status = 'concluida' WHERE status = 'confirmada';
UPDATE pesagens SET status = 'agendada' WHERE status = 'rascunho';
ALTER TABLE pesagens ALTER COLUMN status SET DEFAULT 'concluida';

ALTER TABLE contas_financeiras_catador
  ADD CONSTRAINT contas_dados_pagamento_preenchidos CHECK (
    (tipo = 'pix' AND nullif(btrim(chave_pix), '') IS NOT NULL)
    OR
    (tipo = 'conta_bancaria'
      AND nullif(btrim(banco), '') IS NOT NULL
      AND nullif(btrim(agencia), '') IS NOT NULL
      AND nullif(btrim(numero_conta), '') IS NOT NULL
      AND nullif(btrim(tipo_conta), '') IS NOT NULL)
  ) NOT VALID;

ALTER TABLE contas_financeiras_catador
  ADD CONSTRAINT contas_terceiro_identificado CHECK (
    de_terceiro = FALSE
    OR (nullif(btrim(nome_titular), '') IS NOT NULL AND cpf_titular ~ '^[0-9]{11}$')
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS pesagens_data_hora_idx ON pesagens(data_hora DESC);
CREATE INDEX IF NOT EXISTS pesagens_excluida_em_idx ON pesagens(excluida_em) WHERE excluida_em IS NOT NULL;
CREATE INDEX IF NOT EXISTS auditoria_pesagem_acao_idx ON auditoria(entidade_uuid, acao, criado_em DESC) WHERE entidade = 'pesagens';

COMMIT;

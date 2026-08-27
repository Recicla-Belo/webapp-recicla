BEGIN;

ALTER TABLE configuracoes_meta_geral
  ADD COLUMN IF NOT EXISTS valor_premio NUMERIC(14,2) NOT NULL DEFAULT 0;

ALTER TABLE configuracoes_meta_geral DROP CONSTRAINT IF EXISTS configuracoes_meta_geral_premio_nao_negativo;
ALTER TABLE configuracoes_meta_geral
  ADD CONSTRAINT configuracoes_meta_geral_premio_nao_negativo CHECK (valor_premio >= 0);

ALTER TABLE caixas_catador
  ADD COLUMN IF NOT EXISTS valor_premio_meta_geral NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credito_meta_utilizado NUMERIC(14,3) NOT NULL DEFAULT 0;

ALTER TABLE caixas_catador DROP CONSTRAINT IF EXISTS caixas_premio_meta_geral_nao_negativo;
ALTER TABLE caixas_catador DROP CONSTRAINT IF EXISTS caixas_credito_meta_utilizado_nao_negativo;
ALTER TABLE caixas_catador
  ADD CONSTRAINT caixas_premio_meta_geral_nao_negativo CHECK (valor_premio_meta_geral >= 0),
  ADD CONSTRAINT caixas_credito_meta_utilizado_nao_negativo CHECK (credito_meta_utilizado >= 0);

ALTER TABLE itens_pesagem
  ADD COLUMN IF NOT EXISTS guardar_excedente_meta BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS peso_meta_aplicado NUMERIC(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peso_excedente_pago NUMERIC(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peso_excedente_credito NUMERIC(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_premio_meta NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_excedente_material NUMERIC(14,2) NOT NULL DEFAULT 0;

ALTER TABLE itens_pesagem DROP CONSTRAINT IF EXISTS itens_pesagem_liquidacao_meta_nao_negativa;
ALTER TABLE itens_pesagem
  ADD CONSTRAINT itens_pesagem_liquidacao_meta_nao_negativa CHECK (
    peso_meta_aplicado >= 0 AND
    peso_excedente_pago >= 0 AND
    peso_excedente_credito >= 0 AND
    valor_premio_meta >= 0 AND
    valor_excedente_material >= 0
  );

COMMENT ON COLUMN configuracoes_meta_geral.valor_premio IS
  'Valor fixo liberado uma única vez quando o catador alcança a meta geral diária.';
COMMENT ON COLUMN caixas_catador.valor_premio_meta_geral IS
  'Cópia imutável do prêmio vigente quando o caixa diário foi aberto.';
COMMENT ON COLUMN caixas_catador.credito_meta_utilizado IS
  'Peso excedente de dias anteriores consumido no início desta meta diária.';
COMMENT ON COLUMN itens_pesagem.guardar_excedente_meta IS
  'Escolha auditável: guarda o peso que ultrapassou a meta para uma data futura em vez de pagá-lo pelo material.';
COMMENT ON COLUMN itens_pesagem.peso_meta_aplicado IS
  'Parcela do peso da pesagem efetivamente usada para completar a meta geral do dia.';
COMMENT ON COLUMN itens_pesagem.peso_excedente_credito IS
  'Parcela excedente guardada como crédito de peso para uma próxima meta.';

COMMIT;

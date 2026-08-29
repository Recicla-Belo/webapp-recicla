BEGIN;

INSERT INTO permissoes (chave,nome,descricao,grupo,ordem) VALUES
  ('catadores_pagar','Efetuar pagamentos (Pagador(a))','Registrar pagamentos aos catadores, confirmar a forma de pagamento e emitir recibos.','Catadores',26)
ON CONFLICT (chave) DO UPDATE SET
  nome=excluded.nome,
  descricao=excluded.descricao,
  grupo=excluded.grupo,
  ordem=excluded.ordem,
  ativa=TRUE,
  atualizado_em=now();

CREATE TABLE IF NOT EXISTS pagamentos_catador (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(32) NOT NULL UNIQUE,
  chave_idempotencia UUID NOT NULL UNIQUE,
  catador_uuid UUID NOT NULL,
  codigo_catador VARCHAR(24) NOT NULL,
  nome_catador VARCHAR(200) NOT NULL,
  cpf_catador CHAR(11),
  cooperativa_catador VARCHAR(160),
  valor NUMERIC(14,2) NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  conta_financeira_uuid UUID,
  dados_recebimento JSONB,
  observacao TEXT,
  pagador_uuid UUID NOT NULL REFERENCES usuarios(uuid) ON DELETE RESTRICT,
  pago_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pagamentos_catador_valor_positivo CHECK (valor > 0),
  CONSTRAINT pagamentos_catador_tipo_valido CHECK (tipo IN ('pix','dinheiro','transferencia_bancaria','outro')),
  CONSTRAINT pagamentos_catador_cpf_formato CHECK (cpf_catador IS NULL OR cpf_catador ~ '^[0-9]{11}$')
);

CREATE TABLE IF NOT EXISTS itens_pagamento_catador (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pagamento_uuid UUID NOT NULL REFERENCES pagamentos_catador(uuid) ON DELETE CASCADE,
  pesagem_uuid UUID NOT NULL,
  codigo_pesagem VARCHAR(24) NOT NULL,
  material VARCHAR(160) NOT NULL,
  data_hora TIMESTAMPTZ NOT NULL,
  peso NUMERIC(14,3) NOT NULL,
  valor NUMERIC(14,2) NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT itens_pagamento_valor_positivo CHECK (valor > 0),
  CONSTRAINT itens_pagamento_peso_nao_negativo CHECK (peso >= 0)
);

CREATE INDEX IF NOT EXISTS pagamentos_catador_catador_data_idx
  ON pagamentos_catador (catador_uuid, pago_em DESC);
CREATE INDEX IF NOT EXISTS pagamentos_catador_pagador_data_idx
  ON pagamentos_catador (pagador_uuid, pago_em DESC);
CREATE INDEX IF NOT EXISTS itens_pagamento_pesagem_idx
  ON itens_pagamento_catador (pesagem_uuid);

CREATE OR REPLACE FUNCTION impedir_alteracao_pagamento_catador()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE'
    AND current_setting('reciclabelo.limpeza_administrativa', TRUE) = 'autorizada' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Pagamentos confirmados são imutáveis; faça uma correção administrativa auditada.'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS pagamentos_catador_imutavel ON pagamentos_catador;
CREATE TRIGGER pagamentos_catador_imutavel
BEFORE UPDATE OR DELETE ON pagamentos_catador
FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_pagamento_catador();

DROP TRIGGER IF EXISTS itens_pagamento_catador_imutavel ON itens_pagamento_catador;
CREATE TRIGGER itens_pagamento_catador_imutavel
BEFORE UPDATE OR DELETE ON itens_pagamento_catador
FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_pagamento_catador();

COMMENT ON TABLE pagamentos_catador IS
  'Livro imutável dos pagamentos confirmados aos catadores, com identificação do pagador autenticado.';
COMMENT ON TABLE itens_pagamento_catador IS
  'Rateio do pagamento entre as pesagens que originaram o saldo, preservando os dados do recibo.';

COMMIT;

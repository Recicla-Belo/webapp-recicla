BEGIN;

CREATE TABLE IF NOT EXISTS historico_limpezas_administrativas (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  administrador_uuid UUID NOT NULL REFERENCES usuarios(uuid) ON DELETE RESTRICT,
  tipo VARCHAR(80) NOT NULL,
  alvo_uuid UUID,
  motivo TEXT NOT NULL,
  contagens JSONB NOT NULL DEFAULT '{}'::jsonb,
  endereco_ip INET,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT historico_limpezas_tipo_valido CHECK (tipo IN (
    'excluir_evento_auditoria',
    'excluir_pesagem_definitivamente',
    'excluir_dia_operacional',
    'limpar_dados_operacionais'
  )),
  CONSTRAINT historico_limpezas_motivo_minimo CHECK (length(btrim(motivo)) >= 3)
);

CREATE INDEX IF NOT EXISTS historico_limpezas_administrador_data_idx
  ON historico_limpezas_administrativas (administrador_uuid, criado_em DESC);

CREATE OR REPLACE FUNCTION impedir_alteracao_historico_limpezas()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'O histórico de limpezas administrativas é permanente.'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS historico_limpezas_imutavel ON historico_limpezas_administrativas;
CREATE TRIGGER historico_limpezas_imutavel
BEFORE UPDATE OR DELETE ON historico_limpezas_administrativas
FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_historico_limpezas();

CREATE OR REPLACE FUNCTION impedir_alteracao_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE'
    AND current_setting('reciclabelo.limpeza_administrativa', TRUE) = 'autorizada' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'O livro de auditoria é imutável: eventos não podem ser alterados ou excluídos.'
    USING ERRCODE = '55000';
END;
$$;

COMMENT ON TABLE historico_limpezas_administrativas IS
  'Registro permanente, separado dos relatórios comuns, das exclusões destrutivas confirmadas por um administrador.';

COMMIT;

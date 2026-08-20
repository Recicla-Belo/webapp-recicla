BEGIN;

CREATE TABLE IF NOT EXISTS notificacoes (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_uuid UUID NOT NULL REFERENCES usuarios(uuid) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,
  titulo VARCHAR(160) NOT NULL,
  mensagem VARCHAR(500) NOT NULL,
  entidade VARCHAR(80),
  entidade_uuid UUID,
  lida_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notificacoes_usuario_data_idx
  ON notificacoes(usuario_uuid, criado_em DESC);
CREATE INDEX IF NOT EXISTS notificacoes_usuario_nao_lida_idx
  ON notificacoes(usuario_uuid, criado_em DESC)
  WHERE lida_em IS NULL;

COMMIT;

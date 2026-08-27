BEGIN;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS versao_sessao INTEGER NOT NULL DEFAULT 1;

ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS usuarios_versao_sessao_positiva;

ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_versao_sessao_positiva CHECK (versao_sessao > 0);

COMMIT;

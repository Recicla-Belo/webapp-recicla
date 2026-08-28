BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'perfil_acesso_usuario') THEN
    CREATE TYPE perfil_acesso_usuario AS ENUM ('administrador', 'operador_cadastro');
  END IF;
END
$$;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS perfil perfil_acesso_usuario;

UPDATE usuarios
SET perfil = CASE WHEN administrador THEN 'administrador'::perfil_acesso_usuario ELSE 'operador_cadastro'::perfil_acesso_usuario END
WHERE perfil IS NULL;

ALTER TABLE usuarios
  ALTER COLUMN perfil SET DEFAULT 'operador_cadastro',
  ALTER COLUMN perfil SET NOT NULL;

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_perfil_administrador_coerente;
ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_perfil_administrador_coerente CHECK (
    administrador = (perfil = 'administrador'::perfil_acesso_usuario)
  );

CREATE INDEX IF NOT EXISTS usuarios_perfil_status_idx ON usuarios(perfil, ativo, nome);

COMMENT ON COLUMN usuarios.perfil IS
  'administrador possui acesso integral; operador_cadastro pode consultar e criar cadastros e pesagens, sem alterar configurações, editar ou excluir dados.';

COMMIT;

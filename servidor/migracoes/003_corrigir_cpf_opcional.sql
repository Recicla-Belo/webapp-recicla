BEGIN;

ALTER TABLE catadores DROP CONSTRAINT IF EXISTS catadores_cpf_unico;
ALTER TABLE catadores ADD CONSTRAINT catadores_cpf_unico UNIQUE (cpf);

COMMIT;

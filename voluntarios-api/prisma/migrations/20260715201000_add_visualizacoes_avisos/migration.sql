ALTER TABLE "avisos"
ADD COLUMN IF NOT EXISTS "oculto" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "avisos_visualizacoes" (
  "id" UUID NOT NULL,
  "aviso_id" UUID NOT NULL,
  "usuario_id" UUID NOT NULL,
  "visualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "avisos_visualizacoes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "avisos_visualizacoes_aviso_id_usuario_id_key"
ON "avisos_visualizacoes"("aviso_id", "usuario_id");

CREATE INDEX IF NOT EXISTS "avisos_visualizacoes_usuario_id_visualizado_em_idx"
ON "avisos_visualizacoes"("usuario_id", "visualizado_em");

ALTER TABLE "avisos_visualizacoes"
DROP CONSTRAINT IF EXISTS "avisos_visualizacoes_aviso_id_fkey";

ALTER TABLE "avisos_visualizacoes"
ADD CONSTRAINT "avisos_visualizacoes_aviso_id_fkey"
FOREIGN KEY ("aviso_id") REFERENCES "avisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "avisos_visualizacoes"
DROP CONSTRAINT IF EXISTS "avisos_visualizacoes_usuario_id_fkey";

ALTER TABLE "avisos_visualizacoes"
ADD CONSTRAINT "avisos_visualizacoes_usuario_id_fkey"
FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

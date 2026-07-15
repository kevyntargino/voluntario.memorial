ALTER TABLE "avisos"
ADD COLUMN IF NOT EXISTS "data_aviso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "avisos_destinatarios" (
  "id" UUID NOT NULL,
  "aviso_id" UUID NOT NULL,
  "usuario_id" UUID NOT NULL,

  CONSTRAINT "avisos_destinatarios_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "avisos_destinatarios_aviso_id_usuario_id_key"
ON "avisos_destinatarios"("aviso_id", "usuario_id");

ALTER TABLE "avisos_destinatarios"
ADD CONSTRAINT "avisos_destinatarios_aviso_id_fkey"
FOREIGN KEY ("aviso_id") REFERENCES "avisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "avisos_destinatarios"
ADD CONSTRAINT "avisos_destinatarios_usuario_id_fkey"
FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "modelos_escalas_voluntarios" (
    "id" UUID NOT NULL,
    "semana_mes" INTEGER NOT NULL,
    "evento_id" UUID NOT NULL,
    "equipe_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modelos_escalas_voluntarios_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "modelos_escalas_voluntarios_evento_id_equipe_id_semana_mes_usuario_id_key"
ON "modelos_escalas_voluntarios"("evento_id", "equipe_id", "semana_mes", "usuario_id");

CREATE INDEX "modelos_escalas_voluntarios_evento_id_equipe_id_semana_mes_idx"
ON "modelos_escalas_voluntarios"("evento_id", "equipe_id", "semana_mes");

CREATE INDEX "modelos_escalas_voluntarios_usuario_id_idx"
ON "modelos_escalas_voluntarios"("usuario_id");

ALTER TABLE "modelos_escalas_voluntarios"
ADD CONSTRAINT "modelos_escalas_voluntarios_evento_id_fkey"
FOREIGN KEY ("evento_id") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "modelos_escalas_voluntarios"
ADD CONSTRAINT "modelos_escalas_voluntarios_equipe_id_fkey"
FOREIGN KEY ("equipe_id") REFERENCES "equipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "modelos_escalas_voluntarios"
ADD CONSTRAINT "modelos_escalas_voluntarios_usuario_id_fkey"
FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "eventos_ocorrencias" (
    "id" UUID NOT NULL,
    "evento_id" UUID NOT NULL,
    "data_hora_original" TIMESTAMP(3) NOT NULL,
    "data_hora" TIMESTAMP(3),
    "titulo" TEXT,
    "local" TEXT,
    "descricao" TEXT,
    "cancelada" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eventos_ocorrencias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "eventos_ocorrencias_evento_id_data_hora_original_key"
ON "eventos_ocorrencias"("evento_id", "data_hora_original");

CREATE INDEX "eventos_ocorrencias_evento_id_data_hora_idx"
ON "eventos_ocorrencias"("evento_id", "data_hora");

ALTER TABLE "eventos_ocorrencias"
ADD CONSTRAINT "eventos_ocorrencias_evento_id_fkey"
FOREIGN KEY ("evento_id") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

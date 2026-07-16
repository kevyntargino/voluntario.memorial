ALTER TABLE "ordens_culto"
  ADD COLUMN "data_hora" TIMESTAMP(3),
  ADD COLUMN "arquivo_key" TEXT,
  ADD COLUMN "evento_id" UUID;

CREATE UNIQUE INDEX "ordens_culto_evento_id_data_hora_key" ON "ordens_culto"("evento_id", "data_hora");
CREATE INDEX "ordens_culto_evento_id_data_hora_idx" ON "ordens_culto"("evento_id", "data_hora");

ALTER TABLE "ordens_culto"
  ADD CONSTRAINT "ordens_culto_evento_id_fkey"
  FOREIGN KEY ("evento_id") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "StatusEscala" ADD VALUE IF NOT EXISTS 'AUSENTE';

ALTER TABLE "escalas"
ADD COLUMN IF NOT EXISTS "semana_mes" INTEGER;

ALTER TABLE "voluntarios_escalas"
ADD COLUMN IF NOT EXISTS "data_ocorrencia_substituicao" TIMESTAMP(3);

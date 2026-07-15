ALTER TABLE "voluntarios_escalas"
ADD COLUMN "justificativa_substituicao" TEXT,
ADD COLUMN "substituto" BOOLEAN NOT NULL DEFAULT false;

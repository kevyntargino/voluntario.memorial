-- Separa o cadastro do evento das escalas de cada ocorrência/equipe.
CREATE TYPE "FrequenciaEvento" AS ENUM ('NAO_REPETE', 'SEMANAL', 'MENSAL');

CREATE TABLE "eventos" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "local" TEXT,
    "descricao" TEXT,
    "tipo" "TipoEscala" NOT NULL,
    "frequencia" "FrequenciaEvento" NOT NULL DEFAULT 'NAO_REPETE',
    "data_inicio" TIMESTAMP(3) NOT NULL,
    "data_fim" TIMESTAMP(3),
    "dia_semana" INTEGER,
    "semana_mes" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eventos_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "escalas" ADD COLUMN "evento_id" UUID;

CREATE TEMP TABLE "evento_backfill" AS
SELECT
    gen_random_uuid() AS id,
    CASE
      WHEN e.tipo = 'ESPORADICA' THEN 'ESPORADICA:' || COALESCE(e.grupo_esporadico_id::text, e.id::text)
      ELSE 'RECORRENTE:' || md5(concat_ws('|', e.titulo, e.local, e.descricao, e.dia_semana::text, e.semana_mes::text, to_char(e.data_hora, 'HH24:MI')))
    END AS chave,
    COALESCE(min(e.titulo), 'Evento sem título') AS titulo,
    min(e.local) AS local,
    min(e.descricao) AS descricao,
    e.tipo,
    CASE WHEN e.tipo = 'RECORRENTE' THEN 'MENSAL'::"FrequenciaEvento" ELSE 'NAO_REPETE'::"FrequenciaEvento" END AS frequencia,
    COALESCE(min(e.data_hora), min(e.criado_em)) AS data_inicio,
    min(e.dia_semana) AS dia_semana,
    min(e.semana_mes) AS semana_mes,
    min(e.criado_em) AS criado_em,
    max(e.atualizado_em) AS atualizado_em
FROM "escalas" e
GROUP BY e.tipo, chave;

INSERT INTO "eventos" ("id", "titulo", "local", "descricao", "tipo", "frequencia", "data_inicio", "dia_semana", "semana_mes", "criado_em", "atualizado_em")
SELECT id, titulo, local, descricao, tipo, frequencia, data_inicio, dia_semana, semana_mes, criado_em, atualizado_em
FROM "evento_backfill";

UPDATE "escalas" e
SET "evento_id" = b.id
FROM "evento_backfill" b
WHERE b.chave = CASE
  WHEN e.tipo = 'ESPORADICA' THEN 'ESPORADICA:' || COALESCE(e.grupo_esporadico_id::text, e.id::text)
  ELSE 'RECORRENTE:' || md5(concat_ws('|', e.titulo, e.local, e.descricao, e.dia_semana::text, e.semana_mes::text, to_char(e.data_hora, 'HH24:MI')))
END;

CREATE TABLE "_EventoEquipes" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

-- Em relações implícitas Prisma, A é Equipe e B é Evento (ordem alfabética dos models).
INSERT INTO "_EventoEquipes" ("A", "B")
SELECT DISTINCT e.equipe_id, e.evento_id
FROM "escalas" e
WHERE e.evento_id IS NOT NULL;

CREATE UNIQUE INDEX "_EventoEquipes_AB_unique" ON "_EventoEquipes"("A", "B");
CREATE INDEX "_EventoEquipes_B_index" ON "_EventoEquipes"("B");
CREATE INDEX "escalas_evento_id_data_hora_idx" ON "escalas"("evento_id", "data_hora");
CREATE UNIQUE INDEX "escalas_evento_id_equipe_id_data_hora_key" ON "escalas"("evento_id", "equipe_id", "data_hora");

ALTER TABLE "escalas" ADD CONSTRAINT "escalas_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_EventoEquipes" ADD CONSTRAINT "_EventoEquipes_A_fkey" FOREIGN KEY ("A") REFERENCES "equipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_EventoEquipes" ADD CONSTRAINT "_EventoEquipes_B_fkey" FOREIGN KEY ("B") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

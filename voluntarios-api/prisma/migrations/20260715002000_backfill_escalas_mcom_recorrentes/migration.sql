UPDATE "escalas" AS e
SET
  "tipo" = 'RECORRENTE',
  "dia_semana" = EXTRACT(DOW FROM e."data_hora")::INTEGER,
  "semana_mes" = CEIL(EXTRACT(DAY FROM e."data_hora") / 7.0)::INTEGER
FROM "equipes" AS eq
WHERE e."equipe_id" = eq."id"
  AND eq."nome" IN ('Midia', 'Iluminação', 'Filmagem', 'Fotografia', 'DTV', 'Direção', 'Redes Sociais')
  AND e."data_hora" IS NOT NULL
  AND e."tipo" = 'ESPORADICA'
  AND EXTRACT(DOW FROM e."data_hora")::INTEGER IN (0, 6)
  AND CEIL(EXTRACT(DAY FROM e."data_hora") / 7.0)::INTEGER BETWEEN 1 AND 4;

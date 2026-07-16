UPDATE "usuarios"
SET "telefone" = NULLIF(regexp_replace("telefone", '[^0-9]', '', 'g'), '')
WHERE "telefone" IS NOT NULL;

UPDATE "usuarios"
SET "telefone" = '55' || "telefone"
WHERE "telefone" IS NOT NULL
  AND char_length("telefone") BETWEEN 8 AND 11;

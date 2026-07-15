-- Cria um vínculo específico para liderança de equipes.
-- A relação _UsuarioEquipes continua representando participação/voluntariado.
CREATE TABLE "_LiderEquipes" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_LiderEquipes_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE INDEX "_LiderEquipes_B_index" ON "_LiderEquipes"("B");

ALTER TABLE "_LiderEquipes" ADD CONSTRAINT "_LiderEquipes_A_fkey" FOREIGN KEY ("A") REFERENCES "equipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_LiderEquipes" ADD CONSTRAINT "_LiderEquipes_B_fkey" FOREIGN KEY ("B") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "_LiderEquipes" ("A", "B")
SELECT ue."A", ue."B"
FROM "_UsuarioEquipes" ue
JOIN "usuarios" u ON u."id" = ue."B"
WHERE 'LIDER_EQUIPE' = ANY(u."permissoes")
ON CONFLICT DO NOTHING;

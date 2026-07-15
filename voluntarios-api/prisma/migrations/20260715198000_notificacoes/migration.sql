CREATE TYPE "TipoNotificacao" AS ENUM ('CONFIRMACAO_ESCALA', 'AVISO', 'SUBSTITUTO', 'ALERTA_LIDER');

CREATE TABLE "notificacoes" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" "TipoNotificacao" NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "link" TEXT,
    "chave" TEXT NOT NULL,
    "visualizada" BOOLEAN NOT NULL DEFAULT false,
    "lida_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notificacoes_chave_key" ON "notificacoes"("chave");
CREATE INDEX "notificacoes_usuario_id_visualizada_criado_em_idx" ON "notificacoes"("usuario_id", "visualizada", "criado_em");

ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

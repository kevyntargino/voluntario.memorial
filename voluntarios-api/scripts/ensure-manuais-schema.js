import 'dotenv/config';
import { Pool } from 'pg';

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('[ERRO] DATABASE_URL ou DIRECT_URL precisa estar configurada.');
  process.exit(1);
}

const pool = new Pool({ connectionString });

try {
  await pool.query(`
    ALTER TABLE "manuais" ADD COLUMN IF NOT EXISTS "versao" TEXT NOT NULL DEFAULT '1.0';
    ALTER TABLE "manuais" ADD COLUMN IF NOT EXISTS "data_manual" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE "manuais" ADD COLUMN IF NOT EXISTS "oculto" BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE "manuais" ADD COLUMN IF NOT EXISTS "arquivo_key" TEXT;
    ALTER TABLE "manuais" ALTER COLUMN "equipe_id" DROP NOT NULL;
    ALTER TABLE "voluntarios_escalas" ADD COLUMN IF NOT EXISTS "data_ocorrencia_status" TIMESTAMP(3);

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TipoNotificacao') THEN
        CREATE TYPE "TipoNotificacao" AS ENUM ('CONFIRMACAO_ESCALA', 'LEMBRETE_ESCALA', 'AVISO', 'SUBSTITUTO', 'ALERTA_LIDER', 'ORDEM_CULTO');
      END IF;
    END $$;

    ALTER TYPE "TipoNotificacao" ADD VALUE IF NOT EXISTS 'ORDEM_CULTO';
    ALTER TYPE "TipoNotificacao" ADD VALUE IF NOT EXISTS 'LEMBRETE_ESCALA';

    CREATE TABLE IF NOT EXISTS "notificacoes" (
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

    CREATE UNIQUE INDEX IF NOT EXISTS "notificacoes_chave_key" ON "notificacoes"("chave");
    CREATE INDEX IF NOT EXISTS "notificacoes_usuario_id_visualizada_criado_em_idx" ON "notificacoes"("usuario_id", "visualizada", "criado_em");

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'notificacoes_usuario_id_fkey'
      ) THEN
        ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  console.log('[DB] Schemas auxiliares verificados/ajustados com sucesso.');
} catch (error) {
  console.error('[ERRO] Falha ao ajustar schemas auxiliares:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

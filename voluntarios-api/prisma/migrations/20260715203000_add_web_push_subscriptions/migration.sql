CREATE TABLE IF NOT EXISTS "web_push_subscriptions" (
  "id" UUID NOT NULL,
  "usuario_id" UUID NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "user_agent" TEXT,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "web_push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "web_push_subscriptions_endpoint_key"
ON "web_push_subscriptions"("endpoint");

CREATE INDEX IF NOT EXISTS "web_push_subscriptions_usuario_id_idx"
ON "web_push_subscriptions"("usuario_id");

ALTER TABLE "web_push_subscriptions"
DROP CONSTRAINT IF EXISTS "web_push_subscriptions_usuario_id_fkey";

ALTER TABLE "web_push_subscriptions"
ADD CONSTRAINT "web_push_subscriptions_usuario_id_fkey"
FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

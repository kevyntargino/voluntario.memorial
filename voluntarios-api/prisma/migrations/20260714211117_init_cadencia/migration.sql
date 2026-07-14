-- CreateEnum
CREATE TYPE "Permissao" AS ENUM ('ADMINISTRADOR', 'LIDER_EQUIPE', 'VOLUNTARIO');

-- CreateEnum
CREATE TYPE "Sexo" AS ENUM ('MASCULINO', 'FEMININO', 'OUTRO', 'PREFIRO_NAO_INFORMAR');

-- CreateEnum
CREATE TYPE "TipoEscala" AS ENUM ('RECORRENTE', 'ESPORADICA');

-- CreateEnum
CREATE TYPE "StatusEscala" AS ENUM ('PENDENTE', 'CONFIRMADA', 'PEDIU_SUBSTITUICAO');

-- CreateEnum
CREATE TYPE "AcaoAuditoria" AS ENUM ('LOGIN', 'LOGOUT', 'REDEFINICAO_SENHA', 'ALTERACAO_PERMISSAO', 'EDICAO_SISTEMA', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoAviso" AS ENUM ('GLOBAL', 'EQUIPE', 'INDIVIDUAL');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "nome_completo" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "telefone" TEXT,
    "url_foto" TEXT,
    "data_nascimento" DATE,
    "sexo" "Sexo",
    "permissoes" "Permissao"[] DEFAULT ARRAY['VOLUNTARIO']::"Permissao"[],
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens_redefinicao_senha" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "usado_em" TIMESTAMP(3),

    CONSTRAINT "tokens_redefinicao_senha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipes" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "equipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalas" (
    "id" UUID NOT NULL,
    "titulo" TEXT,
    "tipo" "TipoEscala" NOT NULL,
    "dia_semana" INTEGER,
    "data_hora" TIMESTAMP(3),
    "equipe_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escalas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voluntarios_escalas" (
    "id" UUID NOT NULL,
    "status" "StatusEscala" NOT NULL DEFAULT 'PENDENTE',
    "usuario_id" UUID NOT NULL,
    "escala_id" UUID NOT NULL,
    "atribuido_por_id" UUID,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voluntarios_escalas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordens_culto" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "data_culto" DATE NOT NULL,
    "conteudo_text" TEXT,
    "anexo_url" TEXT,
    "criador_id" UUID,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordens_culto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manuais" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "arquivo_url" TEXT NOT NULL,
    "equipe_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manuais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avisos" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "tipo" "TipoAviso" NOT NULL DEFAULT 'GLOBAL',
    "equipe_id" UUID,
    "criador_id" UUID,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs_auditoria" (
    "id" UUID NOT NULL,
    "acao" "AcaoAuditoria" NOT NULL,
    "descricao" TEXT,
    "ip_origem" TEXT,
    "usuario_id" UUID,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_UsuarioEquipes" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_UsuarioEquipes_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "equipes_nome_key" ON "equipes"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "voluntarios_escalas_usuario_id_escala_id_key" ON "voluntarios_escalas"("usuario_id", "escala_id");

-- CreateIndex
CREATE INDEX "_UsuarioEquipes_B_index" ON "_UsuarioEquipes"("B");

-- AddForeignKey
ALTER TABLE "tokens_redefinicao_senha" ADD CONSTRAINT "tokens_redefinicao_senha_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalas" ADD CONSTRAINT "escalas_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "equipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voluntarios_escalas" ADD CONSTRAINT "voluntarios_escalas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voluntarios_escalas" ADD CONSTRAINT "voluntarios_escalas_escala_id_fkey" FOREIGN KEY ("escala_id") REFERENCES "escalas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voluntarios_escalas" ADD CONSTRAINT "voluntarios_escalas_atribuido_por_id_fkey" FOREIGN KEY ("atribuido_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_culto" ADD CONSTRAINT "ordens_culto_criador_id_fkey" FOREIGN KEY ("criador_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manuais" ADD CONSTRAINT "manuais_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "equipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "equipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_criador_id_fkey" FOREIGN KEY ("criador_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs_auditoria" ADD CONSTRAINT "logs_auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UsuarioEquipes" ADD CONSTRAINT "_UsuarioEquipes_A_fkey" FOREIGN KEY ("A") REFERENCES "equipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UsuarioEquipes" ADD CONSTRAINT "_UsuarioEquipes_B_fkey" FOREIGN KEY ("B") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

const usuariosTeste = [
  {
    nomeCompleto: 'Admin Teste',
    email: 'admin@teste.com',
    senha: 'Admin@123',
    permissoes: ['ADMINISTRADOR'],
  },
  {
    nomeCompleto: 'Lider Teste',
    email: 'lider@teste.com',
    senha: 'Lider@123',
    permissoes: ['LIDER_EQUIPE'],
  },
  {
    nomeCompleto: 'Voluntario Teste',
    email: 'voluntario@teste.com',
    senha: 'Voluntario@123',
    permissoes: ['VOLUNTARIO'],
  },
];

async function main() {
  for (const usuario of usuariosTeste) {
    const senhaHash = await bcrypt.hash(usuario.senha, 10);

    await prisma.usuario.upsert({
      where: { email: usuario.email },
      update: {
        nomeCompleto: usuario.nomeCompleto,
        senhaHash,
        permissoes: usuario.permissoes,
      },
      create: {
        nomeCompleto: usuario.nomeCompleto,
        email: usuario.email,
        senhaHash,
        permissoes: usuario.permissoes,
      },
    });
  }

  console.log('Usuários de teste criados/atualizados com sucesso.');
}

main()
  .catch((error) => {
    console.error('Falha ao executar seed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

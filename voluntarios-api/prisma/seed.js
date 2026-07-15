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
    permissoes: ['LIDER_EQUIPE', 'VOLUNTARIO'],
  },
  {
    nomeCompleto: 'Voluntario Teste',
    email: 'voluntario@teste.com',
    senha: 'Voluntario@123',
    permissoes: ['VOLUNTARIO'],
  },
  {
    nomeCompleto: 'Ana Midia',
    email: 'ana.midia@teste.com',
    senha: 'Mcom@123',
    permissoes: ['VOLUNTARIO'],
  },
  {
    nomeCompleto: 'Bruno Iluminacao',
    email: 'bruno.iluminacao@teste.com',
    senha: 'Mcom@123',
    permissoes: ['VOLUNTARIO'],
  },
  {
    nomeCompleto: 'Carla Filmagem',
    email: 'carla.filmagem@teste.com',
    senha: 'Mcom@123',
    permissoes: ['VOLUNTARIO'],
  },
  {
    nomeCompleto: 'Diego Fotografia',
    email: 'diego.fotografia@teste.com',
    senha: 'Mcom@123',
    permissoes: ['VOLUNTARIO'],
  },
  {
    nomeCompleto: 'Elisa DTV',
    email: 'elisa.dtv@teste.com',
    senha: 'Mcom@123',
    permissoes: ['VOLUNTARIO'],
  },
  {
    nomeCompleto: 'Fabio Direcao',
    email: 'fabio.direcao@teste.com',
    senha: 'Mcom@123',
    permissoes: ['VOLUNTARIO'],
  },
  {
    nomeCompleto: 'Gabi Redes',
    email: 'gabi.redes@teste.com',
    senha: 'Mcom@123',
    permissoes: ['VOLUNTARIO'],
  },
];

const areasMCom = ['Midia', 'Iluminação', 'Filmagem', 'Fotografia', 'DTV', 'Direção', 'Redes Sociais'];
const voluntariosPorArea = {
  Midia: ['ana.midia@teste.com', 'voluntario@teste.com'],
  Iluminação: ['bruno.iluminacao@teste.com', 'voluntario@teste.com'],
  Filmagem: ['lider@teste.com', 'carla.filmagem@teste.com', 'voluntario@teste.com'],
  Fotografia: ['diego.fotografia@teste.com', 'voluntario@teste.com'],
  DTV: ['elisa.dtv@teste.com', 'voluntario@teste.com'],
  Direção: ['fabio.direcao@teste.com', 'voluntario@teste.com'],
  'Redes Sociais': ['gabi.redes@teste.com', 'voluntario@teste.com'],
};

function getPrimeiroDiaDoMes(diaSemana, semanaMes) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const datas = [];

  for (let dia = 1; dia <= 31; dia += 1) {
    const data = new Date(Date.UTC(ano, mes, dia, 18, 0, 0));

    if (data.getUTCMonth() !== mes) {
      break;
    }

    if (data.getUTCDay() === diaSemana) {
      datas.push(data);
    }
  }

  return datas[semanaMes - 1] || new Date(Date.UTC(ano, mes, 1, 18, 0, 0));
}

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

  const usuarios = await prisma.usuario.findMany({
    where: {
      email: {
        in: usuariosTeste.map((usuario) => usuario.email),
      },
    },
    orderBy: {
      nomeCompleto: 'asc',
    },
  });
  const voluntarios = usuarios.filter((usuario) => usuario.permissoes.includes('VOLUNTARIO'));
  const usuariosPorEmail = new Map(usuarios.map((usuario) => [usuario.email, usuario]));

  for (const nome of areasMCom) {
    const equipe = await prisma.equipe.upsert({
      where: { nome },
      update: {},
      create: { nome },
    });

    await prisma.equipe.update({
      where: { id: equipe.id },
      data: {
        voluntarios: {
          set: (voluntariosPorArea[nome] || [])
            .map((email) => usuariosPorEmail.get(email))
            .filter(Boolean)
            .map((usuario) => ({ id: usuario.id })),
        },
        lideres: {
          set: nome === 'Filmagem' && usuariosPorEmail.get('lider@teste.com')
            ? [{ id: usuariosPorEmail.get('lider@teste.com').id }]
            : [],
        },
      },
    });
  }

  const equipes = await prisma.equipe.findMany({
    where: {
      nome: {
        in: areasMCom,
      },
    },
    orderBy: {
      nome: 'asc',
    },
  });

  const recorrencias = [0, 6].flatMap((diaSemana) => (
    [1, 2, 3, 4].map((semanaMes) => ({
      diaSemana,
      semanaMes,
      dataHora: getPrimeiroDiaDoMes(diaSemana, semanaMes),
    }))
  ));

  for (const [indiceEquipe, equipe] of equipes.entries()) {
    for (const [indiceData, recorrencia] of recorrencias.entries()) {
      const titulo = `${equipe.nome} - ${recorrencia.diaSemana === 0 ? 'Domingo' : 'Sábado'} ${recorrencia.semanaMes}º`;
      const escalaExistente = await prisma.escala.findFirst({
        where: {
          equipeId: equipe.id,
          tipo: 'RECORRENTE',
          diaSemana: recorrencia.diaSemana,
          semanaMes: recorrencia.semanaMes,
        },
        select: {
          id: true,
        },
      });

      const escala = escalaExistente
        ? await prisma.escala.update({
          where: {
            id: escalaExistente.id,
          },
          data: {
            titulo,
            dataHora: recorrencia.dataHora,
          },
          select: {
            id: true,
          },
        })
        : await prisma.escala.create({
          data: {
            titulo,
            tipo: 'RECORRENTE',
            diaSemana: recorrencia.diaSemana,
            semanaMes: recorrencia.semanaMes,
            dataHora: recorrencia.dataHora,
            equipeId: equipe.id,
          },
          select: {
            id: true,
          },
        });

      await prisma.escala.deleteMany({
        where: {
          equipeId: equipe.id,
          tipo: 'ESPORADICA',
          titulo,
        },
      });

      const primeiro = voluntarios[(indiceEquipe + indiceData) % voluntarios.length];
      const segundo = voluntarios[(indiceEquipe + indiceData + 3) % voluntarios.length];

      for (const usuario of [primeiro, segundo]) {
        await prisma.voluntarioEscala.upsert({
          where: {
            usuarioId_escalaId: {
              usuarioId: usuario.id,
              escalaId: escala.id,
            },
          },
          update: {},
          create: {
            usuarioId: usuario.id,
            escalaId: escala.id,
            status: 'PENDENTE',
          },
        });
      }
    }
  }

  console.log('Usuários de teste criados/atualizados com sucesso.');
  console.log('Equipes e escalas MCom criadas/atualizadas com sucesso.');
}

main()
  .catch((error) => {
    console.error('Falha ao executar seed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

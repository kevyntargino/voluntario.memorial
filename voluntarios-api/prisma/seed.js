import 'dotenv/config';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const usuariosSeed = [
  { nomeCompleto: 'Admin Teste', email: 'admin@teste.com', senha: 'Admin@123', permissoes: ['ADMINISTRADOR'], telefone: '5567999990001' },
  { nomeCompleto: 'Lider Teste', email: 'lider@teste.com', senha: 'Lider@123', permissoes: ['LIDER_EQUIPE', 'VOLUNTARIO'], telefone: '5567999990002' },
  { nomeCompleto: 'Voluntario Teste', email: 'voluntario@teste.com', senha: 'Voluntario@123', permissoes: ['VOLUNTARIO'], telefone: '5567999990003' },
  { nomeCompleto: 'Ana Midia', email: 'ana.midia@teste.com', senha: 'Mcom@123', permissoes: ['VOLUNTARIO'], telefone: '5567999990101' },
  { nomeCompleto: 'Caio Midia', email: 'caio.midia@teste.com', senha: 'Mcom@123', permissoes: ['VOLUNTARIO'], telefone: '5567999990102' },
  { nomeCompleto: 'Bruno Iluminacao', email: 'bruno.iluminacao@teste.com', senha: 'Mcom@123', permissoes: ['VOLUNTARIO'], telefone: '5567999990201' },
  { nomeCompleto: 'Luiza Iluminacao', email: 'luiza.iluminacao@teste.com', senha: 'Mcom@123', permissoes: ['VOLUNTARIO'], telefone: '5567999990202' },
  { nomeCompleto: 'Carla Filmagem', email: 'carla.filmagem@teste.com', senha: 'Mcom@123', permissoes: ['VOLUNTARIO'], telefone: '5567999990301' },
  { nomeCompleto: 'Marcos Filmagem', email: 'marcos.filmagem@teste.com', senha: 'Mcom@123', permissoes: ['VOLUNTARIO'], telefone: '5567999990302' },
  { nomeCompleto: 'Diego Fotografia', email: 'diego.fotografia@teste.com', senha: 'Mcom@123', permissoes: ['VOLUNTARIO'], telefone: '5567999990401' },
  { nomeCompleto: 'Nina Fotografia', email: 'nina.fotografia@teste.com', senha: 'Mcom@123', permissoes: ['VOLUNTARIO'], telefone: '5567999990402' },
  { nomeCompleto: 'Elisa DTV', email: 'elisa.dtv@teste.com', senha: 'Mcom@123', permissoes: ['VOLUNTARIO'], telefone: '5567999990501' },
  { nomeCompleto: 'Rafael DTV', email: 'rafael.dtv@teste.com', senha: 'Mcom@123', permissoes: ['VOLUNTARIO'], telefone: '5567999990502' },
  { nomeCompleto: 'Fabio Direcao', email: 'fabio.direcao@teste.com', senha: 'Mcom@123', permissoes: ['VOLUNTARIO'], telefone: '5567999990601' },
  { nomeCompleto: 'Iara Direcao', email: 'iara.direcao@teste.com', senha: 'Mcom@123', permissoes: ['VOLUNTARIO'], telefone: '5567999990602' },
  { nomeCompleto: 'Gabi Redes', email: 'gabi.redes@teste.com', senha: 'Mcom@123', permissoes: ['VOLUNTARIO'], telefone: '5567999990701' },
  { nomeCompleto: 'Pedro Redes', email: 'pedro.redes@teste.com', senha: 'Mcom@123', permissoes: ['VOLUNTARIO'], telefone: '5567999990702' },
];

const equipesSeed = [
  { nome: 'Midia', voluntarios: ['lider@teste.com', 'voluntario@teste.com', 'ana.midia@teste.com', 'caio.midia@teste.com'], lider: true },
  { nome: 'Iluminação', voluntarios: ['voluntario@teste.com', 'bruno.iluminacao@teste.com', 'luiza.iluminacao@teste.com'], lider: true },
  { nome: 'Filmagem', voluntarios: ['lider@teste.com', 'voluntario@teste.com', 'carla.filmagem@teste.com', 'marcos.filmagem@teste.com'], lider: true },
  { nome: 'Fotografia', voluntarios: ['lider@teste.com', 'voluntario@teste.com', 'diego.fotografia@teste.com', 'nina.fotografia@teste.com'], lider: true },
  { nome: 'DTV', voluntarios: ['voluntario@teste.com', 'elisa.dtv@teste.com', 'rafael.dtv@teste.com'], lider: true },
  { nome: 'Direção', voluntarios: ['voluntario@teste.com', 'fabio.direcao@teste.com', 'iara.direcao@teste.com'], lider: true },
  { nome: 'Redes Sociais', voluntarios: ['voluntario@teste.com', 'gabi.redes@teste.com', 'pedro.redes@teste.com'], lider: true },
];
const todasEquipes = equipesSeed.map((equipe) => equipe.nome);
const localCultos = 'Espaço alternativo';

const DIA_MS = 86400000;

function dataUtc(ano, mes, dia, horas, minutos = 0) {
  return new Date(Date.UTC(ano, mes, dia, horas, minutos, 0, 0));
}

function adicionarDias(data, dias, horas = data.getUTCHours(), minutos = data.getUTCMinutes()) {
  return dataUtc(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate() + dias, horas, minutos);
}

function proximoDiaSemana(referencia, diaSemana, horas, minutos = 0, deslocamentoMinimo = 0) {
  const inicio = adicionarDias(referencia, deslocamentoMinimo, horas, minutos);
  const diferenca = (diaSemana - inicio.getUTCDay() + 7) % 7;
  return adicionarDias(inicio, diferenca, horas, minutos);
}

function ocorrenciasSemanais(inicio, fim) {
  const datas = [];
  for (let atual = new Date(inicio); atual <= fim; atual = new Date(atual.getTime() + 7 * DIA_MS)) datas.push(atual);
  return datas;
}

function janelaSemanal(agora, diaSemana, horas, minutos = 0) {
  const inicio = proximoDiaSemana(adicionarDias(agora, -90, horas, minutos), diaSemana, horas, minutos);
  const fim = proximoDiaSemana(adicionarDias(agora, 60, horas, minutos), diaSemana, horas, minutos);
  return ocorrenciasSemanais(inicio, fim);
}

async function limparBanco() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "notificacoes", "web_push_subscriptions", "avisos_visualizacoes", "avisos_destinatarios",
      "avisos", "manuais", "ordens_culto", "voluntarios_escalas", "escalas", "eventos",
      "equipes", "tokens_redefinicao_senha", "logs_auditoria", "usuarios"
    RESTART IDENTITY CASCADE
  `);
}

async function criarUsuarios() {
  const resultado = new Map();
  for (const usuario of usuariosSeed) {
    const criado = await prisma.usuario.create({
      data: {
        nomeCompleto: usuario.nomeCompleto,
        email: usuario.email,
        senhaHash: await bcrypt.hash(usuario.senha, 10),
        permissoes: usuario.permissoes,
        telefone: usuario.telefone,
      },
    });
    resultado.set(criado.email, criado);
  }
  return resultado;
}

async function criarEquipes(usuarios) {
  const resultado = new Map();
  const lider = usuarios.get('lider@teste.com');

  for (const definicao of equipesSeed) {
    const equipe = await prisma.equipe.create({
      data: {
        nome: definicao.nome,
        voluntarios: { connect: definicao.voluntarios.map((email) => ({ id: usuarios.get(email).id })) },
        lideres: definicao.lider ? { connect: { id: lider.id } } : undefined,
      },
      include: { voluntarios: true },
    });
    resultado.set(equipe.nome, equipe);
  }
  return resultado;
}

function montarEventos(agora) {
  return [
    {
      titulo: 'Culto dos Conectados - Sábado 19h', tipo: 'RECORRENTE', frequencia: 'SEMANAL',
      local: localCultos, descricao: 'Culto dos Conectados realizado todos os sábados às 19h.',
      diaSemana: 6, semanaMes: null,
      datas: janelaSemanal(agora, 6, 19), equipes: todasEquipes,
    },
    {
      titulo: 'Culto da Manhã - Domingo 10h15', tipo: 'RECORRENTE', frequencia: 'SEMANAL',
      local: localCultos, descricao: 'Culto da manhã realizado todos os domingos às 10h15.',
      diaSemana: 0, semanaMes: null,
      datas: janelaSemanal(agora, 0, 10, 15), equipes: todasEquipes,
    },
    {
      titulo: 'Culto de Celebração - Domingo 18h', tipo: 'RECORRENTE', frequencia: 'SEMANAL',
      local: localCultos, descricao: 'Culto de celebração realizado todos os domingos às 18h.',
      diaSemana: 0, semanaMes: null,
      datas: janelaSemanal(agora, 0, 18), equipes: todasEquipes,
    },
  ];
}

async function criarEventoComEscalas(definicao, equipes, admin) {
  const eventoId = randomUUID();
  const evento = await prisma.evento.create({
    data: {
      id: eventoId,
      titulo: definicao.titulo,
      local: definicao.local,
      descricao: definicao.descricao,
      tipo: definicao.tipo,
      frequencia: definicao.frequencia,
      dataInicio: definicao.datas[0],
      dataFim: definicao.dataFim || null,
      diaSemana: definicao.diaSemana,
      semanaMes: definicao.semanaMes,
      equipes: { connect: definicao.equipes.map((nome) => ({ id: equipes.get(nome).id })) },
    },
  });

  const agora = new Date();
  const modelos = [];
  const escalas = [];
  const participacoes = [];

  for (const nomeEquipe of definicao.equipes) {
    const equipe = equipes.get(nomeEquipe);

    for (const semanaMes of [1, 2, 3, 4, 5]) {
      for (const membro of equipe.voluntarios) {
        modelos.push({
          id: randomUUID(),
          eventoId: evento.id,
          equipeId: equipe.id,
          semanaMes,
          usuarioId: membro.id,
        });
      }
    }
  }

  for (const dataHora of definicao.datas) {
    for (const nomeEquipe of definicao.equipes) {
      const equipe = equipes.get(nomeEquipe);
      const escalaId = randomUUID();
      const passada = dataHora < agora;

      escalas.push({
        id: escalaId,
        eventoId: evento.id,
        titulo: evento.titulo,
        local: evento.local,
        descricao: evento.descricao,
        tipo: evento.tipo,
        dataHora,
        solicitadaPeloAdmin: true,
        equipeId: equipe.id,
      });

      for (const membro of equipe.voluntarios) {
        participacoes.push({
          usuarioId: membro.id,
          escalaId,
          atribuidoPorId: admin.id,
          status: passada ? 'CONFIRMADA' : 'PENDENTE',
          dataOcorrenciaStatus: dataHora,
        });
      }
    }
  }

  await prisma.escalaModeloVoluntario.createMany({ data: modelos });
  await prisma.escala.createMany({ data: escalas });
  await prisma.voluntarioEscala.createMany({ data: participacoes });

  return evento;
}

async function main() {
  await limparBanco();
  const usuarios = await criarUsuarios();
  const equipes = await criarEquipes(usuarios);
  const eventos = montarEventos(new Date());
  const admin = usuarios.get('admin@teste.com');

  for (const evento of eventos) {
    await criarEventoComEscalas(evento, equipes, admin);
  }

  const totais = await Promise.all([
    prisma.usuario.count(), prisma.equipe.count(), prisma.evento.count(),
    prisma.escala.count(), prisma.voluntarioEscala.count(),
  ]);

  console.log(`Seed concluído: ${totais[0]} usuários, ${totais[1]} equipes, ${totais[2]} eventos, ${totais[3]} escalas e ${totais[4]} participações.`);
  console.log('Acessos preservados: admin@teste.com, lider@teste.com e voluntario@teste.com.');
}

main()
  .catch((error) => {
    console.error('Falha ao executar seed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

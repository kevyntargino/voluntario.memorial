import 'dotenv/config';
import bcrypt from 'bcrypt';
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
  { nome: 'Iluminação', voluntarios: ['voluntario@teste.com', 'bruno.iluminacao@teste.com', 'luiza.iluminacao@teste.com'] },
  { nome: 'Filmagem', voluntarios: ['lider@teste.com', 'voluntario@teste.com', 'carla.filmagem@teste.com', 'marcos.filmagem@teste.com'], lider: true },
  { nome: 'Fotografia', voluntarios: ['lider@teste.com', 'voluntario@teste.com', 'diego.fotografia@teste.com', 'nina.fotografia@teste.com'], lider: true },
  { nome: 'DTV', voluntarios: ['voluntario@teste.com', 'elisa.dtv@teste.com', 'rafael.dtv@teste.com'] },
  { nome: 'Direção', voluntarios: ['voluntario@teste.com', 'fabio.direcao@teste.com', 'iara.direcao@teste.com'] },
  { nome: 'Redes Sociais', voluntarios: ['voluntario@teste.com', 'gabi.redes@teste.com', 'pedro.redes@teste.com'] },
];

const DIA_MS = 86400000;

function dataUtc(ano, mes, dia, horas, minutos = 0) {
  return new Date(Date.UTC(ano, mes, dia, horas, minutos, 0, 0));
}

function adicionarDias(data, dias, horas = data.getUTCHours(), minutos = data.getUTCMinutes()) {
  return dataUtc(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate() + dias, horas, minutos);
}

function proximoDiaSemana(referencia, diaSemana, horas, deslocamentoMinimo = 0) {
  const inicio = adicionarDias(referencia, deslocamentoMinimo, horas);
  const diferenca = (diaSemana - inicio.getUTCDay() + 7) % 7;
  return adicionarDias(inicio, diferenca, horas);
}

function ocorrenciasSemanais(inicio, fim) {
  const datas = [];
  for (let atual = new Date(inicio); atual <= fim; atual = new Date(atual.getTime() + 7 * DIA_MS)) datas.push(atual);
  return datas;
}

function ocorrenciaMensal(ano, mes, diaSemana, semanaMes, horas) {
  const encontradas = [];
  for (let dia = 1; dia <= 31; dia += 1) {
    const data = dataUtc(ano, mes, dia, horas);
    if (data.getUTCMonth() !== mes) break;
    if (data.getUTCDay() === diaSemana) encontradas.push(data);
  }
  return encontradas[semanaMes - 1] || null;
}

function ocorrenciasMensais(referencia, mesesAntes, mesesDepois, diaSemana, semanaMes, horas) {
  const datas = [];
  for (let offset = -mesesAntes; offset <= mesesDepois; offset += 1) {
    const base = dataUtc(referencia.getUTCFullYear(), referencia.getUTCMonth() + offset, 1, horas);
    const data = ocorrenciaMensal(base.getUTCFullYear(), base.getUTCMonth(), diaSemana, semanaMes, horas);
    if (data) datas.push(data);
  }
  return datas;
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
  const domingoPassado = proximoDiaSemana(adicionarDias(agora, -90, 18), 0, 18);
  const domingoFuturo = proximoDiaSemana(adicionarDias(agora, 60, 18), 0, 18);
  const sabadosMensais = ocorrenciasMensais(agora, 2, 2, 6, 2, 19);
  const conferenciaInicio = proximoDiaSemana(agora, 3, 19, 5);
  const conferenciaFim = adicionarDias(conferenciaInicio, 21, 19);
  const noiteLouvor = proximoDiaSemana(agora, 5, 20, 8);
  const workshopPassado = adicionarDias(agora, -21, 14);

  return [
    {
      titulo: 'Culto de Celebração - Domingo 18h', tipo: 'RECORRENTE', frequencia: 'SEMANAL',
      local: 'Templo Principal', descricao: 'Celebração semanal da igreja.', diaSemana: 0, semanaMes: null,
      datas: ocorrenciasSemanais(domingoPassado, domingoFuturo), equipes: equipesSeed.map((item) => item.nome),
    },
    {
      titulo: 'Encontro MCom - Segundo Sábado', tipo: 'RECORRENTE', frequencia: 'MENSAL',
      local: 'Auditório', descricao: 'Encontro mensal de alinhamento e capacitação.', diaSemana: 6, semanaMes: 2,
      datas: sabadosMensais, equipes: ['Midia', 'Filmagem', 'Fotografia', 'Redes Sociais'],
    },
    {
      titulo: 'Conferência MCom', tipo: 'ESPORADICA', frequencia: 'SEMANAL',
      local: 'Templo Principal', descricao: 'Série especial de quatro noites da conferência.',
      diaSemana: conferenciaInicio.getUTCDay(), semanaMes: null,
      datas: ocorrenciasSemanais(conferenciaInicio, conferenciaFim), equipes: equipesSeed.map((item) => item.nome),
      dataFim: conferenciaFim,
    },
    {
      titulo: 'Noite de Louvor', tipo: 'ESPORADICA', frequencia: 'NAO_REPETE',
      local: 'Templo Principal', descricao: 'Evento especial de louvor e adoração.',
      diaSemana: noiteLouvor.getUTCDay(), semanaMes: null,
      datas: [noiteLouvor], equipes: ['Midia', 'Iluminação', 'Filmagem', 'Fotografia', 'DTV'],
    },
    {
      titulo: 'Workshop de Fotografia', tipo: 'ESPORADICA', frequencia: 'NAO_REPETE',
      local: 'Sala Criativa', descricao: 'Evento passado para validar o histórico de escalas.',
      diaSemana: workshopPassado.getUTCDay(), semanaMes: null,
      datas: [workshopPassado], equipes: ['Fotografia', 'Redes Sociais'],
    },
  ];
}

async function criarEventoComEscalas(definicao, equipes, admin, indiceEvento) {
  const evento = await prisma.evento.create({
    data: {
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

  let indiceEscala = 0;
  for (const dataHora of definicao.datas) {
    for (const nomeEquipe of definicao.equipes) {
      const equipe = equipes.get(nomeEquipe);
      const escala = await prisma.escala.create({
        data: {
          eventoId: evento.id,
          titulo: evento.titulo,
          local: evento.local,
          descricao: evento.descricao,
          tipo: evento.tipo,
          dataHora,
          solicitadaPeloAdmin: true,
          equipeId: equipe.id,
        },
      });

      const membros = equipe.voluntarios;
      const primeiro = membros[(indiceEscala + indiceEvento) % membros.length];
      const segundo = membros[(indiceEscala + indiceEvento + 1) % membros.length];
      const passada = dataHora < new Date();
      const ausencia = passada && indiceEscala % 13 === 0;
      const pediuSubstituicao = passada && !ausencia && indiceEscala % 9 === 0;

      await prisma.voluntarioEscala.create({
        data: {
          usuarioId: primeiro.id,
          escalaId: escala.id,
          atribuidoPorId: admin.id,
          status: ausencia ? 'AUSENTE' : pediuSubstituicao ? 'PEDIU_SUBSTITUICAO' : passada || indiceEscala % 3 === 0 ? 'CONFIRMADA' : 'PENDENTE',
          dataOcorrenciaStatus: dataHora,
          justificativaSubstituicao: ausencia
            ? 'Ausência registrada para teste do histórico.'
            : pediuSubstituicao ? 'Compromisso familiar informado com antecedência.' : null,
          dataOcorrenciaSubstituicao: ausencia || pediuSubstituicao ? dataHora : null,
        },
      });

      if ((ausencia || pediuSubstituicao) && segundo.id !== primeiro.id) {
        await prisma.voluntarioEscala.create({
          data: {
            usuarioId: segundo.id,
            escalaId: escala.id,
            atribuidoPorId: admin.id,
            status: 'CONFIRMADA',
            dataOcorrenciaStatus: dataHora,
            substituto: true,
            dataOcorrenciaSubstituicao: dataHora,
          },
        });
      } else if (segundo.id !== primeiro.id && indiceEscala % 2 === 0) {
        await prisma.voluntarioEscala.create({
          data: {
            usuarioId: segundo.id,
            escalaId: escala.id,
            atribuidoPorId: admin.id,
            status: passada ? 'CONFIRMADA' : 'PENDENTE',
            dataOcorrenciaStatus: dataHora,
          },
        });
      }

      indiceEscala += 1;
    }
  }

  return evento;
}

async function main() {
  await limparBanco();
  const usuarios = await criarUsuarios();
  const equipes = await criarEquipes(usuarios);
  const eventos = montarEventos(new Date());
  const admin = usuarios.get('admin@teste.com');

  for (const [indice, evento] of eventos.entries()) {
    await criarEventoComEscalas(evento, equipes, admin, indice);
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

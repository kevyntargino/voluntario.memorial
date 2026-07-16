import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gerarNotificacoesAutomaticas,
  getStatusParticipacaoNaOcorrencia,
  notificarNovaEscalaAdmin,
} from '../services/notificacoes.service.js';

function criarPrisma(participacoes = []) {
  const criadas = [];

  return {
    criadas,
    voluntarioEscala: {
      findMany: async () => participacoes,
    },
    notificacao: {
      create: async ({ data }) => {
        const notificacao = { id: `notificacao-${criadas.length + 1}`, ...data };
        criadas.push(notificacao);
        return notificacao;
      },
    },
  };
}

function criarParticipacao({
  id = 'participacao-1',
  usuarioId = 'voluntario-1',
  nome = 'Voluntário Um',
  status = 'PENDENTE',
  dataHora = '2026-07-21T18:00:00.000Z',
  tipo = 'ESPORADICA',
  dataOcorrenciaStatus = null,
  lideres = [{ id: 'lider-1' }],
} = {}) {
  return {
    id,
    usuarioId,
    status,
    dataOcorrenciaStatus,
    usuario: { id: usuarioId, nomeCompleto: nome },
    escala: {
      id: 'escala-1',
      titulo: 'Culto',
      tipo,
      dataHora: new Date(dataHora),
      diaSemana: tipo === 'RECORRENTE' ? 0 : null,
      semanaMes: tipo === 'RECORRENTE' ? 3 : null,
      equipe: {
        id: 'equipe-1',
        nome: 'Filmagem',
        lideres,
      },
    },
  };
}

test('gera pedido individual de confirmação 5 dias antes', async () => {
  const prisma = criarPrisma([criarParticipacao()]);

  const resultado = await gerarNotificacoesAutomaticas(
    prisma,
    new Date('2026-07-16T10:00:00.000Z'),
  );

  assert.equal(resultado.count, 1);
  assert.equal(prisma.criadas[0].usuarioId, 'voluntario-1');
  assert.equal(prisma.criadas[0].tipo, 'CONFIRMACAO_ESCALA');
  assert.match(prisma.criadas[0].chave, /^confirmacao:5d:/);
});

test('repete o pedido individual de confirmação 3 dias antes', async () => {
  const prisma = criarPrisma([criarParticipacao({ dataHora: '2026-07-19T18:00:00.000Z' })]);

  await gerarNotificacoesAutomaticas(prisma, new Date('2026-07-16T10:00:00.000Z'));

  assert.equal(prisma.criadas.length, 1);
  assert.equal(prisma.criadas[0].usuarioId, 'voluntario-1');
  assert.match(prisma.criadas[0].chave, /^confirmacao:3d:/);
});

test('agrupa pendências da mesma escala para o líder 4 dias antes', async () => {
  const participacoes = [
    criarParticipacao({ id: 'participacao-1', dataHora: '2026-07-20T18:00:00.000Z' }),
    criarParticipacao({
      id: 'participacao-2',
      usuarioId: 'voluntario-2',
      nome: 'Voluntário Dois',
      dataHora: '2026-07-20T18:00:00.000Z',
    }),
  ];
  const prisma = criarPrisma(participacoes);

  const resultado = await gerarNotificacoesAutomaticas(
    prisma,
    new Date('2026-07-16T10:00:00.000Z'),
  );

  assert.equal(resultado.count, 1);
  assert.equal(prisma.criadas[0].usuarioId, 'lider-1');
  assert.equal(prisma.criadas[0].tipo, 'ALERTA_LIDER');
  assert.match(prisma.criadas[0].titulo, /^2 confirmações pendentes$/);
  assert.match(prisma.criadas[0].chave, /^lider-pendentes:4d:/);
});

test('repete o alerta agregado para o líder 2 dias antes', async () => {
  const prisma = criarPrisma([criarParticipacao({ dataHora: '2026-07-18T18:00:00.000Z' })]);

  await gerarNotificacoesAutomaticas(prisma, new Date('2026-07-16T10:00:00.000Z'));

  assert.equal(prisma.criadas.length, 1);
  assert.equal(prisma.criadas[0].usuarioId, 'lider-1');
  assert.match(prisma.criadas[0].chave, /^lider-pendentes:2d:/);
});

test('não lembra voluntário que já confirmou a ocorrência', async () => {
  const dataHora = '2026-07-19T18:00:00.000Z';
  const prisma = criarPrisma([criarParticipacao({
    status: 'CONFIRMADA',
    dataHora,
    dataOcorrenciaStatus: new Date(dataHora),
  })]);

  const resultado = await gerarNotificacoesAutomaticas(
    prisma,
    new Date('2026-07-16T10:00:00.000Z'),
  );

  assert.equal(resultado.count, 0);
});

test('confirmação de recorrência anterior não confirma a ocorrência atual', () => {
  const participacao = criarParticipacao({
    tipo: 'RECORRENTE',
    status: 'CONFIRMADA',
    dataOcorrenciaStatus: new Date('2026-06-21T18:00:00.000Z'),
  });

  assert.equal(
    getStatusParticipacaoNaOcorrencia(participacao, new Date('2026-07-19T18:00:00.000Z')),
    'PENDENTE',
  );
});

test('notifica somente os líderes da equipe requisitada em nova escala', async () => {
  const prisma = criarPrisma();

  const resultado = await notificarNovaEscalaAdmin(prisma, {
    escalas: [{
      id: 'escala-admin-1',
      titulo: 'Conferência',
      tipo: 'ESPORADICA',
      dataHora: new Date('2026-07-25T19:00:00.000Z'),
      equipe: {
        id: 'equipe-1',
        nome: 'Filmagem',
        lideres: [{ id: 'lider-1' }, { id: 'lider-2' }],
      },
    }],
  });

  assert.equal(resultado.count, 2);
  assert.deepEqual(prisma.criadas.map((item) => item.usuarioId), ['lider-1', 'lider-2']);
  assert.ok(prisma.criadas.every((item) => item.link.includes('escala=escala-admin-1')));
});

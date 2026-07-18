import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  gerarNotificacoesAutomaticas,
  getStatusParticipacaoNaOcorrencia,
  notificarConfirmacaoEscala,
  notificarNovaEscalaAdmin,
  notificarOrdemCulto,
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

test('o enum TipoNotificacao cobre todos os tipos emitidos pelo serviço', () => {
  const schema = readFileSync(
    fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url)),
    'utf8',
  );
  const bloco = schema.match(/enum TipoNotificacao \{([^}]*)\}/);

  assert.ok(bloco, 'enum TipoNotificacao não encontrado no schema.prisma');

  const valoresEnum = new Set(
    bloco[1]
      .split('\n')
      .map((linha) => linha.trim())
      .filter((linha) => linha && !linha.startsWith('//')),
  );

  // Todos os `tipo` usados em services/notificacoes.service.js precisam existir no enum,
  // senão o prisma.notificacao.create falha em produção (ex.: ORDEM_CULTO).
  const tiposEmitidos = ['CONFIRMACAO_ESCALA', 'LEMBRETE_ESCALA', 'AVISO', 'SUBSTITUTO', 'ALERTA_LIDER', 'ORDEM_CULTO'];

  for (const tipo of tiposEmitidos) {
    assert.ok(valoresEnum.has(tipo), `TipoNotificacao não contém "${tipo}"`);
  }
});

test('gera pedido individual de confirmação 5 dias antes', async () => {
  const prisma = criarPrisma([criarParticipacao()]);

  const resultado = await gerarNotificacoesAutomaticas(
    prisma,
    new Date('2026-07-16T10:00:00.000Z'),
  );

  assert.equal(resultado.count, 1);
  assert.equal(prisma.criadas[0].usuarioId, 'voluntario-1');
  assert.equal(prisma.criadas[0].tipo, 'CONFIRMACAO_ESCALA');
  assert.equal(
    prisma.criadas[0].link,
    '/?abrirProximaEscala=1&proximaParticipacao=participacao-1&dataOcorrencia=2026-07-21T18%3A00%3A00.000Z',
  );
  assert.match(prisma.criadas[0].chave, /^confirmacao:5d:/);
});

test('repete o pedido individual de confirmação 3 dias antes', async () => {
  const prisma = criarPrisma([criarParticipacao({ dataHora: '2026-07-19T18:00:00.000Z' })]);

  await gerarNotificacoesAutomaticas(prisma, new Date('2026-07-16T10:00:00.000Z'));

  assert.equal(prisma.criadas.length, 1);
  assert.equal(prisma.criadas[0].usuarioId, 'voluntario-1');
  assert.equal(
    prisma.criadas[0].link,
    '/?abrirProximaEscala=1&proximaParticipacao=participacao-1&dataOcorrencia=2026-07-19T18%3A00%3A00.000Z',
  );
  assert.match(prisma.criadas[0].chave, /^confirmacao:3d:/);
});

test('lembra o voluntário 1 dia antes da escala', async () => {
  const prisma = criarPrisma([criarParticipacao({ dataHora: '2026-07-17T18:00:00.000Z' })]);

  const resultado = await gerarNotificacoesAutomaticas(
    prisma,
    new Date('2026-07-16T10:00:00.000Z'),
  );

  assert.equal(resultado.count, 1);
  assert.equal(prisma.criadas[0].usuarioId, 'voluntario-1');
  assert.equal(prisma.criadas[0].tipo, 'LEMBRETE_ESCALA');
  assert.equal(prisma.criadas[0].titulo, 'Sua escala é amanhã');
  assert.equal(
    prisma.criadas[0].link,
    '/?abrirProximaEscala=1&proximaParticipacao=participacao-1&dataOcorrencia=2026-07-17T18%3A00%3A00.000Z',
  );
  assert.match(prisma.criadas[0].chave, /^lembrete-escala:1d:/);
});

test('lembra o voluntário confirmado 1 dia antes da escala', async () => {
  const dataHora = '2026-07-17T18:00:00.000Z';
  const prisma = criarPrisma([criarParticipacao({
    status: 'CONFIRMADA',
    dataHora,
    dataOcorrenciaStatus: new Date(dataHora),
  })]);

  const resultado = await gerarNotificacoesAutomaticas(
    prisma,
    new Date('2026-07-16T10:00:00.000Z'),
  );

  assert.equal(resultado.count, 1);
  assert.equal(prisma.criadas[0].tipo, 'LEMBRETE_ESCALA');
  assert.match(prisma.criadas[0].mensagem, /Filmagem/);
});

test('não lembra quem pediu substituição 1 dia antes da escala', async () => {
  const dataHora = '2026-07-17T18:00:00.000Z';
  const prisma = criarPrisma([criarParticipacao({
    status: 'PEDIU_SUBSTITUICAO',
    dataHora,
    dataOcorrenciaStatus: new Date(dataHora),
  })]);

  const resultado = await gerarNotificacoesAutomaticas(
    prisma,
    new Date('2026-07-16T10:00:00.000Z'),
  );

  assert.equal(resultado.count, 0);
  assert.equal(prisma.criadas.length, 0);
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
      dataHora: new Date('2099-07-25T19:00:00.000Z'),
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

test('notifica os líderes quando o voluntário confirma uma escala futura', async () => {
  const prisma = criarPrisma();
  const participacao = criarParticipacao({
    dataHora: '2099-07-25T19:00:00.000Z',
    lideres: [{ id: 'lider-1' }, { id: 'lider-2' }],
  });

  const resultado = await notificarConfirmacaoEscala(prisma, {
    participacao,
    dataOcorrencia: new Date('2099-07-25T19:00:00.000Z'),
  });

  assert.equal(resultado.count, 2);
  assert.deepEqual(prisma.criadas.map((item) => item.usuarioId), ['lider-1', 'lider-2']);
  assert.ok(prisma.criadas.every((item) => item.titulo === 'Escala confirmada'));
  assert.ok(prisma.criadas.every((item) => item.chave.includes(participacao.id)));
});

test('não notifica confirmação de escala passada', async () => {
  const prisma = criarPrisma();
  const participacao = criarParticipacao({ dataHora: '2020-07-25T19:00:00.000Z' });

  const resultado = await notificarConfirmacaoEscala(prisma, {
    participacao,
    dataOcorrencia: new Date('2020-07-25T19:00:00.000Z'),
  });

  assert.equal(resultado.count, 0);
});

test('não gera lembretes nem pendências para escala passada', async () => {
  const prisma = criarPrisma([criarParticipacao({ dataHora: '2026-07-15T18:00:00.000Z' })]);

  const resultado = await gerarNotificacoesAutomaticas(
    prisma,
    new Date('2026-07-16T10:00:00.000Z'),
  );

  assert.equal(resultado.count, 0);
  assert.equal(prisma.criadas.length, 0);
});

test('notifica uma vez cada voluntário quando a ordem de culto é publicada', async () => {
  const prisma = criarPrisma();
  const dataHora = new Date('2099-07-25T19:00:00.000Z');

  const resultado = await notificarOrdemCulto(prisma, {
    ordem: {
      id: 'ordem-1',
      eventoId: 'evento-1',
      dataHora,
      arquivoKey: 'ordens-culto/evento-1/arquivo.pdf',
    },
    eventoTitulo: 'Culto de Celebração',
    usuarioIds: ['voluntario-1', 'voluntario-2', 'voluntario-1'],
  });

  assert.equal(resultado.count, 2);
  assert.deepEqual(prisma.criadas.map((item) => item.usuarioId), ['voluntario-1', 'voluntario-2']);
  assert.ok(prisma.criadas.every((item) => item.tipo === 'ORDEM_CULTO'));
  assert.ok(prisma.criadas.every((item) => item.link.includes('evento=evento-1')));
  assert.ok(prisma.criadas.every((item) => item.link.includes(encodeURIComponent(dataHora.toISOString()))));
});

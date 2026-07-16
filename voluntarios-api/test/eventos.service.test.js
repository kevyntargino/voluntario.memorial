import test from 'node:test';
import assert from 'node:assert/strict';
import {
  garantirOcorrenciasEventos,
  gerarDatasEvento,
  getInicioHistoricoEscalas,
  getLimiteEscalasFuturas,
} from '../services/eventos.service.js';

test('evento sem repetição gera somente a data inicial', () => {
  const dataInicio = new Date('2026-08-09T18:00:00.000Z');
  const datas = gerarDatasEvento({ frequencia: 'NAO_REPETE', dataInicio });

  assert.deepEqual(datas, [dataInicio]);
});

test('evento semanal gera uma ocorrência a cada sete dias até a data final', () => {
  const datas = gerarDatasEvento({
    frequencia: 'SEMANAL',
    dataInicio: new Date('2026-08-02T18:00:00.000Z'),
    dataFim: new Date('2026-08-23T23:59:00.000Z'),
  });

  assert.deepEqual(datas.map((data) => data.toISOString()), [
    '2026-08-02T18:00:00.000Z',
    '2026-08-09T18:00:00.000Z',
    '2026-08-16T18:00:00.000Z',
    '2026-08-23T18:00:00.000Z',
  ]);
});

test('evento semanal pode acontecer em uma quarta-feira', () => {
  const datas = gerarDatasEvento({
    frequencia: 'SEMANAL',
    dataInicio: new Date('2026-08-05T19:30:00.000Z'),
    dataFim: new Date('2026-08-26T23:59:00.000Z'),
  });

  assert.deepEqual(datas.map((data) => data.toISOString()), [
    '2026-08-05T19:30:00.000Z',
    '2026-08-12T19:30:00.000Z',
    '2026-08-19T19:30:00.000Z',
    '2026-08-26T19:30:00.000Z',
  ]);
});

test('evento mensal respeita o domingo e a semana definidos', () => {
  const datas = gerarDatasEvento({
    frequencia: 'MENSAL',
    dataInicio: new Date('2026-08-09T18:00:00.000Z'),
    dataFim: new Date('2026-10-31T23:59:00.000Z'),
    diaSemana: 0,
    semanaMes: 2,
  });

  assert.deepEqual(datas.map((data) => data.toISOString()), [
    '2026-08-09T18:00:00.000Z',
    '2026-09-13T18:00:00.000Z',
    '2026-10-11T18:00:00.000Z',
  ]);
});

test('evento mensal pode acontecer na segunda quarta-feira', () => {
  const datas = gerarDatasEvento({
    frequencia: 'MENSAL',
    dataInicio: new Date('2026-08-12T19:30:00.000Z'),
    dataFim: new Date('2026-10-31T23:59:00.000Z'),
    diaSemana: 3,
    semanaMes: 2,
  });

  assert.deepEqual(datas.map((data) => data.toISOString()), [
    '2026-08-12T19:30:00.000Z',
    '2026-09-09T19:30:00.000Z',
    '2026-10-14T19:30:00.000Z',
  ]);
});

test('janelas de escalas abrangem 60 dias futuros e 90 dias de histórico', () => {
  const agora = new Date('2026-07-16T10:30:00.000Z');

  assert.equal(getLimiteEscalasFuturas(agora).toISOString(), '2026-09-14T23:59:59.999Z');
  assert.equal(getInicioHistoricoEscalas(agora).toISOString(), '2026-04-17T00:00:00.000Z');
});

test('manutenção remove escalas anteriores a 90 dias', async () => {
  let filtroExclusao;
  const prisma = {
    escala: {
      deleteMany: async ({ where }) => {
        filtroExclusao = where;
        return { count: 0 };
      },
      createMany: async () => ({ count: 0 }),
    },
    evento: {
      findMany: async () => [],
    },
  };

  await garantirOcorrenciasEventos(prisma, new Date('2026-07-16T10:30:00.000Z'));

  assert.equal(filtroExclusao.eventoId.not, null);
  assert.equal(filtroExclusao.dataHora.lt.toISOString(), '2026-04-17T00:00:00.000Z');
});

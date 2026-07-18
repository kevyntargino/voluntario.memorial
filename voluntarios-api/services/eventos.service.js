import { randomUUID } from 'node:crypto';

export const DIAS_ESCALAS_FUTURAS = 60;
export const DIAS_HISTORICO_ESCALAS = 90;

function adicionarDias(data, dias, fimDoDia = false) {
  const resultado = new Date(data);
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  resultado.setUTCHours(fimDoDia ? 23 : 0, fimDoDia ? 59 : 0, fimDoDia ? 59 : 0, fimDoDia ? 999 : 0);
  return resultado;
}

export function getLimiteEscalasFuturas(agora = new Date()) {
  return adicionarDias(agora, DIAS_ESCALAS_FUTURAS, true);
}

export function getInicioHistoricoEscalas(agora = new Date()) {
  return adicionarDias(agora, -DIAS_HISTORICO_ESCALAS);
}

function dataUtc(ano, mes, dia, horas, minutos) {
  return new Date(Date.UTC(ano, mes, dia, horas, minutos, 0, 0));
}

export function getSemanaMes(data) {
  return Math.ceil(data.getUTCDate() / 7);
}

function normalizarUsuarioIds(usuarioIds) {
  if (!Array.isArray(usuarioIds)) return [];

  return Array.from(new Set(usuarioIds.filter(Boolean).map(String)));
}

function ocorrenciaMensal(ano, mes, diaSemana, semanaMes, horas, minutos) {
  const ocorrencias = [];

  for (let dia = 1; dia <= 31; dia += 1) {
    const data = dataUtc(ano, mes, dia, horas, minutos);
    if (data.getUTCMonth() !== mes) break;
    if (data.getUTCDay() === diaSemana) ocorrencias.push(data);
  }

  return ocorrencias[semanaMes - 1] || null;
}

export function gerarDatasEvento(evento, limitePersonalizado) {
  const inicio = new Date(evento.dataInicio);
  if (Number.isNaN(inicio.getTime())) return [];

  if (evento.frequencia === 'NAO_REPETE') return [inicio];

  const limitePadrao = adicionarDias(inicio, DIAS_ESCALAS_FUTURAS, true);
  const limiteEvento = evento.dataFim ? new Date(evento.dataFim) : limitePadrao;
  const limite = limitePersonalizado && limitePersonalizado < limiteEvento
    ? limitePersonalizado
    : limiteEvento;
  const datas = [];

  if (evento.frequencia === 'SEMANAL') {
    for (let atual = new Date(inicio); atual <= limite; atual = new Date(atual.getTime() + 7 * 86400000)) {
      datas.push(atual);
    }
    return datas;
  }

  const totalMeses = Math.max(
    0,
    (limite.getUTCFullYear() - inicio.getUTCFullYear()) * 12 + limite.getUTCMonth() - inicio.getUTCMonth(),
  );

  for (let offset = 0; offset <= totalMeses + 1; offset += 1) {
    const base = dataUtc(inicio.getUTCFullYear(), inicio.getUTCMonth() + offset, 1, 0, 0);
    const ocorrencia = ocorrenciaMensal(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      evento.diaSemana ?? inicio.getUTCDay(),
      evento.semanaMes || 1,
      inicio.getUTCHours(),
      inicio.getUTCMinutes(),
    );

    if (ocorrencia && ocorrencia >= inicio && ocorrencia <= limite) datas.push(ocorrencia);
    if (ocorrencia && ocorrencia > limite) break;
  }

  return datas;
}

export async function aplicarModelosVoluntariosEscalas(prisma, { eventoId, datas = null, atribuidoPorId = null }) {
  const filtroDatas = Array.isArray(datas) && datas.length > 0
    ? { dataHora: { in: datas } }
    : {};
  const [modelos, escalas] = await Promise.all([
    prisma.escalaModeloVoluntario.findMany({
      where: { eventoId },
      select: {
        equipeId: true,
        semanaMes: true,
        usuarioId: true,
      },
    }),
    prisma.escala.findMany({
      where: {
        eventoId,
        ...filtroDatas,
        voluntarios: { none: {} },
      },
      select: {
        id: true,
        equipeId: true,
        dataHora: true,
      },
    }),
  ]);

  if (modelos.length === 0 || escalas.length === 0) {
    return 0;
  }

  const modelosPorChave = new Map();

  for (const modelo of modelos) {
    const chave = `${modelo.equipeId}:${modelo.semanaMes}`;
    const voluntarios = modelosPorChave.get(chave) || [];
    voluntarios.push(modelo.usuarioId);
    modelosPorChave.set(chave, voluntarios);
  }

  const participacoes = escalas.flatMap((escala) => {
    if (!escala.dataHora) return [];

    const semanaMes = getSemanaMes(escala.dataHora);
    const voluntarios = modelosPorChave.get(`${escala.equipeId}:${semanaMes}`) || [];

    return voluntarios.map((usuarioId) => ({
      usuarioId,
      escalaId: escala.id,
      atribuidoPorId,
      status: 'PENDENTE',
      dataOcorrenciaStatus: escala.dataHora,
    }));
  });

  if (participacoes.length === 0) {
    return 0;
  }

  const resultado = await prisma.voluntarioEscala.createMany({
    data: participacoes,
    skipDuplicates: true,
  });

  return resultado.count;
}

export async function sincronizarModeloVoluntariosEscala(
  prisma,
  { eventoId, equipeId, dataHora, voluntarioIds = [], atribuidoPorId = null },
) {
  const dataBase = new Date(dataHora);

  if (!eventoId || !equipeId || Number.isNaN(dataBase.getTime())) {
    return { modelosCriados: 0, escalasSincronizadas: 0, participacoesCriadas: 0 };
  }

  const semanaMes = getSemanaMes(dataBase);
  const usuarioIds = normalizarUsuarioIds(voluntarioIds);

  await prisma.escalaModeloVoluntario.deleteMany({
    where: {
      eventoId,
      equipeId,
      semanaMes,
      ...(usuarioIds.length > 0 ? { usuarioId: { notIn: usuarioIds } } : {}),
    },
  });

  const modelosCriados = usuarioIds.length > 0
    ? await prisma.escalaModeloVoluntario.createMany({
        data: usuarioIds.map((usuarioId) => ({
          id: randomUUID(),
          eventoId,
          equipeId,
          semanaMes,
          usuarioId,
        })),
        skipDuplicates: true,
      })
    : { count: 0 };

  const escalasFuturas = await prisma.escala.findMany({
    where: {
      eventoId,
      equipeId,
      dataHora: { gt: dataBase },
    },
    select: {
      id: true,
      dataHora: true,
    },
  });
  const escalasDoModelo = escalasFuturas.filter((escala) => (
    escala.dataHora && getSemanaMes(escala.dataHora) === semanaMes
  ));
  const escalaIds = escalasDoModelo.map((escala) => escala.id);

  if (escalaIds.length === 0) {
    return {
      modelosCriados: modelosCriados.count,
      escalasSincronizadas: 0,
      participacoesCriadas: 0,
    };
  }

  await prisma.voluntarioEscala.deleteMany({
    where: {
      escalaId: { in: escalaIds },
      ...(usuarioIds.length > 0 ? { usuarioId: { notIn: usuarioIds } } : {}),
    },
  });

  const participacoes = escalasDoModelo.flatMap((escala) => (
    usuarioIds.map((usuarioId) => ({
      usuarioId,
      escalaId: escala.id,
      atribuidoPorId,
      status: 'PENDENTE',
      dataOcorrenciaStatus: escala.dataHora,
    }))
  ));

  const participacoesCriadas = participacoes.length > 0
    ? await prisma.voluntarioEscala.createMany({
        data: participacoes,
        skipDuplicates: true,
      })
    : { count: 0 };

  return {
    modelosCriados: modelosCriados.count,
    escalasSincronizadas: escalasDoModelo.length,
    participacoesCriadas: participacoesCriadas.count,
  };
}

export async function garantirOcorrenciasEventos(prisma, agora = new Date()) {
  const limite = getLimiteEscalasFuturas(agora);
  const inicioHistorico = getInicioHistoricoEscalas(agora);

  await prisma.escala.deleteMany({
    where: {
      eventoId: { not: null },
      dataHora: { lt: inicioHistorico },
    },
  });

  const eventos = await prisma.evento.findMany({
    where: {
      ativo: true,
      frequencia: { not: 'NAO_REPETE' },
      OR: [{ dataFim: null }, { dataFim: { gte: agora } }],
    },
    include: {
      equipes: { select: { id: true } },
      ocorrencias: true,
    },
  });

  for (const evento of eventos) {
    const ocorrencias = evento.ocorrencias || [];
    const excecoesPorDataOriginal = new Map(ocorrencias.map((ocorrencia) => [
      ocorrencia.dataHoraOriginal.toISOString(),
      ocorrencia,
    ]));
    const datasRegulares = gerarDatasEvento(evento, limite)
      .filter((data) => data >= agora && data <= limite && !excecoesPorDataOriginal.has(data.toISOString()));
    const excecoesAtivas = ocorrencias.filter((ocorrencia) => (
      !ocorrencia.cancelada
      && ocorrencia.dataHora
      && ocorrencia.dataHora >= agora
      && ocorrencia.dataHora <= limite
    ));
    const datas = [
      ...datasRegulares.map((dataHora) => ({ dataHora, ocorrencia: null })),
      ...excecoesAtivas.map((ocorrencia) => ({ dataHora: ocorrencia.dataHora, ocorrencia })),
    ];
    if (datas.length === 0 || evento.equipes.length === 0) continue;

    await prisma.escala.createMany({
      data: datas.flatMap(({ dataHora, ocorrencia }) => evento.equipes.map((equipe) => ({
        id: randomUUID(),
        eventoId: evento.id,
        titulo: ocorrencia?.titulo || evento.titulo,
        local: ocorrencia?.local ?? evento.local,
        descricao: ocorrencia?.descricao ?? evento.descricao,
        tipo: evento.tipo,
        dataHora,
        diaSemana: null,
        semanaMes: null,
        solicitadaPeloAdmin: true,
        equipeId: equipe.id,
      }))),
      skipDuplicates: true,
    });

    await aplicarModelosVoluntariosEscalas(prisma, {
      eventoId: evento.id,
      datas: datas.map(({ dataHora }) => dataHora),
    });
  }
}

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
    include: { equipes: { select: { id: true } } },
  });

  for (const evento of eventos) {
    const datas = gerarDatasEvento(evento, limite).filter((data) => data >= agora && data <= limite);
    if (datas.length === 0 || evento.equipes.length === 0) continue;

    await prisma.escala.createMany({
      data: datas.flatMap((dataHora) => evento.equipes.map((equipe) => ({
        eventoId: evento.id,
        titulo: evento.titulo,
        local: evento.local,
        descricao: evento.descricao,
        tipo: evento.tipo,
        dataHora,
        diaSemana: null,
        semanaMes: null,
        solicitadaPeloAdmin: true,
        equipeId: equipe.id,
      }))),
      skipDuplicates: true,
    });
  }
}

const TIME_ZONE_ESCALAS = 'America/Campo_Grande';

export function getAgoraEscalas(agora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE_ESCALAS,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(agora);
  const valor = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));

  return new Date(Date.UTC(
    Number(valor.year),
    Number(valor.month) - 1,
    Number(valor.day),
    Number(valor.hour),
    Number(valor.minute),
    Number(valor.second),
  ));
}

export function escalaEstaEncerrada(dataHora, agora = getAgoraEscalas()) {
  const data = new Date(dataHora);
  return Number.isNaN(data.getTime()) || data.getTime() < agora.getTime();
}

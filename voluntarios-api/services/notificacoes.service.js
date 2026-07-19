import webpush from 'web-push';

let webPushConfigurado = false;
const timeZoneEventos = process.env.EVENT_TIME_ZONE || 'America/Campo_Grande';
const DURACAO_REFERENCIA_EVENTO_MS = 2 * 60 * 60 * 1000;

function configurarWebPush() {
  if (webPushConfigurado) {
    return true;
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@mcom.local',
    publicKey,
    privateKey,
  );
  webPushConfigurado = true;
  return true;
}

function getHorarioBase(dataHora) {
  const data = dataHora ? new Date(dataHora) : null;

  return {
    horas: data && !Number.isNaN(data.getTime()) ? data.getUTCHours() : 18,
    minutos: data && !Number.isNaN(data.getTime()) ? data.getUTCMinutes() : 0,
  };
}

function getDataUtc(ano, mes, dia, horas = 18, minutos = 0) {
  return new Date(Date.UTC(ano, mes, dia, horas, minutos, 0, 0));
}

function getOcorrenciaNoMes(ano, mes, diaSemana, semanaMes, dataHora) {
  const { horas, minutos } = getHorarioBase(dataHora);
  const ocorrencias = [];

  for (let dia = 1; dia <= 31; dia += 1) {
    const data = getDataUtc(ano, mes, dia, horas, minutos);

    if (data.getUTCMonth() !== mes) {
      break;
    }

    if (data.getUTCDay() === diaSemana) {
      ocorrencias.push(data);
    }
  }

  return ocorrencias[semanaMes - 1] || null;
}

export function getProximaOcorrenciaNotificacao(escala, agora = new Date()) {
  if (escala.tipo !== 'RECORRENTE' || escala.diaSemana === null || escala.diaSemana === undefined || !escala.semanaMes) {
    return escala.dataHora;
  }

  for (let offsetMes = 0; offsetMes < 18; offsetMes += 1) {
    const dataBase = getDataUtc(agora.getUTCFullYear(), agora.getUTCMonth() + offsetMes, 1);
    const ocorrencia = getOcorrenciaNoMes(
      dataBase.getUTCFullYear(),
      dataBase.getUTCMonth(),
      escala.diaSemana,
      escala.semanaMes,
      escala.dataHora,
    );

    if (ocorrencia && ocorrencia >= new Date(agora.getTime() - DURACAO_REFERENCIA_EVENTO_MS)) {
      return ocorrencia;
    }
  }

  return escala.dataHora;
}

export function diasAte(data, agora = new Date()) {
  const dataDia = Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate());
  const agoraDia = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());
  return Math.round((dataDia - agoraDia) / 86400000);
}

export function getAgoraNotificacao() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZoneEventos,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const valor = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));

  return getDataUtc(
    Number(valor.year),
    Number(valor.month) - 1,
    Number(valor.day),
    Number(valor.hour),
    Number(valor.minute),
  );
}

function datasIguais(dataA, dataB) {
  if (!dataA || !dataB) {
    return false;
  }

  return new Date(dataA).toISOString() === new Date(dataB).toISOString();
}

export function getStatusParticipacaoNaOcorrencia(participacao, dataOcorrencia) {
  if (participacao.escala?.tipo !== 'RECORRENTE') {
    return participacao.status;
  }

  return datasIguais(participacao.dataOcorrenciaStatus, dataOcorrencia)
    ? participacao.status
    : 'PENDENTE';
}

function formatarData(data) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }).format(data);
}

function getLinkModalProximaEscala(participacao, dataOcorrencia) {
  const params = new URLSearchParams({
    abrirProximaEscala: '1',
  });
  const data = dataOcorrencia ? new Date(dataOcorrencia) : null;

  if (participacao?.id) {
    params.set('proximaParticipacao', participacao.id);
  }

  if (data && !Number.isNaN(data.getTime())) {
    params.set('dataOcorrencia', data.toISOString());
  }

  return `/?${params.toString()}`;
}

export async function criarNotificacoes(prisma, notificacoes) {
  const dados = notificacoes
    .filter((item) => item?.usuarioId && item?.chave && item?.titulo && item?.mensagem)
    .map((item) => ({
      usuarioId: item.usuarioId,
      tipo: item.tipo,
      titulo: item.titulo,
      mensagem: item.mensagem,
      link: item.link || null,
      chave: item.chave,
    }));

  if (dados.length === 0) {
    return { count: 0 };
  }

  let count = 0;

  for (const item of dados) {
    try {
      const notificacao = await prisma.notificacao.create({ data: item });
      count += 1;
      enviarPushParaUsuario(prisma, notificacao).catch((erro) => {
        console.warn('[WARN] Falha ao enviar push notification:', erro.message);
      });
    } catch (erro) {
      // P2002 = notificação duplicada (mesma chave): ignorada por ser idempotente.
      // Demais falhas de um item não devem abortar o lote inteiro; registra e segue.
      if (erro.code !== 'P2002') {
        console.warn('[WARN] Falha ao criar notificação:', item.chave, erro.message);
      }
    }
  }

  return { count };
}

export async function enviarPushParaUsuario(prisma, notificacao) {
  if (!configurarWebPush()) {
    return { count: 0, skipped: true };
  }

  const subscriptions = await prisma.webPushSubscription.findMany({
    where: {
      usuarioId: notificacao.usuarioId,
    },
  });

  if (subscriptions.length === 0) {
    return { count: 0 };
  }

  const payload = JSON.stringify({
    title: notificacao.titulo,
    body: notificacao.mensagem,
    url: notificacao.link || '/',
    tag: notificacao.chave,
    notificationId: notificacao.id,
  });

  let enviados = 0;

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      }, payload);
      enviados += 1;
    } catch (erro) {
      if ([404, 410].includes(erro.statusCode)) {
        await prisma.webPushSubscription.delete({
          where: {
            endpoint: subscription.endpoint,
          },
        }).catch(() => {});
        return;
      }

      throw erro;
    }
  }));

  return { count: enviados };
}

export async function notificarAviso(prisma, { aviso, usuarioIds }) {
  const ids = Array.from(new Set(usuarioIds || []));

  if (ids.length === 0) {
    return { count: 0 };
  }

  return criarNotificacoes(prisma, ids.map((usuarioId) => ({
    usuarioId,
    tipo: 'AVISO',
    titulo: aviso.titulo,
    mensagem: aviso.mensagem,
    link: `/avisos?aviso=${aviso.id}`,
    chave: `aviso:${aviso.id}:${usuarioId}`,
  })));
}

export async function notificarOrdemCulto(prisma, { ordem, eventoTitulo, usuarioIds }) {
  const ids = Array.from(new Set(usuarioIds || []));
  const data = new Date(ordem?.dataHora);

  if (!ordem?.id || ids.length === 0 || Number.isNaN(data.getTime()) || data <= getAgoraNotificacao()) {
    return { count: 0 };
  }

  const versao = ordem.arquivoKey || ordem.atualizadoEm?.toISOString() || ordem.id;
  const link = `/escalas?evento=${encodeURIComponent(ordem.eventoId)}&data=${encodeURIComponent(data.toISOString())}`;

  return criarNotificacoes(prisma, ids.map((usuarioId) => ({
    usuarioId,
    tipo: 'ORDEM_CULTO',
    titulo: 'Ordem de culto disponível',
    mensagem: `A ordem de culto de ${eventoTitulo || 'sua próxima escala'} já está disponível.`,
    link,
    chave: `ordem-culto:${usuarioId}:${ordem.id}:${versao}`,
  })));
}

export async function notificarPedidoSubstituicao(prisma, { participacao }) {
  const lideres = participacao.escala?.equipe?.lideres || [];
  const equipeNome = participacao.escala?.equipe?.nome || 'sua equipe';
  const nomeVoluntario = participacao.usuario?.nomeCompleto || 'Um voluntário';

  if (lideres.length === 0) {
    return { count: 0 };
  }

  return criarNotificacoes(prisma, lideres.map((lider) => ({
    usuarioId: lider.id,
    tipo: 'ALERTA_LIDER',
    titulo: 'Pedido de substituição recebido',
    mensagem: `${nomeVoluntario} solicitou substituição em ${equipeNome}. Veja a justificativa e atribua um substituto.`,
    link: `/minha-equipe?equipe=${participacao.escala.equipe.id}&pedido=${participacao.id}`,
    chave: `pedido-substituicao:${lider.id}:${participacao.id}`,
  })));
}

export async function notificarConfirmacaoEscala(prisma, { participacao, dataOcorrencia }) {
  const lideres = participacao.escala?.equipe?.lideres || [];
  const data = new Date(dataOcorrencia || participacao.escala?.dataHora);

  if (lideres.length === 0 || Number.isNaN(data.getTime()) || data <= getAgoraNotificacao()) {
    return { count: 0 };
  }

  const nomeVoluntario = participacao.usuario?.nomeCompleto || 'Um voluntário';
  const equipeNome = participacao.escala.equipe?.nome || 'sua equipe';

  return criarNotificacoes(prisma, lideres.map((lider) => ({
    usuarioId: lider.id,
    tipo: 'ALERTA_LIDER',
    titulo: 'Escala confirmada',
    mensagem: `${nomeVoluntario} confirmou a escala de ${equipeNome} para ${formatarData(data)}.`,
    link: `/minha-equipe?equipe=${participacao.escala.equipe.id}&escala=${participacao.escala.id}`,
    chave: `escala-confirmada:${lider.id}:${participacao.id}:${data.toISOString()}`,
  })));
}

export async function notificarSubstituto(prisma, { participacao, dataOcorrencia }) {
  const data = dataOcorrencia ? new Date(dataOcorrencia) : getProximaOcorrenciaNotificacao(participacao.escala);
  const equipeNome = participacao.escala?.equipe?.nome || 'sua equipe';

  if (!data || Number.isNaN(new Date(data).getTime()) || new Date(data) <= getAgoraNotificacao()) {
    return { count: 0 };
  }

  return criarNotificacoes(prisma, [{
    usuarioId: participacao.usuarioId,
    tipo: 'SUBSTITUTO',
    titulo: 'Você foi alocado como substituto',
    mensagem: `Você foi alocado como substituto em ${equipeNome} para ${formatarData(data)}. Confirme sua disponibilidade.`,
    link: `/escalas?filtro=confirmacoes&participacao=${participacao.id}`,
    chave: `substituto:${participacao.id}:${data.toISOString()}`,
  }]);
}

export async function notificarNovaEscalaAdmin(prisma, { escalas }) {
  const notificacoes = [];
  const agora = getAgoraNotificacao();

  for (const escala of escalas || []) {
    const dataOcorrencia = getProximaOcorrenciaNotificacao(escala, agora);
    if (!dataOcorrencia || new Date(dataOcorrencia) <= agora) continue;
    const dataTexto = dataOcorrencia ? formatarData(new Date(dataOcorrencia)) : 'uma próxima data';
    const equipeNome = escala.equipe?.nome || 'sua equipe';

    for (const lider of escala.equipe?.lideres || []) {
      notificacoes.push({
        usuarioId: lider.id,
        tipo: 'ALERTA_LIDER',
        titulo: 'Nova escala criada pelo admin',
        mensagem: `A equipe ${equipeNome} foi requisitada para ${escala.titulo || 'uma nova escala'} em ${dataTexto}. Atribua os voluntários da equipe.`,
        link: `/minha-equipe?equipe=${escala.equipe.id}&escala=${escala.id}`,
        chave: `nova-escala-admin:${lider.id}:${escala.id}`,
      });
    }
  }

  return criarNotificacoes(prisma, notificacoes);
}

export async function gerarNotificacoesAutomaticas(prisma, agora = getAgoraNotificacao()) {
  const participacoes = await prisma.voluntarioEscala.findMany({
    where: {
      // Mantém escalas que começaram há até duas horas para a execução horária
      // ainda conseguir emitir o aviso de início.
      escala: { dataHora: { gte: new Date(agora.getTime() - DURACAO_REFERENCIA_EVENTO_MS) } },
    },
    include: {
      usuario: {
        select: { id: true, nomeCompleto: true },
      },
      escala: {
        include: {
          equipe: {
            select: {
              id: true,
              nome: true,
              lideres: {
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });

  const notificacoes = [];
  const pendenciasPorEscala = new Map();

  for (const participacao of participacoes) {
    const dataOcorrencia = getProximaOcorrenciaNotificacao(participacao.escala, agora);

    if (!dataOcorrencia || new Date(dataOcorrencia) < new Date(agora.getTime() - DURACAO_REFERENCIA_EVENTO_MS)) {
      continue;
    }

    const dias = diasAte(new Date(dataOcorrencia), agora);
    const status = getStatusParticipacaoNaOcorrencia(participacao, dataOcorrencia);
    const equipeNome = participacao.escala.equipe?.nome || 'sua equipe';
    const dataTexto = formatarData(new Date(dataOcorrencia));
    const inicioEvento = new Date(dataOcorrencia);
    const eventoEmInicio = agora >= inicioEvento
      && agora < new Date(inicioEvento.getTime() + DURACAO_REFERENCIA_EVENTO_MS);

    if (status === 'CONFIRMADA' && eventoEmInicio) {
      notificacoes.push({
        usuarioId: participacao.usuarioId,
        tipo: 'LEMBRETE_ESCALA',
        titulo: 'Seu evento está iniciando',
        mensagem: `${participacao.escala.titulo || 'Sua escala'} em ${equipeNome} começa agora.`,
        link: getLinkModalProximaEscala(participacao, dataOcorrencia),
        chave: `inicio-evento:${participacao.id}:${inicioEvento.toISOString()}`,
      });
    }

    if (dias === 1 && ['PENDENTE', 'CONFIRMADA'].includes(status)) {
      notificacoes.push({
        usuarioId: participacao.usuarioId,
        tipo: 'LEMBRETE_ESCALA',
        titulo: 'Sua escala é amanhã',
        mensagem: `Sua escala em ${equipeNome} está marcada para ${dataTexto}.`,
        link: getLinkModalProximaEscala(participacao, dataOcorrencia),
        chave: `lembrete-escala:1d:${participacao.id}:${new Date(dataOcorrencia).toISOString()}`,
      });
    }

    if (status !== 'PENDENTE') {
      continue;
    }

    if ([5, 3].includes(dias)) {
      notificacoes.push({
        usuarioId: participacao.usuarioId,
        tipo: 'CONFIRMACAO_ESCALA',
        titulo: dias === 5 ? 'Confirme sua próxima escala' : 'Lembrete: confirme sua escala',
        mensagem: `Sua escala em ${equipeNome} está marcada para ${dataTexto}. Confirme sua participação no painel de escalas.`,
        link: getLinkModalProximaEscala(participacao, dataOcorrencia),
        chave: `confirmacao:${dias}d:${participacao.id}:${new Date(dataOcorrencia).toISOString()}`,
      });
    }

    if ([4, 2].includes(dias) && (participacao.escala.equipe?.lideres || []).length > 0) {
      const chaveGrupo = `${participacao.escala.id}:${new Date(dataOcorrencia).toISOString()}:${dias}`;
      const grupo = pendenciasPorEscala.get(chaveGrupo) || {
        dias,
        dataOcorrencia: new Date(dataOcorrencia),
        dataTexto,
        equipe: participacao.escala.equipe,
        escalaId: participacao.escala.id,
        voluntarios: [],
      };

      grupo.voluntarios.push(participacao.usuario);
      pendenciasPorEscala.set(chaveGrupo, grupo);
    }
  }

  for (const grupo of pendenciasPorEscala.values()) {
    const nomes = grupo.voluntarios.map((voluntario) => voluntario.nomeCompleto);
    const resumoNomes = nomes.length <= 3
      ? nomes.join(', ')
      : `${nomes.slice(0, 3).join(', ')} e mais ${nomes.length - 3}`;

    for (const lider of grupo.equipe.lideres) {
      notificacoes.push({
        usuarioId: lider.id,
        tipo: 'ALERTA_LIDER',
        titulo: `${nomes.length} ${nomes.length === 1 ? 'confirmação pendente' : 'confirmações pendentes'}`,
        mensagem: `${resumoNomes} ainda ${nomes.length === 1 ? 'não confirmou' : 'não confirmaram'} a escala de ${grupo.equipe.nome} em ${grupo.dataTexto}.`,
        link: `/minha-equipe?equipe=${grupo.equipe.id}&escala=${grupo.escalaId}`,
        chave: `lider-pendentes:${grupo.dias}d:${lider.id}:${grupo.escalaId}:${grupo.dataOcorrencia.toISOString()}`,
      });
    }
  }

  return criarNotificacoes(prisma, notificacoes);
}

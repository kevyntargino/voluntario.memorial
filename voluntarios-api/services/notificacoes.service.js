import webpush from 'web-push';

const AREAS_MCOM = ['Midia', 'Iluminação', 'Filmagem', 'Fotografia', 'DTV', 'Direção', 'Redes Sociais'];

let webPushConfigurado = false;

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

    if (ocorrencia && ocorrencia >= agora) {
      return ocorrencia;
    }
  }

  return escala.dataHora;
}

function diasAte(data, agora = new Date()) {
  const dataDia = Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate());
  const agoraDia = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());
  return Math.round((dataDia - agoraDia) / 86400000);
}

function formatarData(data) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }).format(data);
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
      if (erro.code !== 'P2002') {
        throw erro;
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
    link: '/avisos',
    chave: `aviso:${aviso.id}:${usuarioId}`,
  })));
}

export async function notificarSubstituto(prisma, { participacao, dataOcorrencia }) {
  const data = dataOcorrencia ? new Date(dataOcorrencia) : getProximaOcorrenciaNotificacao(participacao.escala);
  const equipeNome = participacao.escala?.equipe?.nome || 'sua equipe';

  return criarNotificacoes(prisma, [{
    usuarioId: participacao.usuarioId,
    tipo: 'SUBSTITUTO',
    titulo: 'Você foi alocado como substituto',
    mensagem: `Você foi alocado como substituto em ${equipeNome} para ${formatarData(data)}. Confirme sua disponibilidade.`,
    link: '/escalas?filtro=confirmacoes',
    chave: `substituto:${participacao.id}:${data.toISOString()}`,
  }]);
}

export async function gerarNotificacoesAutomaticas(prisma) {
  const agora = new Date();
  const participacoes = await prisma.voluntarioEscala.findMany({
    where: {
      status: 'PENDENTE',
      escala: {
        equipe: {
          nome: { in: AREAS_MCOM },
        },
        OR: [
          { tipo: 'RECORRENTE' },
          { tipo: 'ESPORADICA', dataHora: { gte: agora } },
        ],
      },
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

  for (const participacao of participacoes) {
    const dataOcorrencia = getProximaOcorrenciaNotificacao(participacao.escala, agora);

    if (!dataOcorrencia) {
      continue;
    }

    const dias = diasAte(new Date(dataOcorrencia), agora);

    if (![5, 3].includes(dias)) {
      continue;
    }

    const equipeNome = participacao.escala.equipe?.nome || 'sua equipe';
    const dataTexto = formatarData(new Date(dataOcorrencia));

    notificacoes.push({
      usuarioId: participacao.usuarioId,
      tipo: 'CONFIRMACAO_ESCALA',
      titulo: dias === 5 ? 'Confirme sua próxima escala' : 'Lembrete: confirme sua escala',
      mensagem: `Sua escala em ${equipeNome} está marcada para ${dataTexto}. Confirme sua participação no painel de escalas.`,
      link: '/escalas?filtro=confirmacoes',
      chave: `confirmacao:${dias}d:${participacao.id}:${new Date(dataOcorrencia).toISOString()}`,
    });

    if (dias === 3) {
      for (const lider of participacao.escala.equipe?.lideres || []) {
        notificacoes.push({
          usuarioId: lider.id,
          tipo: 'ALERTA_LIDER',
          titulo: 'Voluntário ainda não confirmou escala',
          mensagem: `${participacao.usuario.nomeCompleto} ainda não confirmou a escala de ${equipeNome} em ${dataTexto}.`,
          link: '/minha-equipe',
          chave: `lider-pendente:${lider.id}:${participacao.id}:${new Date(dataOcorrencia).toISOString()}`,
        });
      }
    }
  }

  return criarNotificacoes(prisma, notificacoes);
}

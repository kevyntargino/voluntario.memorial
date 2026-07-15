import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

const router = Router();

function getJwtSecret() {
  if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET e obrigatorio em producao.');
  }

  return process.env.JWT_SECRET || 'chave_temporaria_dev';
}

async function autenticar(req, res, next) {
  const authorization = req.headers.authorization || '';
  const [, token] = authorization.split(' ');

  if (!token) {
    return res.status(401).json({ erro: 'Token de autenticação não informado.' });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.id },
      select: { id: true, permissoes: true },
    });

    if (!usuario) {
      return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    }

    req.usuarioAutenticado = usuario;
    return next();
  } catch {
    return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
  }
}

function exigirAdmin(req, res, next) {
  const permissoes = req.usuarioAutenticado?.permissoes || [];

  if (!permissoes.includes('ADMINISTRADOR')) {
    return res.status(403).json({ erro: 'Acesso restrito a administradores.' });
  }

  return next();
}

function getSemanaMes(data) {
  return Math.ceil(data.getDate() / 7);
}

function getDataHoraRecorrente(diaSemana, semanaMes, dataHora) {
  const { horas, minutos } = getHorarioBase(dataHora);
  const agora = new Date();

  return getOcorrenciaNoMes(agora.getUTCFullYear(), agora.getUTCMonth(), diaSemana, semanaMes, dataHora)
    || getDataUtc(agora.getUTCFullYear(), agora.getUTCMonth(), 1, horas, minutos);
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

function getProximaOcorrencia(escala) {
  if (escala.tipo !== 'RECORRENTE' || escala.diaSemana === null || escala.diaSemana === undefined || !escala.semanaMes) {
    return escala.dataHora;
  }

  const agora = new Date();

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

function datasIguais(dataA, dataB) {
  if (!dataA || !dataB) {
    return false;
  }

  return new Date(dataA).toISOString() === new Date(dataB).toISOString();
}

function formatarParticipacao(item, dataOcorrencia) {
  const temOcorrenciaEspecifica = Boolean(item.dataOcorrenciaSubstituicao);

  if (item.substituto && temOcorrenciaEspecifica && !datasIguais(item.dataOcorrenciaSubstituicao, dataOcorrencia)) {
    return null;
  }

  const usarStatusEspecifico = !temOcorrenciaEspecifica || datasIguais(item.dataOcorrenciaSubstituicao, dataOcorrencia);

  return {
    id: item.id,
    status: usarStatusEspecifico ? item.status : 'PENDENTE',
    justificativaSubstituicao: usarStatusEspecifico ? item.justificativaSubstituicao : null,
    dataOcorrenciaSubstituicao: item.dataOcorrenciaSubstituicao,
    substituto: usarStatusEspecifico ? item.substituto : false,
    usuario: item.usuario,
  };
}

function formatarEscala(voluntarioEscala) {
  const dataOcorrencia = getProximaOcorrencia(voluntarioEscala.escala);

  return {
    id: voluntarioEscala.id,
    status: !voluntarioEscala.dataOcorrenciaSubstituicao || datasIguais(voluntarioEscala.dataOcorrenciaSubstituicao, dataOcorrencia)
      ? voluntarioEscala.status
      : 'PENDENTE',
    justificativaSubstituicao: datasIguais(voluntarioEscala.dataOcorrenciaSubstituicao, dataOcorrencia)
      ? voluntarioEscala.justificativaSubstituicao
      : null,
    dataOcorrenciaSubstituicao: voluntarioEscala.dataOcorrenciaSubstituicao,
    substituto: !voluntarioEscala.dataOcorrenciaSubstituicao || datasIguais(voluntarioEscala.dataOcorrenciaSubstituicao, dataOcorrencia)
      ? voluntarioEscala.substituto
      : false,
    criadoEm: voluntarioEscala.criadoEm,
    atualizadoEm: voluntarioEscala.atualizadoEm,
    escala: {
      id: voluntarioEscala.escala.id,
      titulo: voluntarioEscala.escala.titulo,
      local: voluntarioEscala.escala.local,
      descricao: voluntarioEscala.escala.descricao,
      tipo: voluntarioEscala.escala.tipo,
      diaSemana: voluntarioEscala.escala.diaSemana,
      semanaMes: voluntarioEscala.escala.semanaMes,
      dataHora: dataOcorrencia,
      grupoEsporadicoId: voluntarioEscala.escala.grupoEsporadicoId,
      solicitadaPeloAdmin: voluntarioEscala.escala.solicitadaPeloAdmin,
      equipe: voluntarioEscala.escala.equipe,
    },
    atribuidoPor: voluntarioEscala.atribuidoPor,
  };
}

function formatarEscalaCompleta(escala, usuarioId) {
  const dataOcorrencia = getProximaOcorrencia(escala);
  const voluntarios = escala.voluntarios
    .map((item) => formatarParticipacao(item, dataOcorrencia))
    .filter(Boolean);
  const minhaParticipacaoBase = escala.voluntarios.find((item) => item.usuarioId === usuarioId) || null;
  const minhaParticipacao = minhaParticipacaoBase ? formatarParticipacao(minhaParticipacaoBase, dataOcorrencia) : null;

  return {
    id: escala.id,
    titulo: escala.titulo,
    local: escala.local,
    descricao: escala.descricao,
    tipo: escala.tipo,
    diaSemana: escala.diaSemana,
    semanaMes: escala.semanaMes,
    dataHora: dataOcorrencia,
    grupoEsporadicoId: escala.grupoEsporadicoId,
    solicitadaPeloAdmin: escala.solicitadaPeloAdmin,
    equipe: escala.equipe,
    voluntarios,
    minhaParticipacao: minhaParticipacao
        ? {
          id: minhaParticipacao.id,
          status: minhaParticipacao.status,
          justificativaSubstituicao: minhaParticipacao.justificativaSubstituicao,
          dataOcorrenciaSubstituicao: minhaParticipacao.dataOcorrenciaSubstituicao,
          substituto: minhaParticipacao.substituto,
        }
      : null,
  };
}

router.get('/', autenticar, async (req, res) => {
  try {
    const visao = req.query.visao === 'minhas' ? 'minhas' : 'todas';
    const areasMCom = ['Midia', 'Iluminação', 'Filmagem', 'Fotografia', 'DTV', 'Direção', 'Redes Sociais'];

    const escalas = await prisma.escala.findMany({
      where: {
        OR: visao === 'minhas'
          ? [
              { tipo: 'RECORRENTE' },
              { tipo: 'ESPORADICA', dataHora: { gte: new Date() } },
            ]
          : [
              { tipo: 'RECORRENTE' },
            ],
        equipe: {
          nome: {
            in: areasMCom,
          },
        },
        voluntarios: visao === 'minhas'
          ? {
              some: {
                usuarioId: req.usuarioAutenticado.id,
              },
            }
          : undefined,
      },
      include: {
        equipe: {
          select: {
            id: true,
            nome: true,
          },
        },
        voluntarios: {
          include: {
            usuario: {
              select: {
                id: true,
                nomeCompleto: true,
                email: true,
                telefone: true,
                urlFoto: true,
                dataNascimento: true,
                sexo: true,
                permissoes: true,
                criadoEm: true,
                atualizadoEm: true,
                equipes: { select: { id: true, nome: true } },
                equipesLideradas: { select: { id: true, nome: true } },
              },
            },
          },
          orderBy: {
            criadoEm: 'asc',
          },
        },
      },
      orderBy: [
        { dataHora: 'asc' },
        { equipe: { nome: 'asc' } },
      ],
    });

    const escalasFormatadas = escalas
      .map((escala) => formatarEscalaCompleta(escala, req.usuarioAutenticado.id))
      .filter((escala) => visao !== 'minhas' || escala.minhaParticipacao);

    return res.status(200).json({
      escalas: escalasFormatadas,
    });
  } catch (erro) {
    console.error('[ERRO LOG] GET /api/escalas:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.get('/admin', autenticar, exigirAdmin, async (req, res) => {
  try {
    const areasMCom = ['Midia', 'Iluminação', 'Filmagem', 'Fotografia', 'DTV', 'Direção', 'Redes Sociais'];
    const equipes = await prisma.equipe.findMany({
      where: {
        nome: {
          in: areasMCom,
        },
      },
      orderBy: {
        nome: 'asc',
      },
      select: {
        id: true,
        nome: true,
      },
    });

    const escalas = await prisma.escala.findMany({
      where: {
        equipeId: {
          in: equipes.map((equipe) => equipe.id),
        },
        OR: [
          { tipo: 'RECORRENTE' },
          { tipo: 'ESPORADICA', dataHora: { gte: new Date() } },
        ],
      },
      include: {
        equipe: {
          select: {
            id: true,
            nome: true,
          },
        },
        voluntarios: {
          include: {
            usuario: {
              select: {
                id: true,
                nomeCompleto: true,
                email: true,
                telefone: true,
                urlFoto: true,
                dataNascimento: true,
                sexo: true,
                permissoes: true,
                criadoEm: true,
                atualizadoEm: true,
                equipes: { select: { id: true, nome: true } },
                equipesLideradas: { select: { id: true, nome: true } },
              },
            },
          },
          orderBy: {
            criadoEm: 'asc',
          },
        },
      },
      orderBy: [
        { tipo: 'asc' },
        { dataHora: 'asc' },
        { equipe: { nome: 'asc' } },
      ],
    });

    return res.status(200).json({
      equipes,
      recorrentes: escalas
        .filter((escala) => escala.tipo === 'RECORRENTE')
        .map((escala) => formatarEscalaCompleta(escala, req.usuarioAutenticado.id)),
      esporadicas: escalas
        .filter((escala) => escala.tipo === 'ESPORADICA')
        .map((escala) => formatarEscalaCompleta(escala, req.usuarioAutenticado.id)),
    });
  } catch (erro) {
    console.error('[ERRO LOG] GET /api/escalas/admin:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.patch('/admin/recorrentes/:id', autenticar, exigirAdmin, async (req, res) => {
  try {
    const { titulo, diaSemana, semanaMes, horario } = req.body ?? {};
    const diaSemanaNumero = Number(diaSemana);
    const semanaMesNumero = Number(semanaMes);

    if (![0, 6].includes(diaSemanaNumero) || ![1, 2, 3, 4].includes(semanaMesNumero)) {
      return res.status(400).json({ erro: 'Informe um sábado/domingo entre o 1º e o 4º fim de semana.' });
    }

    const [horasRaw, minutosRaw] = String(horario || '18:00').split(':');
    const horas = Number(horasRaw);
    const minutos = Number(minutosRaw);

    if (Number.isNaN(horas) || Number.isNaN(minutos)) {
      return res.status(400).json({ erro: 'Horário inválido.' });
    }

    const dataHora = getDataHoraRecorrente(
      diaSemanaNumero,
      semanaMesNumero,
      getDataUtc(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1, horas, minutos),
    );

    await prisma.escala.update({
      where: {
        id: req.params.id,
      },
      data: {
        titulo: typeof titulo === 'string' && titulo.trim() ? titulo.trim() : undefined,
        diaSemana: diaSemanaNumero,
        semanaMes: semanaMesNumero,
        dataHora,
      },
    });

    return res.status(200).json({ mensagem: 'Escala recorrente atualizada com sucesso.' });
  } catch (erro) {
    if (erro.code === 'P2025') {
      return res.status(404).json({ erro: 'Escala recorrente não encontrada.' });
    }

    console.error('[ERRO LOG] PATCH /api/escalas/admin/recorrentes/:id:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.post('/admin/esporadicas', autenticar, exigirAdmin, async (req, res) => {
  try {
    const { titulo, dataHora, dataHoras, local, descricao, equipeIds = [] } = req.body ?? {};

    if (typeof titulo !== 'string' || titulo.trim().length < 3) {
      return res.status(400).json({ erro: 'Título da escala é obrigatório.' });
    }

    const datasInformadas = Array.isArray(dataHoras) && dataHoras.length > 0
      ? dataHoras
      : [dataHora].filter(Boolean);

    if (datasInformadas.length === 0) {
      return res.status(400).json({ erro: 'Informe pelo menos uma data e horário da escala.' });
    }

    if (!Array.isArray(equipeIds) || equipeIds.length === 0) {
      return res.status(400).json({ erro: 'Selecione pelo menos uma equipe.' });
    }

    const equipes = await prisma.equipe.findMany({
      where: {
        id: {
          in: equipeIds,
        },
      },
      select: {
        id: true,
      },
    });

    if (equipes.length !== equipeIds.length) {
      return res.status(400).json({ erro: 'Uma ou mais equipes selecionadas são inválidas.' });
    }

    const datas = datasInformadas.map((item) => new Date(item));

    if (datas.some((data) => Number.isNaN(data.getTime()))) {
      return res.status(400).json({ erro: 'Uma ou mais datas/horários são inválidos.' });
    }

    const grupos = datas.map((data) => ({
      data,
      grupoEsporadicoId: randomUUID(),
    }));

    await prisma.escala.createMany({
      data: grupos.flatMap(({ data, grupoEsporadicoId }) => (
        equipes.map((equipe) => ({
          titulo: titulo.trim(),
          local: typeof local === 'string' && local.trim() ? local.trim() : null,
          descricao: typeof descricao === 'string' && descricao.trim() ? descricao.trim() : null,
          tipo: 'ESPORADICA',
          diaSemana: data.getDay(),
          semanaMes: getSemanaMes(data),
          dataHora: data,
          grupoEsporadicoId,
          solicitadaPeloAdmin: true,
          equipeId: equipe.id,
        }))
      )),
    });

    return res.status(201).json({
      mensagem: `${grupos.length} escala(s) esporádica(s) criada(s) e enviada(s) aos líderes das equipes selecionadas.`,
      grupos: grupos.map((grupo) => ({
        grupoEsporadicoId: grupo.grupoEsporadicoId,
        dataHora: grupo.data,
      })),
    });
  } catch (erro) {
    console.error('[ERRO LOG] POST /api/escalas/admin/esporadicas:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.post('/admin/recorrentes', autenticar, exigirAdmin, async (req, res) => {
  try {
    const { titulo, diaSemana, semanaMes, horario, local, descricao, equipeIds = [] } = req.body ?? {};
    const diaSemanaNumero = Number(diaSemana);
    const semanaMesNumero = Number(semanaMes);

    if (![0, 6].includes(diaSemanaNumero) || ![1, 2, 3, 4].includes(semanaMesNumero)) {
      return res.status(400).json({ erro: 'Informe um sábado/domingo entre o 1º e o 4º fim de semana.' });
    }

    if (!Array.isArray(equipeIds) || equipeIds.length === 0) {
      return res.status(400).json({ erro: 'Selecione pelo menos uma equipe.' });
    }

    const [horasRaw, minutosRaw] = String(horario || '18:00').split(':');
    const horas = Number(horasRaw);
    const minutos = Number(minutosRaw);

    if (Number.isNaN(horas) || Number.isNaN(minutos)) {
      return res.status(400).json({ erro: 'Horário inválido.' });
    }

    const equipes = await prisma.equipe.findMany({
      where: {
        id: {
          in: equipeIds,
        },
      },
      select: {
        id: true,
      },
    });

    if (equipes.length !== equipeIds.length) {
      return res.status(400).json({ erro: 'Uma ou mais equipes selecionadas são inválidas.' });
    }

    const dataHora = getDataHoraRecorrente(
      diaSemanaNumero,
      semanaMesNumero,
      getDataUtc(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1, horas, minutos),
    );
    const tituloPadrao = `${semanaMesNumero}º ${diaSemanaNumero === 0 ? 'Domingo' : 'Sábado'}`;

    await prisma.escala.createMany({
      data: equipes.map((equipe) => ({
        titulo: typeof titulo === 'string' && titulo.trim() ? titulo.trim() : tituloPadrao,
        local: typeof local === 'string' && local.trim() ? local.trim() : null,
        descricao: typeof descricao === 'string' && descricao.trim() ? descricao.trim() : null,
        tipo: 'RECORRENTE',
        diaSemana: diaSemanaNumero,
        semanaMes: semanaMesNumero,
        dataHora,
        equipeId: equipe.id,
      })),
    });

    return res.status(201).json({
      mensagem: 'Escala recorrente criada para as equipes selecionadas.',
    });
  } catch (erro) {
    console.error('[ERRO LOG] POST /api/escalas/admin/recorrentes:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.get('/minhas', autenticar, async (req, res) => {
  try {
    const escalas = await prisma.voluntarioEscala.findMany({
      where: {
        usuarioId: req.usuarioAutenticado.id,
      },
      include: {
        escala: {
          include: {
            equipe: {
              select: {
                id: true,
                nome: true,
              },
            },
          },
        },
        atribuidoPor: {
          select: {
            id: true,
            nomeCompleto: true,
          },
        },
      },
      orderBy: [
        { status: 'asc' },
        { criadoEm: 'desc' },
      ],
    });

    const escalasFormatadas = escalas
      .filter((voluntarioEscala) => {
        const dataOcorrencia = getProximaOcorrencia(voluntarioEscala.escala);

        return !voluntarioEscala.substituto
          || !voluntarioEscala.dataOcorrenciaSubstituicao
          || datasIguais(voluntarioEscala.dataOcorrenciaSubstituicao, dataOcorrencia);
      })
      .map(formatarEscala);

    return res.status(200).json({
      escalas: escalasFormatadas,
    });
  } catch (erro) {
    console.error('[ERRO LOG] GET /api/escalas/minhas:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.patch('/:id/status', autenticar, async (req, res) => {
  try {
    const { status, justificativaSubstituicao, dataOcorrencia } = req.body ?? {};
    const statusPermitidos = ['PENDENTE', 'CONFIRMADA', 'PEDIU_SUBSTITUICAO'];

    if (!statusPermitidos.includes(status)) {
      return res.status(400).json({ erro: 'Status informado é inválido.' });
    }

    if (status === 'PEDIU_SUBSTITUICAO' && (!justificativaSubstituicao || String(justificativaSubstituicao).trim().length < 5)) {
      return res.status(400).json({ erro: 'Informe uma justificativa para solicitar substituição.' });
    }

    const escalaExistente = await prisma.voluntarioEscala.findFirst({
      where: {
        id: req.params.id,
        usuarioId: req.usuarioAutenticado.id,
      },
      select: {
        id: true,
        escala: true,
      },
    });

    if (!escalaExistente) {
      return res.status(404).json({ erro: 'Escala não encontrada para este usuário.' });
    }

    const escalaAtualizada = await prisma.voluntarioEscala.update({
      where: {
        id: escalaExistente.id,
      },
      data: {
        status,
        justificativaSubstituicao: status === 'PEDIU_SUBSTITUICAO'
          ? String(justificativaSubstituicao).trim()
          : null,
        dataOcorrenciaSubstituicao: status === 'PEDIU_SUBSTITUICAO'
          ? new Date(dataOcorrencia || getProximaOcorrencia(escalaExistente.escala))
          : null,
      },
      include: {
        escala: {
          include: {
            equipe: {
              select: {
                id: true,
                nome: true,
              },
            },
          },
        },
        atribuidoPor: {
          select: {
            id: true,
            nomeCompleto: true,
          },
        },
      },
    });

    if (status === 'CONFIRMADA') {
      await prisma.notificacao.updateMany({
        where: {
          usuarioId: req.usuarioAutenticado.id,
          tipo: 'CONFIRMACAO_ESCALA',
          visualizada: false,
          chave: {
            contains: `:${escalaExistente.id}:`,
          },
        },
        data: {
          visualizada: true,
          lidaEm: new Date(),
        },
      }).catch((notificationError) => {
        console.warn('[WARN] Falha ao marcar notificações de confirmação como visualizadas:', notificationError.message);
      });
    }

    return res.status(200).json({
      mensagem: 'Status da escala atualizado com sucesso.',
      escala: formatarEscala(escalaAtualizada),
    });
  } catch (erro) {
    if (erro.code === 'P2025') {
      return res.status(404).json({ erro: 'Escala não encontrada para este usuário.' });
    }

    console.error('[ERRO LOG] PATCH /api/escalas/:id/status:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

export default router;

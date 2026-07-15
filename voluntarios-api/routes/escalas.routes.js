import { Router } from 'express';
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
  return process.env.JWT_SECRET || 'chave_temporaria_dev';
}

function autenticar(req, res, next) {
  const authorization = req.headers.authorization || '';
  const [, token] = authorization.split(' ');

  if (!token) {
    return res.status(401).json({ erro: 'Token de autenticação não informado.' });
  }

  try {
    req.usuarioAutenticado = jwt.verify(token, getJwtSecret());
    return next();
  } catch {
    return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
  }
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
      tipo: voluntarioEscala.escala.tipo,
      diaSemana: voluntarioEscala.escala.diaSemana,
      semanaMes: voluntarioEscala.escala.semanaMes,
      dataHora: dataOcorrencia,
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
    tipo: escala.tipo,
    diaSemana: escala.diaSemana,
    semanaMes: escala.semanaMes,
    dataHora: dataOcorrencia,
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
        OR: [
          { tipo: 'RECORRENTE' },
          { dataHora: { gte: new Date() } },
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
                urlFoto: true,
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

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

function formatarEscala(voluntarioEscala) {
  return {
    id: voluntarioEscala.id,
    status: voluntarioEscala.status,
    justificativaSubstituicao: voluntarioEscala.justificativaSubstituicao,
    substituto: voluntarioEscala.substituto,
    criadoEm: voluntarioEscala.criadoEm,
    atualizadoEm: voluntarioEscala.atualizadoEm,
    escala: {
      id: voluntarioEscala.escala.id,
      titulo: voluntarioEscala.escala.titulo,
      tipo: voluntarioEscala.escala.tipo,
      diaSemana: voluntarioEscala.escala.diaSemana,
      dataHora: voluntarioEscala.escala.dataHora,
      equipe: voluntarioEscala.escala.equipe,
    },
    atribuidoPor: voluntarioEscala.atribuidoPor,
  };
}

function formatarEscalaCompleta(escala, usuarioId) {
  const minhaParticipacao = escala.voluntarios.find((item) => item.usuarioId === usuarioId) || null;

  return {
    id: escala.id,
    titulo: escala.titulo,
    tipo: escala.tipo,
    diaSemana: escala.diaSemana,
    dataHora: escala.dataHora,
    equipe: escala.equipe,
    voluntarios: escala.voluntarios.map((item) => ({
      id: item.id,
      status: item.status,
      justificativaSubstituicao: item.justificativaSubstituicao,
      substituto: item.substituto,
      usuario: item.usuario,
    })),
    minhaParticipacao: minhaParticipacao
        ? {
          id: minhaParticipacao.id,
          status: minhaParticipacao.status,
          justificativaSubstituicao: minhaParticipacao.justificativaSubstituicao,
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

    return res.status(200).json({
      escalas: escalas.map((escala) => formatarEscalaCompleta(escala, req.usuarioAutenticado.id)),
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

    return res.status(200).json({
      escalas: escalas.map(formatarEscala),
    });
  } catch (erro) {
    console.error('[ERRO LOG] GET /api/escalas/minhas:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.patch('/:id/status', autenticar, async (req, res) => {
  try {
    const { status, justificativaSubstituicao } = req.body ?? {};
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

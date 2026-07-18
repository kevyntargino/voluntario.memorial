import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { notificarAviso } from '../services/notificacoes.service.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

const router = Router();
const DIAS_VISIBILIDADE_VOLUNTARIO = 30;

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
  if (!req.usuarioAutenticado?.permissoes?.includes('ADMINISTRADOR')) {
    return res.status(403).json({ erro: 'Acesso restrito a administradores.' });
  }

  return next();
}

function formatarAviso(aviso) {
  const visualizacao = aviso.visualizacoes?.[0];

  return {
    id: aviso.id,
    titulo: aviso.titulo,
    mensagem: aviso.mensagem,
    dataAviso: aviso.dataAviso,
    tipo: aviso.tipo,
    equipe: aviso.equipe,
    criador: aviso.criador,
    oculto: Boolean(aviso.oculto),
    visualizado: Boolean(visualizacao),
    visualizadoEm: visualizacao?.visualizadoEm || null,
    destinatarios: aviso.destinatarios?.map((item) => item.usuario) || [],
    criadoEm: aviso.criadoEm,
  };
}

function getDataLimiteVisibilidadeVoluntario(agora = new Date()) {
  const limite = new Date(agora);
  limite.setUTCDate(limite.getUTCDate() - DIAS_VISIBILIDADE_VOLUNTARIO);
  return limite;
}

async function carregarDestinatarios({ publico, equipeIds = [], usuarioIds = [] }) {
  if (publico === 'TODOS') {
    return [];
  }

  if (publico === 'LIDERES') {
    return prisma.usuario.findMany({
      where: {
        permissoes: {
          has: 'LIDER_EQUIPE',
        },
      },
      select: { id: true },
    });
  }

  if (publico === 'VOLUNTARIOS') {
    return prisma.usuario.findMany({
      where: {
        permissoes: {
          has: 'VOLUNTARIO',
        },
      },
      select: { id: true },
    });
  }

  if (publico === 'EQUIPES') {
    return prisma.usuario.findMany({
      where: {
        OR: [
          {
            equipes: {
              some: {
                id: { in: equipeIds },
              },
            },
          },
          {
            equipesLideradas: {
              some: {
                id: { in: equipeIds },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
  }

  if (publico === 'USUARIOS') {
    return prisma.usuario.findMany({
      where: {
        id: {
          in: usuarioIds,
        },
      },
      select: { id: true },
    });
  }

  return [];
}

router.get('/', autenticar, async (req, res) => {
  try {
    const incluirVisualizados = ['todos', 'true', '1'].includes(String(req.query.visualizados || '').toLowerCase());
    const dataLimiteVisibilidade = getDataLimiteVisibilidadeVoluntario();
    const usuario = await prisma.usuario.findUnique({
      where: {
        id: req.usuarioAutenticado.id,
      },
      select: {
        equipes: {
          select: {
            id: true,
          },
        },
        equipesLideradas: {
          select: {
            id: true,
          },
        },
      },
    });

    const equipeIds = Array.from(new Set([
      ...(usuario?.equipes || []).map((equipe) => equipe.id),
      ...(usuario?.equipesLideradas || []).map((equipe) => equipe.id),
    ]));
    const filtroDestinatario = {
      OR: [
        { tipo: 'GLOBAL' },
        {
          tipo: 'EQUIPE',
          equipeId: {
            in: equipeIds,
          },
        },
        {
          destinatarios: {
            some: {
              usuarioId: req.usuarioAutenticado.id,
            },
          },
        },
      ],
    };
    const whereBase = {
      oculto: false,
      dataAviso: {
        gte: dataLimiteVisibilidade,
      },
      ...filtroDestinatario,
    };
    const [avisos, totalNaoVisualizados] = await Promise.all([
      prisma.aviso.findMany({
        where: {
          ...whereBase,
          ...(incluirVisualizados
            ? {}
            : {
                visualizacoes: {
                  none: {
                    usuarioId: req.usuarioAutenticado.id,
                  },
                },
              }),
        },
        include: {
          equipe: {
            select: {
              id: true,
              nome: true,
            },
          },
          criador: {
            select: {
              id: true,
              nomeCompleto: true,
            },
          },
          visualizacoes: {
            where: {
              usuarioId: req.usuarioAutenticado.id,
            },
            select: {
              visualizadoEm: true,
            },
          },
        },
        orderBy: [
          { dataAviso: 'desc' },
          { criadoEm: 'desc' },
        ],
      }),
      prisma.aviso.count({
        where: {
          ...whereBase,
          visualizacoes: {
            none: {
              usuarioId: req.usuarioAutenticado.id,
            },
          },
        },
      }),
    ]);

    return res.status(200).json({
      avisos: avisos.map(formatarAviso),
      totalNaoVisualizados,
    });
  } catch (erro) {
    console.error('[ERRO LOG] GET /api/avisos:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.patch('/:id/visualizar', autenticar, async (req, res) => {
  try {
    const aviso = await prisma.aviso.findFirst({
      where: {
        id: req.params.id,
        oculto: false,
        dataAviso: {
          gte: getDataLimiteVisibilidadeVoluntario(),
        },
        OR: [
          { tipo: 'GLOBAL' },
          {
            tipo: 'EQUIPE',
            equipe: {
              voluntarios: {
                some: {
                  id: req.usuarioAutenticado.id,
                },
              },
            },
          },
          {
            destinatarios: {
              some: {
                usuarioId: req.usuarioAutenticado.id,
              },
            },
          },
        ],
      },
    });

    if (!aviso) {
      return res.status(404).json({ erro: 'Aviso não encontrado.' });
    }

    await prisma.avisoVisualizacao.upsert({
      where: {
        avisoId_usuarioId: {
          avisoId: aviso.id,
          usuarioId: req.usuarioAutenticado.id,
        },
      },
      update: {
        visualizadoEm: new Date(),
      },
      create: {
        avisoId: aviso.id,
        usuarioId: req.usuarioAutenticado.id,
      },
    });

    return res.status(200).json({ mensagem: 'Aviso marcado como visualizado.' });
  } catch (erro) {
    console.error('[ERRO LOG] PATCH /api/avisos/:id/visualizar:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.get('/admin/opcoes', autenticar, exigirAdmin, async (req, res) => {
  try {
    const [equipes, usuarios] = await Promise.all([
      prisma.equipe.findMany({
        orderBy: { nome: 'asc' },
        select: {
          id: true,
          nome: true,
        },
      }),
      prisma.usuario.findMany({
        orderBy: { nomeCompleto: 'asc' },
        select: {
          id: true,
          nomeCompleto: true,
          email: true,
          permissoes: true,
          equipes: {
            select: {
              id: true,
              nome: true,
            },
          },
        },
      }),
    ]);

    const avisos = await prisma.aviso.findMany({
      take: 20,
      include: {
        equipe: {
          select: {
            id: true,
            nome: true,
          },
        },
        destinatarios: {
          include: {
            usuario: {
              select: {
                id: true,
                nomeCompleto: true,
                email: true,
              },
            },
          },
        },
        visualizacoes: {
          select: {
            usuarioId: true,
            visualizadoEm: true,
          },
        },
      },
      orderBy: [
        { dataAviso: 'desc' },
        { criadoEm: 'desc' },
      ],
    });

    return res.status(200).json({
      equipes,
      usuarios,
      avisos: avisos.map(formatarAviso),
    });
  } catch (erro) {
    console.error('[ERRO LOG] GET /api/avisos/admin/opcoes:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.post('/admin', autenticar, exigirAdmin, async (req, res) => {
  try {
    const {
      titulo,
      mensagem,
      dataAviso,
      publico = 'TODOS',
      equipeIds = [],
      usuarioIds = [],
    } = req.body ?? {};

    if (typeof titulo !== 'string' || titulo.trim().length < 3) {
      return res.status(400).json({ erro: 'Título do aviso é obrigatório.' });
    }

    if (typeof mensagem !== 'string' || mensagem.trim().length < 5) {
      return res.status(400).json({ erro: 'Descrição do aviso é obrigatória.' });
    }

    if (!dataAviso) {
      return res.status(400).json({ erro: 'Data do aviso é obrigatória.' });
    }

    const publicoPermitido = ['TODOS', 'LIDERES', 'VOLUNTARIOS', 'EQUIPES', 'USUARIOS'];

    if (!publicoPermitido.includes(publico)) {
      return res.status(400).json({ erro: 'Público do aviso é inválido.' });
    }

    if (publico === 'EQUIPES' && (!Array.isArray(equipeIds) || equipeIds.length === 0)) {
      return res.status(400).json({ erro: 'Selecione pelo menos uma equipe.' });
    }

    if (publico === 'USUARIOS' && (!Array.isArray(usuarioIds) || usuarioIds.length === 0)) {
      return res.status(400).json({ erro: 'Selecione pelo menos um usuário.' });
    }

    const destinatarios = await carregarDestinatarios({ publico, equipeIds, usuarioIds });
    const destinatariosUnicos = Array.from(new Set(destinatarios.map((usuario) => usuario.id)));

    if (publico !== 'TODOS' && destinatariosUnicos.length === 0) {
      return res.status(400).json({ erro: 'Nenhum destinatário encontrado para o público selecionado.' });
    }

    const aviso = await prisma.aviso.create({
      data: {
        titulo: titulo.trim(),
        mensagem: mensagem.trim(),
        dataAviso: new Date(dataAviso),
        tipo: publico === 'TODOS' ? 'GLOBAL' : 'INDIVIDUAL',
        criadorId: req.usuarioAutenticado.id,
        destinatarios: publico === 'TODOS'
          ? undefined
          : {
              create: destinatariosUnicos.map((usuarioId) => ({
                usuarioId,
              })),
            },
      },
    });
    const destinatariosNotificacao = publico === 'TODOS'
      ? (await prisma.usuario.findMany({ select: { id: true } })).map((usuario) => usuario.id)
      : destinatariosUnicos;

    await notificarAviso(prisma, {
      aviso,
      usuarioIds: destinatariosNotificacao,
    }).catch((notificationError) => {
      console.warn('[WARN] Falha ao criar notificações do aviso:', notificationError.message);
    });

    return res.status(201).json({
      mensagem: 'Aviso enviado com sucesso.',
      avisoId: aviso.id,
      totalDestinatarios: publico === 'TODOS' ? null : destinatariosUnicos.length,
    });
  } catch (erro) {
    console.error('[ERRO LOG] POST /api/avisos/admin:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.patch('/admin/:id/ocultar', autenticar, exigirAdmin, async (req, res) => {
  try {
    const { oculto } = req.body ?? {};
    const aviso = await prisma.aviso.update({
      where: {
        id: req.params.id,
      },
      data: {
        oculto: Boolean(oculto),
      },
    });

    return res.status(200).json({
      mensagem: aviso.oculto ? 'Aviso ocultado com sucesso.' : 'Aviso exibido com sucesso.',
      aviso: formatarAviso(aviso),
    });
  } catch (erro) {
    if (erro.code === 'P2025') {
      return res.status(404).json({ erro: 'Aviso não encontrado.' });
    }

    console.error('[ERRO LOG] PATCH /api/avisos/admin/:id/ocultar:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.delete('/admin/:id', autenticar, exigirAdmin, async (req, res) => {
  try {
    await prisma.aviso.delete({
      where: {
        id: req.params.id,
      },
    });

    return res.status(200).json({ mensagem: 'Aviso excluído com sucesso.' });
  } catch (erro) {
    if (erro.code === 'P2025') {
      return res.status(404).json({ erro: 'Aviso não encontrado.' });
    }

    console.error('[ERRO LOG] DELETE /api/avisos/admin/:id:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

export default router;

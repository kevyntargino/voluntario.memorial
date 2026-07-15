import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { gerarNotificacoesAutomaticas } from '../services/notificacoes.service.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});
const router = Router();

let ultimaGeracao = 0;

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

async function gerarComThrottle() {
  const agora = Date.now();

  if (agora - ultimaGeracao < 10 * 60 * 1000) {
    return;
  }

  ultimaGeracao = agora;
  await gerarNotificacoesAutomaticas(prisma);
}

function formatarNotificacao(notificacao) {
  return {
    id: notificacao.id,
    tipo: notificacao.tipo,
    titulo: notificacao.titulo,
    mensagem: notificacao.mensagem,
    link: notificacao.link,
    visualizada: notificacao.visualizada,
    lidaEm: notificacao.lidaEm,
    criadoEm: notificacao.criadoEm,
  };
}

router.get('/', autenticar, async (req, res) => {
  try {
    await gerarComThrottle();

    const [notificacoes, naoVisualizadas] = await Promise.all([
      prisma.notificacao.findMany({
        where: { usuarioId: req.usuarioAutenticado.id },
        take: 30,
        orderBy: { criadoEm: 'desc' },
      }),
      prisma.notificacao.count({
        where: {
          usuarioId: req.usuarioAutenticado.id,
          visualizada: false,
        },
      }),
    ]);

    return res.status(200).json({
      notificacoes: notificacoes.map(formatarNotificacao),
      naoVisualizadas,
    });
  } catch (erro) {
    console.error('[ERRO LOG] GET /api/notificacoes:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.patch('/:id/visualizar', autenticar, async (req, res) => {
  try {
    const resultado = await prisma.notificacao.updateMany({
      where: {
        id: req.params.id,
        usuarioId: req.usuarioAutenticado.id,
      },
      data: {
        visualizada: true,
        lidaEm: new Date(),
      },
    });

    if (resultado.count === 0) {
      return res.status(404).json({ erro: 'Notificação não encontrada.' });
    }

    const notificacao = await prisma.notificacao.findUnique({
      where: { id: req.params.id },
    });

    return res.status(200).json({
      mensagem: 'Notificação marcada como visualizada.',
      notificacao: formatarNotificacao(notificacao),
    });
  } catch (erro) {
    console.error('[ERRO LOG] PATCH /api/notificacoes/:id/visualizar:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.patch('/visualizar-todas', autenticar, async (req, res) => {
  try {
    await prisma.notificacao.updateMany({
      where: {
        usuarioId: req.usuarioAutenticado.id,
        visualizada: false,
      },
      data: {
        visualizada: true,
        lidaEm: new Date(),
      },
    });

    return res.status(200).json({ mensagem: 'Notificações marcadas como visualizadas.' });
  } catch (erro) {
    console.error('[ERRO LOG] PATCH /api/notificacoes/visualizar-todas:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

export default router;

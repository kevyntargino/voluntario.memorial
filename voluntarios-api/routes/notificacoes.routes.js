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

async function autenticarTokenValor(token) {
  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    return prisma.usuario.findUnique({
      where: { id: payload.id },
      select: { id: true, permissoes: true },
    });
  } catch {
    return null;
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

function extrairChavesSubscription(subscription) {
  const endpoint = typeof subscription?.endpoint === 'string' ? subscription.endpoint : '';
  const p256dh = typeof subscription?.keys?.p256dh === 'string' ? subscription.keys.p256dh : '';
  const auth = typeof subscription?.keys?.auth === 'string' ? subscription.keys.auth : '';

  return { endpoint, p256dh, auth };
}

async function carregarResumoNotificacoes(usuarioId) {
  await gerarComThrottle();

  const [notificacoes, naoVisualizadas] = await Promise.all([
    prisma.notificacao.findMany({
      where: { usuarioId },
      take: 30,
      orderBy: { criadoEm: 'desc' },
    }),
    prisma.notificacao.count({
      where: {
        usuarioId,
        visualizada: false,
      },
    }),
  ]);

  return {
    notificacoes: notificacoes.map(formatarNotificacao),
    naoVisualizadas,
  };
}

router.get('/', autenticar, async (req, res) => {
  try {
    return res.status(200).json(await carregarResumoNotificacoes(req.usuarioAutenticado.id));
  } catch (erro) {
    console.error('[ERRO LOG] GET /api/notificacoes:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.get('/stream', async (req, res) => {
  const usuario = await autenticarTokenValor(req.query.token);

  if (!usuario) {
    return res.status(401).end();
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let ultimaAssinatura = '';
  let ativo = true;

  const enviar = async () => {
    if (!ativo) return;

    try {
      const resumo = await carregarResumoNotificacoes(usuario.id);
      const assinatura = JSON.stringify({
        naoVisualizadas: resumo.naoVisualizadas,
        ids: resumo.notificacoes.map((notificacao) => `${notificacao.id}:${notificacao.visualizada}:${notificacao.lidaEm || ''}`),
      });

      if (assinatura !== ultimaAssinatura) {
        ultimaAssinatura = assinatura;
        res.write(`event: notificacoes\n`);
        res.write(`data: ${JSON.stringify(resumo)}\n\n`);
      } else {
        res.write(`event: heartbeat\n`);
        res.write(`data: ${Date.now()}\n\n`);
      }
    } catch (erro) {
      console.error('[ERRO LOG] GET /api/notificacoes/stream:', erro);
      res.write(`event: erro\n`);
      res.write(`data: ${JSON.stringify({ erro: 'Falha ao atualizar notificações.' })}\n\n`);
    }
  };

  await enviar();
  const interval = setInterval(enviar, 8000);

  req.on('close', () => {
    ativo = false;
    clearInterval(interval);
    res.end();
  });
});

router.get('/push/public-key', autenticar, async (req, res) => {
  return res.status(200).json({
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    habilitado: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
  });
});

router.post('/push/subscribe', autenticar, async (req, res) => {
  try {
    const { endpoint, p256dh, auth } = extrairChavesSubscription(req.body?.subscription);

    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ erro: 'Assinatura push inválida.' });
    }

    await prisma.webPushSubscription.upsert({
      where: { endpoint },
      update: {
        usuarioId: req.usuarioAutenticado.id,
        p256dh,
        auth,
        userAgent: req.headers['user-agent'] || null,
      },
      create: {
        usuarioId: req.usuarioAutenticado.id,
        endpoint,
        p256dh,
        auth,
        userAgent: req.headers['user-agent'] || null,
      },
    });

    return res.status(201).json({ mensagem: 'Notificações push ativadas neste dispositivo.' });
  } catch (erro) {
    console.error('[ERRO LOG] POST /api/notificacoes/push/subscribe:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.delete('/push/subscribe', autenticar, async (req, res) => {
  try {
    const { endpoint } = extrairChavesSubscription(req.body?.subscription);

    if (!endpoint) {
      return res.status(400).json({ erro: 'Assinatura push inválida.' });
    }

    await prisma.webPushSubscription.deleteMany({
      where: {
        endpoint,
        usuarioId: req.usuarioAutenticado.id,
      },
    });

    return res.status(200).json({ mensagem: 'Notificações push desativadas neste dispositivo.' });
  } catch (erro) {
    console.error('[ERRO LOG] DELETE /api/notificacoes/push/subscribe:', erro);
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

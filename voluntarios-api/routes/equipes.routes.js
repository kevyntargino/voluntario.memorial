import { Router } from 'express';
import bcrypt from 'bcrypt';
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
const areasMCom = ['Midia', 'Iluminação', 'Filmagem', 'Fotografia', 'DTV', 'Direção', 'Redes Sociais'];

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

async function getUsuarioComEquipes(usuarioId) {
  return prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: {
      id: true,
      permissoes: true,
      equipes: {
        select: {
          id: true,
          nome: true,
        },
      },
    },
  });
}

function podeGerenciar(usuario, equipeId) {
  if (!usuario) {
    return false;
  }

  if (usuario.permissoes.includes('ADMINISTRADOR')) {
    return true;
  }

  return usuario.permissoes.includes('LIDER_EQUIPE')
    && usuario.equipes.some((equipe) => equipe.id === equipeId);
}

function formatarEquipe(equipe, usuario) {
  return {
    id: equipe.id,
    nome: equipe.nome,
    podeGerenciar: podeGerenciar(usuario, equipe.id),
    voluntarios: equipe.voluntarios.map((voluntario) => ({
      id: voluntario.id,
      nomeCompleto: voluntario.nomeCompleto,
      email: voluntario.email,
      telefone: voluntario.telefone,
      urlFoto: voluntario.urlFoto,
      permissoes: voluntario.permissoes,
    })),
    escalas: equipe.escalas.map((escala) => ({
      id: escala.id,
      titulo: escala.titulo,
      tipo: escala.tipo,
      diaSemana: escala.diaSemana,
      dataHora: escala.dataHora,
      voluntarios: escala.voluntarios.map((item) => ({
        id: item.id,
        status: item.status,
        justificativaSubstituicao: item.justificativaSubstituicao,
        substituto: item.substituto,
        usuario: {
          id: item.usuario.id,
          nomeCompleto: item.usuario.nomeCompleto,
          email: item.usuario.email,
          urlFoto: item.usuario.urlFoto,
        },
      })),
    })),
  };
}

async function carregarEquipe(equipeId, usuario) {
  const equipe = await prisma.equipe.findUnique({
    where: { id: equipeId },
    include: {
      voluntarios: {
        orderBy: { nomeCompleto: 'asc' },
        select: {
          id: true,
          nomeCompleto: true,
          email: true,
          telefone: true,
          urlFoto: true,
          permissoes: true,
        },
      },
      escalas: {
        orderBy: [{ dataHora: 'asc' }, { criadoEm: 'asc' }],
        include: {
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
            orderBy: { criadoEm: 'asc' },
          },
        },
      },
    },
  });

  return equipe ? formatarEquipe(equipe, usuario) : null;
}

router.get('/minhas', autenticar, async (req, res) => {
  try {
    const usuario = await getUsuarioComEquipes(req.usuarioAutenticado.id);

    if (!usuario || (!usuario.permissoes.includes('LIDER_EQUIPE') && !usuario.permissoes.includes('ADMINISTRADOR'))) {
      return res.status(403).json({ erro: 'Acesso restrito a líderes de equipe.' });
    }

    const where = usuario.permissoes.includes('ADMINISTRADOR')
      ? { nome: { in: areasMCom } }
      : { id: { in: usuario.equipes.map((equipe) => equipe.id) } };

    const equipes = await prisma.equipe.findMany({
      where,
      orderBy: { nome: 'asc' },
      include: {
        voluntarios: {
          orderBy: { nomeCompleto: 'asc' },
          select: {
            id: true,
            nomeCompleto: true,
            email: true,
            telefone: true,
            urlFoto: true,
            permissoes: true,
          },
        },
        escalas: {
          orderBy: [{ dataHora: 'asc' }, { criadoEm: 'asc' }],
          include: {
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
              orderBy: { criadoEm: 'asc' },
            },
          },
        },
      },
    });

    return res.status(200).json({
      equipes: equipes.map((equipe) => formatarEquipe(equipe, usuario)),
    });
  } catch (erro) {
    console.error('[ERRO LOG] GET /api/equipes/minhas:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.post('/:equipeId/voluntarios', autenticar, async (req, res) => {
  try {
    const usuario = await getUsuarioComEquipes(req.usuarioAutenticado.id);

    if (!podeGerenciar(usuario, req.params.equipeId)) {
      return res.status(403).json({ erro: 'Você não pode gerenciar esta equipe.' });
    }

    const { nomeCompleto, email, telefone, senha } = req.body ?? {};
    const emailNormalizado = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (typeof nomeCompleto !== 'string' || nomeCompleto.trim().length < 3 || !emailNormalizado) {
      return res.status(400).json({ erro: 'Nome completo e e-mail são obrigatórios.' });
    }

    const senhaHash = await bcrypt.hash(senha || 'Mcom@123', 10);
    const voluntario = await prisma.usuario.upsert({
      where: { email: emailNormalizado },
      update: {
        nomeCompleto: nomeCompleto.trim(),
        telefone: typeof telefone === 'string' && telefone.trim() ? telefone.trim() : undefined,
      },
      create: {
        nomeCompleto: nomeCompleto.trim(),
        email: emailNormalizado,
        telefone: typeof telefone === 'string' && telefone.trim() ? telefone.trim() : null,
        senhaHash,
        permissoes: ['VOLUNTARIO'],
      },
    });

    await prisma.equipe.update({
      where: { id: req.params.equipeId },
      data: {
        voluntarios: {
          connect: { id: voluntario.id },
        },
      },
    });

    const equipe = await carregarEquipe(req.params.equipeId, usuario);

    return res.status(201).json({
      mensagem: 'Voluntário cadastrado na equipe.',
      equipe,
      senhaTemporaria: senha || 'Mcom@123',
    });
  } catch (erro) {
    console.error('[ERRO LOG] POST /api/equipes/:equipeId/voluntarios:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.delete('/:equipeId/voluntarios/:usuarioId', autenticar, async (req, res) => {
  try {
    const usuario = await getUsuarioComEquipes(req.usuarioAutenticado.id);

    if (!podeGerenciar(usuario, req.params.equipeId)) {
      return res.status(403).json({ erro: 'Você não pode gerenciar esta equipe.' });
    }

    await prisma.equipe.update({
      where: { id: req.params.equipeId },
      data: {
        voluntarios: {
          disconnect: { id: req.params.usuarioId },
        },
      },
    });

    await prisma.voluntarioEscala.deleteMany({
      where: {
        usuarioId: req.params.usuarioId,
        escala: {
          equipeId: req.params.equipeId,
        },
      },
    });

    const equipe = await carregarEquipe(req.params.equipeId, usuario);

    return res.status(200).json({
      mensagem: 'Voluntário removido da equipe.',
      equipe,
    });
  } catch (erro) {
    console.error('[ERRO LOG] DELETE /api/equipes/:equipeId/voluntarios/:usuarioId:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.post('/:equipeId/substituicoes/:participacaoId/atribuir', autenticar, async (req, res) => {
  try {
    const usuario = await getUsuarioComEquipes(req.usuarioAutenticado.id);

    if (!podeGerenciar(usuario, req.params.equipeId)) {
      return res.status(403).json({ erro: 'Você não pode gerenciar esta equipe.' });
    }

    const { substitutoId } = req.body ?? {};

    if (!substitutoId) {
      return res.status(400).json({ erro: 'Selecione um voluntário substituto.' });
    }

    const pedido = await prisma.voluntarioEscala.findFirst({
      where: {
        id: req.params.participacaoId,
        status: 'PEDIU_SUBSTITUICAO',
        escala: {
          equipeId: req.params.equipeId,
        },
      },
      select: {
        escalaId: true,
        usuarioId: true,
      },
    });

    if (!pedido) {
      return res.status(404).json({ erro: 'Solicitação de substituição não encontrada.' });
    }

    if (pedido.usuarioId === substitutoId) {
      return res.status(400).json({ erro: 'O substituto precisa ser outro voluntário.' });
    }

    const substitutoNaEquipe = await prisma.equipe.findFirst({
      where: {
        id: req.params.equipeId,
        voluntarios: {
          some: {
            id: substitutoId,
          },
        },
      },
      select: { id: true },
    });

    if (!substitutoNaEquipe) {
      return res.status(400).json({ erro: 'O substituto precisa estar cadastrado nesta equipe.' });
    }

    await prisma.voluntarioEscala.upsert({
      where: {
        usuarioId_escalaId: {
          usuarioId: substitutoId,
          escalaId: pedido.escalaId,
        },
      },
      update: {
        substituto: true,
        status: 'PENDENTE',
      },
      create: {
        usuarioId: substitutoId,
        escalaId: pedido.escalaId,
        substituto: true,
        status: 'PENDENTE',
        atribuidoPorId: req.usuarioAutenticado.id,
      },
    });

    const equipe = await carregarEquipe(req.params.equipeId, usuario);

    return res.status(200).json({
      mensagem: 'Substituto atribuído com sucesso.',
      equipe,
    });
  } catch (erro) {
    console.error('[ERRO LOG] POST /api/equipes/:equipeId/substituicoes/:participacaoId/atribuir:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.post('/:equipeId/escalas', autenticar, async (req, res) => {
  try {
    const usuario = await getUsuarioComEquipes(req.usuarioAutenticado.id);

    if (!podeGerenciar(usuario, req.params.equipeId)) {
      return res.status(403).json({ erro: 'Você não pode gerenciar esta equipe.' });
    }

    const { titulo, dataHora, voluntarioIds = [], substitutoIds = [] } = req.body ?? {};

    if (!dataHora) {
      return res.status(400).json({ erro: 'Data e horário da escala são obrigatórios.' });
    }

    const data = new Date(dataHora);
    const escala = await prisma.escala.create({
      data: {
        titulo: typeof titulo === 'string' && titulo.trim() ? titulo.trim() : 'Escala da equipe',
        tipo: 'ESPORADICA',
        diaSemana: data.getDay(),
        dataHora: data,
        equipeId: req.params.equipeId,
        voluntarios: {
          create: voluntarioIds.map((usuarioId) => ({
            usuarioId,
            substituto: substitutoIds.includes(usuarioId),
            atribuidoPorId: req.usuarioAutenticado.id,
          })),
        },
      },
    });

    const equipe = await carregarEquipe(req.params.equipeId, usuario);

    return res.status(201).json({
      mensagem: 'Escala criada com sucesso.',
      escalaId: escala.id,
      equipe,
    });
  } catch (erro) {
    console.error('[ERRO LOG] POST /api/equipes/:equipeId/escalas:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.patch('/:equipeId/escalas/:escalaId', autenticar, async (req, res) => {
  try {
    const usuario = await getUsuarioComEquipes(req.usuarioAutenticado.id);

    if (!podeGerenciar(usuario, req.params.equipeId)) {
      return res.status(403).json({ erro: 'Você não pode gerenciar esta equipe.' });
    }

    const { titulo, dataHora, voluntarioIds = [], substitutoIds = [] } = req.body ?? {};
    const data = dataHora ? new Date(dataHora) : null;

    const escalaExistente = await prisma.escala.findFirst({
      where: {
        id: req.params.escalaId,
        equipeId: req.params.equipeId,
      },
      select: { id: true },
    });

    if (!escalaExistente) {
      return res.status(404).json({ erro: 'Escala não encontrada nesta equipe.' });
    }

    await prisma.escala.update({
      where: {
        id: escalaExistente.id,
      },
      data: {
        titulo: typeof titulo === 'string' && titulo.trim() ? titulo.trim() : undefined,
        dataHora: data || undefined,
        diaSemana: data ? data.getDay() : undefined,
      },
    });

    await prisma.voluntarioEscala.deleteMany({
      where: {
        escalaId: req.params.escalaId,
        usuarioId: {
          notIn: voluntarioIds,
        },
      },
    });

    for (const usuarioId of voluntarioIds) {
      await prisma.voluntarioEscala.upsert({
        where: {
          usuarioId_escalaId: {
            usuarioId,
            escalaId: req.params.escalaId,
          },
        },
        update: {
          substituto: substitutoIds.includes(usuarioId),
        },
        create: {
          usuarioId,
          escalaId: req.params.escalaId,
          substituto: substitutoIds.includes(usuarioId),
          atribuidoPorId: req.usuarioAutenticado.id,
        },
      });
    }

    const equipe = await carregarEquipe(req.params.equipeId, usuario);

    return res.status(200).json({
      mensagem: 'Escala atualizada com sucesso.',
      equipe,
    });
  } catch (erro) {
    console.error('[ERRO LOG] PATCH /api/equipes/:equipeId/escalas/:escalaId:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.delete('/:equipeId/escalas/:escalaId', autenticar, async (req, res) => {
  try {
    const usuario = await getUsuarioComEquipes(req.usuarioAutenticado.id);

    if (!podeGerenciar(usuario, req.params.equipeId)) {
      return res.status(403).json({ erro: 'Você não pode gerenciar esta equipe.' });
    }

    const escalaExistente = await prisma.escala.findFirst({
      where: {
        id: req.params.escalaId,
        equipeId: req.params.equipeId,
      },
      select: { id: true },
    });

    if (!escalaExistente) {
      return res.status(404).json({ erro: 'Escala não encontrada nesta equipe.' });
    }

    await prisma.escala.delete({
      where: {
        id: escalaExistente.id,
      },
    });

    const equipe = await carregarEquipe(req.params.equipeId, usuario);

    return res.status(200).json({
      mensagem: 'Escala removida com sucesso.',
      equipe,
    });
  } catch (erro) {
    console.error('[ERRO LOG] DELETE /api/equipes/:equipeId/escalas/:escalaId:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

export default router;

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

function formatarUsuario(usuario) {
  return {
    id: usuario.id,
    nomeCompleto: usuario.nomeCompleto,
    email: usuario.email,
    telefone: usuario.telefone,
    permissoes: usuario.permissoes,
    equipes: usuario.equipes,
  };
}

function formatarEquipe(equipe) {
  const voluntarios = equipe.voluntarios || [];
  const lideres = voluntarios.filter((usuario) => usuario.permissoes.includes('LIDER_EQUIPE'));

  return {
    id: equipe.id,
    nome: equipe.nome,
    lideres: lideres.map(formatarUsuario),
    voluntarios: voluntarios.map(formatarUsuario),
  };
}

function formatarParticipacao(participacao) {
  return {
    id: participacao.id,
    status: participacao.status,
    substituto: participacao.substituto,
    usuario: {
      id: participacao.usuario.id,
      nomeCompleto: participacao.usuario.nomeCompleto,
      email: participacao.usuario.email,
      telefone: participacao.usuario.telefone,
      urlFoto: participacao.usuario.urlFoto,
    },
  };
}

function formatarEscala(escala) {
  if (!escala) {
    return null;
  }

  return {
    id: escala.id,
    titulo: escala.titulo,
    local: escala.local,
    descricao: escala.descricao,
    tipo: escala.tipo,
    dataHora: escala.dataHora,
    equipe: escala.equipe,
    voluntarios: escala.voluntarios.map(formatarParticipacao),
  };
}

router.get('/dashboard', autenticar, exigirAdmin, async (req, res) => {
  try {
    const agora = new Date();
    const [
      totalVoluntarios,
      totalEquipes,
      equipes,
      usuarios,
      ultimasEscalas,
      proximaEscala,
    ] = await Promise.all([
      prisma.usuario.count({
        where: {
          permissoes: {
            has: 'VOLUNTARIO',
          },
        },
      }),
      prisma.equipe.count(),
      prisma.equipe.findMany({
        orderBy: { nome: 'asc' },
        include: {
          voluntarios: {
            orderBy: { nomeCompleto: 'asc' },
            include: {
              equipes: {
                select: {
                  id: true,
                  nome: true,
                },
              },
            },
          },
        },
      }),
      prisma.usuario.findMany({
        orderBy: { nomeCompleto: 'asc' },
        include: {
          equipes: {
            select: {
              id: true,
              nome: true,
            },
          },
        },
      }),
      prisma.escala.findMany({
        take: 4,
        where: {
          dataHora: {
            lte: agora,
          },
        },
        include: {
          voluntarios: true,
        },
        orderBy: {
          dataHora: 'desc',
        },
      }),
      prisma.escala.findFirst({
        where: {
          dataHora: {
            gte: agora,
          },
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
                },
              },
            },
            orderBy: { criadoEm: 'asc' },
          },
        },
        orderBy: {
          dataHora: 'asc',
        },
      }),
    ]);

    const ausenciasUltimas4 = ultimasEscalas.reduce((total, escala) => (
      total + escala.voluntarios.filter((item) => item.status === 'AUSENTE').length
    ), 0);

    return res.status(200).json({
      metricas: {
        totalVoluntarios,
        totalEquipes,
        ausenciasUltimas4,
      },
      equipes: equipes.map(formatarEquipe),
      usuarios: usuarios.map(formatarUsuario),
      lideres: usuarios.filter((usuario) => usuario.permissoes.includes('LIDER_EQUIPE')).map(formatarUsuario),
      proximaEscala: formatarEscala(proximaEscala),
    });
  } catch (erro) {
    console.error('[ERRO LOG] GET /api/admin/dashboard:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.post('/equipes', autenticar, exigirAdmin, async (req, res) => {
  try {
    const { nome } = req.body ?? {};

    if (typeof nome !== 'string' || nome.trim().length < 2) {
      return res.status(400).json({ erro: 'Nome da equipe é obrigatório.' });
    }

    const equipe = await prisma.equipe.create({
      data: {
        nome: nome.trim(),
      },
      include: {
        voluntarios: {
          include: {
            equipes: {
              select: {
                id: true,
                nome: true,
              },
            },
          },
        },
      },
    });

    return res.status(201).json({
      mensagem: 'Equipe criada com sucesso.',
      equipe: formatarEquipe(equipe),
    });
  } catch (erro) {
    if (erro.code === 'P2002') {
      return res.status(409).json({ erro: 'Já existe uma equipe com esse nome.' });
    }

    console.error('[ERRO LOG] POST /api/admin/equipes:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.delete('/equipes/:id', autenticar, exigirAdmin, async (req, res) => {
  try {
    await prisma.equipe.delete({
      where: {
        id: req.params.id,
      },
    });

    return res.status(200).json({ mensagem: 'Equipe excluída com sucesso.' });
  } catch (erro) {
    if (erro.code === 'P2025') {
      return res.status(404).json({ erro: 'Equipe não encontrada.' });
    }

    console.error('[ERRO LOG] DELETE /api/admin/equipes/:id:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.patch('/usuarios/:id', autenticar, exigirAdmin, async (req, res) => {
  try {
    const { nomeCompleto, telefone, permissoes = [], equipeIds = [] } = req.body ?? {};
    const permissoesPermitidas = ['ADMINISTRADOR', 'LIDER_EQUIPE', 'VOLUNTARIO'];
    const permissoesValidas = Array.from(new Set(permissoes)).filter((permissao) => permissoesPermitidas.includes(permissao));

    if (typeof nomeCompleto !== 'string' || nomeCompleto.trim().length < 3) {
      return res.status(400).json({ erro: 'Nome completo é obrigatório.' });
    }

    if (permissoesValidas.length === 0) {
      return res.status(400).json({ erro: 'Selecione pelo menos uma permissão.' });
    }

    const usuario = await prisma.usuario.update({
      where: {
        id: req.params.id,
      },
      data: {
        nomeCompleto: nomeCompleto.trim(),
        telefone: typeof telefone === 'string' && telefone.trim() ? telefone.trim() : null,
        permissoes: permissoesValidas,
        equipes: {
          set: Array.isArray(equipeIds) ? equipeIds.map((id) => ({ id })) : [],
        },
      },
      include: {
        equipes: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
    });

    return res.status(200).json({
      mensagem: 'Usuário atualizado com sucesso.',
      usuario: formatarUsuario(usuario),
    });
  } catch (erro) {
    if (erro.code === 'P2025') {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }

    console.error('[ERRO LOG] PATCH /api/admin/usuarios/:id:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.delete('/usuarios/:id', autenticar, exigirAdmin, async (req, res) => {
  try {
    if (req.params.id === req.usuarioAutenticado.id) {
      return res.status(400).json({ erro: 'Você não pode excluir seu próprio usuário.' });
    }

    await prisma.usuario.delete({
      where: {
        id: req.params.id,
      },
    });

    return res.status(200).json({ mensagem: 'Usuário excluído com sucesso.' });
  } catch (erro) {
    if (erro.code === 'P2025') {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }

    console.error('[ERRO LOG] DELETE /api/admin/usuarios/:id:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

export default router;

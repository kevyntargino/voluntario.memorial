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
      equipesLideradas: {
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
    && usuario.equipesLideradas.some((equipe) => equipe.id === equipeId);
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
    usuario: {
      id: item.usuario.id,
      nomeCompleto: item.usuario.nomeCompleto,
      email: item.usuario.email,
      telefone: item.usuario.telefone,
      urlFoto: item.usuario.urlFoto,
      dataNascimento: item.usuario.dataNascimento,
      sexo: item.usuario.sexo,
      permissoes: item.usuario.permissoes,
      equipes: item.usuario.equipes || [],
      equipesLideradas: item.usuario.equipesLideradas || [],
      criadoEm: item.usuario.criadoEm,
      atualizadoEm: item.usuario.atualizadoEm,
    },
  };
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
      dataNascimento: voluntario.dataNascimento,
      sexo: voluntario.sexo,
      permissoes: voluntario.permissoes,
      equipes: voluntario.equipes || [],
      equipesLideradas: voluntario.equipesLideradas || [],
      criadoEm: voluntario.criadoEm,
      atualizadoEm: voluntario.atualizadoEm,
    })),
    escalas: equipe.escalas.map((escala) => {
      const dataOcorrencia = getProximaOcorrencia(escala);

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
        voluntarios: escala.voluntarios
          .map((item) => formatarParticipacao(item, dataOcorrencia))
          .filter(Boolean),
      };
    }),
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
          dataNascimento: true,
          sexo: true,
          permissoes: true,
          criadoEm: true,
          atualizadoEm: true,
          equipes: { select: { id: true, nome: true } },
          equipesLideradas: { select: { id: true, nome: true } },
        },
      },
      escalas: {
        where: {
          OR: [
            { tipo: 'RECORRENTE' },
            { dataHora: { gte: new Date() } },
          ],
        },
        orderBy: [{ dataHora: 'asc' }, { criadoEm: 'asc' }],
        include: {
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
      : { id: { in: usuario.equipesLideradas.map((equipe) => equipe.id) } };

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
            dataNascimento: true,
            sexo: true,
            permissoes: true,
            criadoEm: true,
            atualizadoEm: true,
            equipes: { select: { id: true, nome: true } },
            equipesLideradas: { select: { id: true, nome: true } },
          },
        },
        escalas: {
          where: {
            OR: [
              { tipo: 'RECORRENTE' },
              { dataHora: { gte: new Date() } },
            ],
          },
          orderBy: [{ dataHora: 'asc' }, { criadoEm: 'asc' }],
          include: {
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
        dataOcorrenciaSubstituicao: true,
        escala: true,
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

    const dataOcorrenciaSubstituicao = pedido.dataOcorrenciaSubstituicao || getProximaOcorrencia(pedido.escala);

    await prisma.$transaction([
      prisma.voluntarioEscala.update({
        where: {
          id: req.params.participacaoId,
        },
        data: {
          status: 'AUSENTE',
          dataOcorrenciaSubstituicao,
        },
      }),
      prisma.voluntarioEscala.upsert({
        where: {
          usuarioId_escalaId: {
            usuarioId: substitutoId,
            escalaId: pedido.escalaId,
          },
        },
        update: {
          substituto: true,
          status: 'PENDENTE',
          dataOcorrenciaSubstituicao,
          atribuidoPorId: req.usuarioAutenticado.id,
        },
        create: {
          usuarioId: substitutoId,
          escalaId: pedido.escalaId,
          substituto: true,
          status: 'PENDENTE',
          dataOcorrenciaSubstituicao,
          atribuidoPorId: req.usuarioAutenticado.id,
        },
      }),
    ]);

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
  return res.status(403).json({ erro: 'Escalas são criadas somente pelo administrador.' });
});

router.patch('/:equipeId/escalas/:escalaId', autenticar, async (req, res) => {
  try {
    const usuario = await getUsuarioComEquipes(req.usuarioAutenticado.id);

    if (!podeGerenciar(usuario, req.params.equipeId)) {
      return res.status(403).json({ erro: 'Você não pode gerenciar esta equipe.' });
    }

    const { voluntarioIds = [], substitutoIds = [] } = req.body ?? {};

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

    const voluntariosDaEquipe = await prisma.equipe.findUnique({
      where: { id: req.params.equipeId },
      select: {
        voluntarios: {
          select: { id: true },
        },
      },
    });
    const idsPermitidos = new Set((voluntariosDaEquipe?.voluntarios || []).map((voluntario) => voluntario.id));
    const voluntarioIdsValidos = Array.from(new Set(voluntarioIds)).filter((id) => idsPermitidos.has(id));
    const substitutoIdsValidos = Array.from(new Set(substitutoIds)).filter((id) => voluntarioIdsValidos.includes(id));

    await prisma.voluntarioEscala.deleteMany({
      where: {
        escalaId: req.params.escalaId,
        usuarioId: {
          notIn: voluntarioIdsValidos,
        },
      },
    });

    for (const usuarioId of voluntarioIdsValidos) {
      await prisma.voluntarioEscala.upsert({
        where: {
          usuarioId_escalaId: {
            usuarioId,
            escalaId: req.params.escalaId,
          },
        },
        update: {
          substituto: substitutoIdsValidos.includes(usuarioId),
        },
        create: {
          usuarioId,
          escalaId: req.params.escalaId,
          substituto: substitutoIdsValidos.includes(usuarioId),
          atribuidoPorId: req.usuarioAutenticado.id,
        },
      });
    }

    const equipe = await carregarEquipe(req.params.equipeId, usuario);

    return res.status(200).json({
      mensagem: 'Voluntários atribuídos com sucesso.',
      equipe,
    });
  } catch (erro) {
    console.error('[ERRO LOG] PATCH /api/equipes/:equipeId/escalas/:escalaId:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.delete('/:equipeId/escalas/:escalaId', autenticar, async (req, res) => {
  return res.status(403).json({ erro: 'Escalas são removidas somente pelo administrador.' });
});

export default router;

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  notificarConfirmacaoEscala,
  notificarNovaEscalaAdmin,
  notificarPedidoSubstituicao,
} from '../services/notificacoes.service.js';
import { escalaEstaEncerrada, getAgoraEscalas } from '../utils/escalas.js';
import {
  aplicarModelosVoluntariosEscalas,
  garantirOcorrenciasEventos,
  gerarDatasEvento,
  getInicioHistoricoEscalas,
  getLimiteEscalasFuturas,
} from '../services/eventos.service.js';
import { apagarObjetoStorage } from '../utils/storage.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

const router = Router();
const timeZoneEventos = process.env.EVENT_TIME_ZONE || 'America/Campo_Grande';
const nomesDiasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;
const ANTECEDENCIA_CONFIRMACAO_ESCALA_MS = 5 * DIA_MS;
const LIMITE_ACAO_ESCALA_ANTES_INICIO_MS = 2 * HORA_MS;
const DURACAO_REFERENCIA_EVENTO_MS = 2 * HORA_MS;
const JANELA_PROXIMA_ESCALA_APOS_TERMINO_MS = 3 * HORA_MS;
const RETENCAO_ATALHO_PROXIMA_ESCALA_MS = DURACAO_REFERENCIA_EVENTO_MS + JANELA_PROXIMA_ESCALA_APOS_TERMINO_MS;

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

function apagarArquivosOrdensCulto(ordensCulto) {
  const keys = [...new Set((ordensCulto || []).map((ordem) => ordem.arquivoKey).filter(Boolean))];

  for (const key of keys) {
    apagarObjetoStorage(key, {
      prefixosPermitidos: ['ordens-culto/'],
      label: 'ordem de culto removida',
    }).catch((deleteError) => {
      console.warn('[WARN] Falha ao remover ordem de culto do storage:', deleteError.message);
    });
  }
}

function getSemanaMes(data) {
  return Math.ceil(data.getUTCDate() / 7);
}

function normalizarModeloVoluntarios(modeloVoluntarios, equipes) {
  if (!Array.isArray(modeloVoluntarios) || modeloVoluntarios.length === 0) {
    return { modelos: [] };
  }

  const equipesPorId = new Map(equipes.map((equipe) => [
    equipe.id,
    new Set((equipe.voluntarios || []).map((voluntario) => voluntario.id)),
  ]));
  const modelos = [];
  const vistos = new Set();

  for (const item of modeloVoluntarios) {
    const equipeId = String(item?.equipeId || '');
    const semanaMes = Number(item?.semanaMes);
    const usuarioIds = Array.isArray(item?.usuarioIds) ? item.usuarioIds : [];
    const voluntariosDaEquipe = equipesPorId.get(equipeId);

    if (!voluntariosDaEquipe) {
      return { erro: 'O modelo de voluntários contém uma equipe que não faz parte do evento.' };
    }

    if (!Number.isInteger(semanaMes) || semanaMes < 1 || semanaMes > 5) {
      return { erro: 'O modelo de voluntários deve usar semanas de 1 a 5.' };
    }

    for (const usuarioId of [...new Set(usuarioIds.filter(Boolean).map(String))]) {
      if (!voluntariosDaEquipe.has(usuarioId)) {
        return { erro: 'O modelo contém voluntário que não pertence à equipe selecionada.' };
      }

      const chave = `${equipeId}:${semanaMes}:${usuarioId}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      modelos.push({ equipeId, semanaMes, usuarioId });
    }
  }

  return { modelos };
}

function parseDataHoraEvento(valor) {
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor;
  }

  const texto = String(valor || '').trim();
  const dataHoraLocal = texto.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);

  if (dataHoraLocal) {
    const [, anoRaw, mesRaw, diaRaw, horasRaw, minutosRaw] = dataHoraLocal;
    const ano = Number(anoRaw);
    const mes = Number(mesRaw);
    const dia = Number(diaRaw);
    const horas = Number(horasRaw);
    const minutos = Number(minutosRaw);
    const data = getDataUtc(ano, mes - 1, dia, horas, minutos);

    if (
      data.getUTCFullYear() !== ano
      || data.getUTCMonth() !== mes - 1
      || data.getUTCDate() !== dia
      || data.getUTCHours() !== horas
      || data.getUTCMinutes() !== minutos
    ) {
      return null;
    }

    return data;
  }

  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? null : data;
}

function getDataHoraRecorrente(diaSemana, semanaMes, dataHora) {
  const { horas, minutos } = getHorarioBase(dataHora);
  return getProximaDataDaRegra(
    diaSemana,
    semanaMes,
    `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`,
    'MENSAL',
  );
}

function getProximaDataDaRegra(diaSemana, semanaMes, horario, frequencia) {
  const [horasRaw, minutosRaw] = String(horario || '').split(':');
  const horas = Number(horasRaw);
  const minutos = Number(minutosRaw);

  if (!Number.isInteger(horas) || horas < 0 || horas > 23 || !Number.isInteger(minutos) || minutos < 0 || minutos > 59) {
    return null;
  }

  const agora = getAgoraEvento();

  if (frequencia === 'SEMANAL') {
    const diasAteOcorrencia = (diaSemana - agora.getUTCDay() + 7) % 7;
    let ocorrencia = getDataUtc(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() + diasAteOcorrencia, horas, minutos);
    if (ocorrencia <= agora) ocorrencia = new Date(ocorrencia.getTime() + 7 * 86400000);
    return ocorrencia;
  }

  for (let offsetMes = 0; offsetMes < 18; offsetMes += 1) {
    const base = getDataUtc(agora.getUTCFullYear(), agora.getUTCMonth() + offsetMes, 1);
    const ocorrencia = getOcorrenciaNoMes(base.getUTCFullYear(), base.getUTCMonth(), diaSemana, semanaMes, getDataUtc(base.getUTCFullYear(), base.getUTCMonth(), 1, horas, minutos));
    if (ocorrencia && ocorrencia > agora) return ocorrencia;
  }

  return null;
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

function getAgoraEvento() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZoneEventos,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const valor = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));

  return getDataUtc(
    Number(valor.year),
    Number(valor.month) - 1,
    Number(valor.day),
    Number(valor.hour),
    Number(valor.minute),
  );
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

function normalizarIds(ids) {
  if (!Array.isArray(ids)) return [];

  return Array.from(new Set(ids.filter(Boolean).map(String)));
}

function normalizarDadosTextoEvento({ titulo, local, descricao }) {
  const tituloNormalizado = typeof titulo === 'string' ? titulo.trim() : '';

  return {
    titulo: tituloNormalizado,
    local: typeof local === 'string' && local.trim() ? local.trim() : null,
    descricao: typeof descricao === 'string' && descricao.trim() ? descricao.trim() : null,
  };
}

function parseHorarioEvento(horario) {
  const [horasRaw, minutosRaw] = String(horario || '18:00').split(':');
  const horas = Number(horasRaw);
  const minutos = Number(minutosRaw);

  if (!Number.isInteger(horas) || horas < 0 || horas > 23 || !Number.isInteger(minutos) || minutos < 0 || minutos > 59) {
    return null;
  }

  return { horas, minutos };
}

function normalizarDatasUnicas(datas) {
  const datasPorIso = new Map();

  for (const data of datas) {
    if (!data || Number.isNaN(new Date(data).getTime())) continue;
    const dataNormalizada = new Date(data);
    datasPorIso.set(dataNormalizada.toISOString(), dataNormalizada);
  }

  return Array.from(datasPorIso.values())
    .sort((a, b) => a.getTime() - b.getTime());
}

function getChavesDatas(datas) {
  return new Set(datas.map((data) => new Date(data).toISOString()));
}

function getErroJanelaAlteracaoEscala(dataOcorrencia, agora = getAgoraEscalas()) {
  const inicio = new Date(dataOcorrencia).getTime();

  if (Number.isNaN(inicio)) {
    return 'Data da escala inválida.';
  }

  const atual = agora.getTime();
  const abertura = inicio - ANTECEDENCIA_CONFIRMACAO_ESCALA_MS;
  const fechamento = inicio - LIMITE_ACAO_ESCALA_ANTES_INICIO_MS;

  if (atual < abertura) {
    return 'A confirmação da escala fica disponível a partir de 5 dias antes do evento.';
  }

  if (atual >= fechamento) {
    return 'O prazo para confirmar ou solicitar substituição encerra 2 horas antes do evento.';
  }

  return null;
}

function formatarParticipacao(item, dataOcorrencia, tipoEscala) {
  const temOcorrenciaEspecifica = Boolean(item.dataOcorrenciaSubstituicao);

  if (item.substituto && temOcorrenciaEspecifica && !datasIguais(item.dataOcorrenciaSubstituicao, dataOcorrencia)) {
    return null;
  }

  const usarStatusEspecifico = tipoEscala !== 'RECORRENTE'
    || datasIguais(item.dataOcorrenciaStatus, dataOcorrencia);
  const usarSubstituicaoEspecifica = !temOcorrenciaEspecifica
    || datasIguais(item.dataOcorrenciaSubstituicao, dataOcorrencia);

  return {
    id: item.id,
    status: usarStatusEspecifico ? item.status : 'PENDENTE',
    justificativaSubstituicao: usarSubstituicaoEspecifica ? item.justificativaSubstituicao : null,
    dataOcorrenciaStatus: item.dataOcorrenciaStatus,
    dataOcorrenciaSubstituicao: item.dataOcorrenciaSubstituicao,
    substituto: usarSubstituicaoEspecifica ? item.substituto : false,
    usuario: item.usuario,
  };
}

function getDadosRecorrenciaEscala(escala) {
  return {
    frequencia: escala.evento?.frequencia || null,
    diaSemana: escala.evento?.diaSemana ?? escala.diaSemana,
    semanaMes: escala.evento?.semanaMes ?? escala.semanaMes,
  };
}

function formatarEscala(voluntarioEscala) {
  const dataOcorrencia = getProximaOcorrencia(voluntarioEscala.escala);
  const usarStatusEspecifico = voluntarioEscala.escala.tipo !== 'RECORRENTE'
    || datasIguais(voluntarioEscala.dataOcorrenciaStatus, dataOcorrencia);
  const recorrencia = getDadosRecorrenciaEscala(voluntarioEscala.escala);

  return {
    id: voluntarioEscala.id,
    status: usarStatusEspecifico ? voluntarioEscala.status : 'PENDENTE',
    justificativaSubstituicao: datasIguais(voluntarioEscala.dataOcorrenciaSubstituicao, dataOcorrencia)
      ? voluntarioEscala.justificativaSubstituicao
      : null,
    dataOcorrenciaSubstituicao: voluntarioEscala.dataOcorrenciaSubstituicao,
    dataOcorrenciaStatus: voluntarioEscala.dataOcorrenciaStatus,
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
      frequencia: recorrencia.frequencia,
      diaSemana: recorrencia.diaSemana,
      semanaMes: recorrencia.semanaMes,
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
    .map((item) => formatarParticipacao(item, dataOcorrencia, escala.tipo))
    .filter(Boolean);
  const minhaParticipacaoBase = escala.voluntarios.find((item) => item.usuarioId === usuarioId) || null;
  const minhaParticipacao = minhaParticipacaoBase ? formatarParticipacao(minhaParticipacaoBase, dataOcorrencia, escala.tipo) : null;
  const ordem = escala.evento?.ordensCulto?.find((item) => datasIguais(item.dataHora, dataOcorrencia)) || null;
  const recorrencia = getDadosRecorrenciaEscala(escala);

  return {
    id: escala.id,
    titulo: escala.titulo,
    local: escala.local,
    descricao: escala.descricao,
    tipo: escala.tipo,
    frequencia: recorrencia.frequencia,
    diaSemana: recorrencia.diaSemana,
    semanaMes: recorrencia.semanaMes,
    dataHora: dataOcorrencia,
    grupoEsporadicoId: escala.grupoEsporadicoId,
    eventoId: escala.eventoId,
    evento: escala.evento ? {
      id: escala.evento.id,
      titulo: escala.evento.titulo,
      frequencia: escala.evento.frequencia,
      diaSemana: escala.evento.diaSemana,
      semanaMes: escala.evento.semanaMes,
    } : null,
    ordemCulto: ordem ? {
      id: ordem.id,
      titulo: ordem.titulo,
      dataHora: ordem.dataHora,
      arquivoUrl: `/api/ordens-culto/${ordem.id}/arquivo`,
    } : null,
    solicitadaPeloAdmin: escala.solicitadaPeloAdmin,
    encerrada: escalaEstaEncerrada(dataOcorrencia),
    equipe: escala.equipe,
    voluntarios,
    minhaParticipacao: minhaParticipacao
        ? {
          id: minhaParticipacao.id,
          status: minhaParticipacao.status,
          dataOcorrenciaStatus: minhaParticipacao.dataOcorrenciaStatus,
          justificativaSubstituicao: minhaParticipacao.justificativaSubstituicao,
          dataOcorrenciaSubstituicao: minhaParticipacao.dataOcorrenciaSubstituicao,
          substituto: minhaParticipacao.substituto,
        }
      : null,
  };
}

router.get('/', autenticar, async (req, res) => {
  try {
    await garantirOcorrenciasEventos(prisma);
    const visao = req.query.visao === 'minhas' ? 'minhas' : 'todas';
    const agora = getAgoraEscalas();
    const usarJanelaAtalhoProxima = ['1', 'true'].includes(String(req.query.atalhoProxima || '').toLowerCase());
    const inicioBusca = usarJanelaAtalhoProxima
      ? new Date(agora.getTime() - RETENCAO_ATALHO_PROXIMA_ESCALA_MS)
      : agora;

    const escalas = await prisma.escala.findMany({
      where: {
        dataHora: { gte: inicioBusca },
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
        evento: { include: { ordensCulto: true } },
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
    await garantirOcorrenciasEventos(prisma);
    const equipes = await prisma.equipe.findMany({
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
        dataHora: { gte: getInicioHistoricoEscalas() },
      },
      include: {
        equipe: {
          select: {
            id: true,
            nome: true,
          },
        },
        evento: { include: { ordensCulto: true } },
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

    const eventos = await prisma.evento.findMany({
      where: { ativo: true },
      include: {
        equipes: { select: { id: true, nome: true } },
        ordensCulto: true,
        modelosEscalaVoluntarios: {
          include: {
            equipe: { select: { id: true, nome: true } },
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
          orderBy: [{ semanaMes: 'asc' }, { criadoEm: 'asc' }],
        },
        escalas: {
          where: { dataHora: { gte: getInicioHistoricoEscalas() } },
          include: {
            equipe: { select: { id: true, nome: true } },
            evento: { include: { ordensCulto: true } },
            voluntarios: {
              include: {
                usuario: {
                  select: {
                    id: true, nomeCompleto: true, email: true, telefone: true, urlFoto: true,
                    dataNascimento: true, sexo: true, permissoes: true, criadoEm: true, atualizadoEm: true,
                    equipes: { select: { id: true, nome: true } },
                    equipesLideradas: { select: { id: true, nome: true } },
                  },
                },
              },
              orderBy: { criadoEm: 'asc' },
            },
          },
          orderBy: [{ dataHora: 'asc' }, { equipe: { nome: 'asc' } }],
        },
      },
      orderBy: [{ tipo: 'asc' }, { dataInicio: 'asc' }],
    });

    return res.status(200).json({
      equipes,
      eventos: eventos.map(({ ordensCulto, modelosEscalaVoluntarios, ...evento }) => ({
        ...evento,
        ordensCulto: ordensCulto.map((ordem) => ({
          id: ordem.id,
          titulo: ordem.titulo,
          dataHora: ordem.dataHora,
          arquivoUrl: `/api/ordens-culto/${ordem.id}/arquivo`,
        })),
        modelosVoluntarios: modelosEscalaVoluntarios.map((modelo) => ({
          id: modelo.id,
          semanaMes: modelo.semanaMes,
          equipe: modelo.equipe,
          usuario: modelo.usuario,
        })),
        escalas: evento.escalas.map((escala) => formatarEscalaCompleta(escala, req.usuarioAutenticado.id)),
      })),
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

router.post('/admin/eventos', autenticar, exigirAdmin, async (req, res) => {
  try {
    const {
      titulo, tipo, frequencia, dataHora, dataHoras, dataFim, diaSemana, semanaMes,
      horario, local, descricao, equipeIds = [], modeloVoluntarios = [],
    } = req.body ?? {};
    const tipoNormalizado = tipo === 'RECORRENTE' ? 'RECORRENTE' : 'ESPORADICA';
    const frequenciaNormalizada = ['NAO_REPETE', 'SEMANAL', 'MENSAL'].includes(frequencia)
      ? frequencia
      : (tipoNormalizado === 'RECORRENTE' ? 'SEMANAL' : 'NAO_REPETE');
    const diaSemanaNumero = Number(diaSemana);
    const semanaMesNumero = Number(semanaMes);

    if (typeof titulo !== 'string' || titulo.trim().length < 3) {
      return res.status(400).json({ erro: 'Informe o nome do evento.' });
    }
    if (!Array.isArray(equipeIds) || equipeIds.length === 0) {
      return res.status(400).json({ erro: 'Selecione pelo menos uma equipe/função.' });
    }
    if (tipoNormalizado === 'RECORRENTE' && frequenciaNormalizada === 'NAO_REPETE') {
      return res.status(400).json({ erro: 'Um evento recorrente deve ter repetição semanal ou mensal.' });
    }
    if (frequenciaNormalizada !== 'NAO_REPETE' && (!Number.isInteger(diaSemanaNumero) || diaSemanaNumero < 0 || diaSemanaNumero > 6)) {
      return res.status(400).json({ erro: 'Informe um dia da semana válido.' });
    }
    if (frequenciaNormalizada === 'MENSAL' && (!Number.isInteger(semanaMesNumero) || semanaMesNumero < 1 || semanaMesNumero > 5)) {
      return res.status(400).json({ erro: 'Informe em qual semana do mês o evento acontece.' });
    }

    const datasInformadas = Array.isArray(dataHoras) && dataHoras.length > 0 ? dataHoras : [dataHora].filter(Boolean);
    const primeiraDataInformada = tipoNormalizado === 'ESPORADICA' && dataHora
      ? parseDataHoraEvento(dataHora)
      : null;
    const primeiraData = frequenciaNormalizada === 'NAO_REPETE'
      ? parseDataHoraEvento(datasInformadas[0])
      : (primeiraDataInformada || getProximaDataDaRegra(diaSemanaNumero, semanaMesNumero, horario, frequenciaNormalizada));
    const fim = dataFim ? parseDataHoraEvento(`${dataFim}T23:59`) : null;

    if (!primeiraData) return res.status(400).json({ erro: 'Informe uma data e um horário válidos.' });
    if (primeiraData <= getAgoraEvento()) return res.status(400).json({ erro: 'A primeira ocorrência deve ser futura.' });
    if (frequenciaNormalizada === 'NAO_REPETE') {
      const datasValidas = datasInformadas.map(parseDataHoraEvento);
      if (datasValidas.length === 0 || datasValidas.some((data) => !data || data <= getAgoraEvento())) {
        return res.status(400).json({ erro: 'Todas as datas do evento devem ser válidas e futuras.' });
      }
    }
    if (tipoNormalizado === 'ESPORADICA' && frequenciaNormalizada !== 'NAO_REPETE' && (!fim || fim < primeiraData)) {
      return res.status(400).json({ erro: 'Eventos esporádicos repetidos precisam de uma data final.' });
    }

    const equipes = await prisma.equipe.findMany({
      where: { id: { in: equipeIds } },
      select: {
        id: true,
        nome: true,
        lideres: { select: { id: true } },
        voluntarios: { select: { id: true } },
      },
    });
    if (equipes.length !== new Set(equipeIds).size) {
      return res.status(400).json({ erro: 'Uma ou mais equipes selecionadas são inválidas.' });
    }
    const modelo = normalizarModeloVoluntarios(modeloVoluntarios, equipes);
    if (modelo.erro) {
      return res.status(400).json({ erro: modelo.erro });
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const evento = await tx.evento.create({
        data: {
          titulo: titulo.trim(),
          local: typeof local === 'string' && local.trim() ? local.trim() : null,
          descricao: typeof descricao === 'string' && descricao.trim() ? descricao.trim() : null,
          tipo: tipoNormalizado,
          frequencia: frequenciaNormalizada,
          dataInicio: primeiraData,
          dataFim: tipoNormalizado === 'ESPORADICA' ? fim : null,
          diaSemana: tipoNormalizado === 'ESPORADICA' ? primeiraData.getUTCDay() : diaSemanaNumero,
          semanaMes: frequenciaNormalizada === 'MENSAL'
            ? (tipoNormalizado === 'ESPORADICA' ? getSemanaMes(primeiraData) : semanaMesNumero)
            : null,
          equipes: { connect: equipes.map((equipe) => ({ id: equipe.id })) },
        },
      });
      const datas = frequenciaNormalizada === 'NAO_REPETE'
        ? datasInformadas.map(parseDataHoraEvento).filter(Boolean)
        : gerarDatasEvento(evento, getLimiteEscalasFuturas());

      if (modelo.modelos.length > 0) {
        await tx.escalaModeloVoluntario.createMany({
          data: modelo.modelos.map((item) => ({
            id: randomUUID(),
            eventoId: evento.id,
            ...item,
          })),
          skipDuplicates: true,
        });
      }

      await tx.escala.createMany({
        data: datas.flatMap((ocorrencia) => equipes.map((equipe) => ({
          id: randomUUID(),
          eventoId: evento.id,
          titulo: evento.titulo,
          local: evento.local,
          descricao: evento.descricao,
          tipo: evento.tipo,
          dataHora: ocorrencia,
          diaSemana: null,
          semanaMes: null,
          solicitadaPeloAdmin: true,
          equipeId: equipe.id,
        }))),
        skipDuplicates: true,
      });

      if (modelo.modelos.length > 0) {
        await aplicarModelosVoluntariosEscalas(tx, {
          eventoId: evento.id,
          datas,
          atribuidoPorId: req.usuarioAutenticado.id,
        });
      }

      return { evento, primeiraOcorrencia: datas[0] };
    });

    const escalasParaNotificar = await prisma.escala.findMany({
      where: { eventoId: resultado.evento.id, dataHora: resultado.primeiraOcorrencia },
      include: { equipe: { include: { lideres: { select: { id: true } } } } },
    });
    await notificarNovaEscalaAdmin(prisma, { escalas: escalasParaNotificar }).catch((notificationError) => {
      console.warn('[WARN] Falha ao notificar líderes sobre novo evento:', notificationError.message);
    });

    return res.status(201).json({
      mensagem: 'Evento criado e escalas geradas para as equipes selecionadas.',
      eventoId: resultado.evento.id,
    });
  } catch (erro) {
    console.error('[ERRO LOG] POST /api/escalas/admin/eventos:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.patch('/admin/eventos/:id', autenticar, exigirAdmin, async (req, res) => {
  try {
    const {
      tipo, frequencia, dataHora, dataHoraAtual, diaSemana, semanaMes, horario, equipeIds = [],
    } = req.body ?? {};
    const dadosTexto = normalizarDadosTextoEvento(req.body ?? {});
    const equipeIdsNormalizados = normalizarIds(equipeIds);

    if (dadosTexto.titulo.length < 3) {
      return res.status(400).json({ erro: 'Informe o nome do evento.' });
    }

    if (equipeIdsNormalizados.length === 0) {
      return res.status(400).json({ erro: 'Selecione pelo menos uma equipe/função.' });
    }

    const evento = await prisma.evento.findFirst({
      where: { id: req.params.id, ativo: true },
      include: {
        equipes: { select: { id: true } },
        escalas: {
          select: {
            id: true,
            equipeId: true,
            dataHora: true,
          },
          orderBy: { dataHora: 'asc' },
        },
      },
    });

    if (!evento) {
      return res.status(404).json({ erro: 'Evento não encontrado.' });
    }

    const tipoNormalizado = tipo
      ? (tipo === 'RECORRENTE' ? 'RECORRENTE' : 'ESPORADICA')
      : evento.tipo;

    if (tipoNormalizado !== evento.tipo) {
      return res.status(400).json({ erro: 'Para mudar o tipo do evento, crie um novo evento com a configuração desejada.' });
    }

    const equipes = await prisma.equipe.findMany({
      where: { id: { in: equipeIdsNormalizados } },
      select: {
        id: true,
        nome: true,
        lideres: { select: { id: true } },
      },
    });

    if (equipes.length !== equipeIdsNormalizados.length) {
      return res.status(400).json({ erro: 'Uma ou mais equipes selecionadas são inválidas.' });
    }

    const agora = getAgoraEscalas();
    const escalasFuturas = evento.escalas.filter((escala) => (
      escala.dataHora && new Date(escala.dataHora).getTime() >= agora.getTime()
    ));
    let frequenciaNormalizada = 'NAO_REPETE';
    let primeiraData;
    let diaSemanaEvento;
    let semanaMesEvento = null;
    let datasDesejadas = [];
    let ocorrenciaAtual = null;
    let ocorrenciaParaOrdem = null;

    if (evento.tipo === 'RECORRENTE') {
      frequenciaNormalizada = ['SEMANAL', 'MENSAL'].includes(frequencia)
        ? frequencia
        : (evento.frequencia === 'MENSAL' ? 'MENSAL' : 'SEMANAL');
      const diaSemanaNumero = Number(diaSemana ?? evento.diaSemana);
      const semanaMesNumero = Number(semanaMes ?? evento.semanaMes ?? 1);
      const horarioBase = horario || (() => {
        const { horas, minutos } = getHorarioBase(evento.dataInicio);
        return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
      })();

      if (!Number.isInteger(diaSemanaNumero) || diaSemanaNumero < 0 || diaSemanaNumero > 6) {
        return res.status(400).json({ erro: 'Informe um dia da semana válido.' });
      }

      if (frequenciaNormalizada === 'MENSAL' && (!Number.isInteger(semanaMesNumero) || semanaMesNumero < 1 || semanaMesNumero > 5)) {
        return res.status(400).json({ erro: 'Informe em qual semana do mês o evento acontece.' });
      }

      if (!parseHorarioEvento(horarioBase)) {
        return res.status(400).json({ erro: 'Horário inválido.' });
      }

      primeiraData = getProximaDataDaRegra(
        diaSemanaNumero,
        frequenciaNormalizada === 'MENSAL' ? semanaMesNumero : null,
        horarioBase,
        frequenciaNormalizada,
      );

      if (!primeiraData) {
        return res.status(400).json({ erro: 'Não foi possível calcular a próxima ocorrência do evento.' });
      }

      diaSemanaEvento = diaSemanaNumero;
      semanaMesEvento = frequenciaNormalizada === 'MENSAL' ? semanaMesNumero : null;
      datasDesejadas = gerarDatasEvento({
        ...evento,
        ...dadosTexto,
        frequencia: frequenciaNormalizada,
        dataInicio: primeiraData,
        dataFim: null,
        diaSemana: diaSemanaEvento,
        semanaMes: semanaMesEvento,
      }, getLimiteEscalasFuturas(agora)).filter((data) => data >= agora);
      ocorrenciaParaOrdem = datasDesejadas[0] || primeiraData;
    } else {
      const datasAtuais = normalizarDatasUnicas(escalasFuturas.map((escala) => escala.dataHora));

      if (datasAtuais.length === 0) {
        return res.status(409).json({ erro: 'Eventos sem ocorrências futuras são somente para consulta.' });
      }

      ocorrenciaAtual = parseDataHoraEvento(dataHoraAtual) || datasAtuais[0];

      if (!datasAtuais.some((data) => datasIguais(data, ocorrenciaAtual))) {
        return res.status(404).json({ erro: 'Ocorrência do evento não encontrada.' });
      }

      ocorrenciaParaOrdem = parseDataHoraEvento(dataHora || ocorrenciaAtual);

      if (!ocorrenciaParaOrdem) {
        return res.status(400).json({ erro: 'Informe uma data e um horário válidos para o evento.' });
      }

      if (ocorrenciaParaOrdem <= getAgoraEvento()) {
        return res.status(400).json({ erro: 'A ocorrência deve ter data e horário futuros.' });
      }

      datasDesejadas = normalizarDatasUnicas(datasAtuais.map((data) => (
        datasIguais(data, ocorrenciaAtual) ? ocorrenciaParaOrdem : data
      )));

      if (datasDesejadas.length !== datasAtuais.length) {
        return res.status(409).json({ erro: 'Já existe uma ocorrência desse evento nesta data e horário.' });
      }

      primeiraData = datasDesejadas[0];
      diaSemanaEvento = primeiraData.getUTCDay();
      semanaMesEvento = getSemanaMes(primeiraData);
    }

    if (datasDesejadas.length === 0) {
      return res.status(400).json({ erro: 'O evento precisa ter pelo menos uma ocorrência futura.' });
    }

    const chavesDatasDesejadas = getChavesDatas(datasDesejadas);
    const chavesOrdensPreservadas = new Set(chavesDatasDesejadas);

    if (evento.tipo === 'ESPORADICA' && ocorrenciaAtual) {
      chavesOrdensPreservadas.add(new Date(ocorrenciaAtual).toISOString());
    }

    const ordensCultoFuturas = await prisma.ordemCulto.findMany({
      where: {
        eventoId: evento.id,
        dataHora: { gte: agora },
      },
      select: {
        arquivoKey: true,
        dataHora: true,
      },
    });
    const ordensCultoRemovidas = ordensCultoFuturas.filter((ordem) => (
      ordem.dataHora && !chavesOrdensPreservadas.has(new Date(ordem.dataHora).toISOString())
    ));

    await prisma.$transaction(async (tx) => {
      if (evento.tipo === 'ESPORADICA' && !datasIguais(ocorrenciaAtual, ocorrenciaParaOrdem)) {
        await tx.escala.updateMany({
          where: { eventoId: evento.id, dataHora: ocorrenciaAtual },
          data: { dataHora: ocorrenciaParaOrdem },
        });
        await tx.ordemCulto.updateMany({
          where: { eventoId: evento.id, dataHora: ocorrenciaAtual },
          data: {
            dataHora: ocorrenciaParaOrdem,
            dataCulto: ocorrenciaParaOrdem,
          },
        });
      }

      await tx.evento.update({
        where: { id: evento.id },
        data: {
          ...dadosTexto,
          tipo: evento.tipo,
          frequencia: frequenciaNormalizada,
          dataInicio: primeiraData,
          dataFim: null,
          diaSemana: diaSemanaEvento,
          semanaMes: semanaMesEvento,
          equipes: { set: equipes.map((equipe) => ({ id: equipe.id })) },
        },
      });

      await tx.escalaModeloVoluntario.deleteMany({
        where: {
          eventoId: evento.id,
          equipeId: { notIn: equipeIdsNormalizados },
        },
      });

      await tx.ordemCulto.deleteMany({
        where: {
          eventoId: evento.id,
          dataHora: {
            gte: agora,
            notIn: datasDesejadas,
          },
        },
      });

      await tx.escala.deleteMany({
        where: {
          eventoId: evento.id,
          dataHora: { gte: agora },
          OR: [
            { equipeId: { notIn: equipeIdsNormalizados } },
            { dataHora: { notIn: datasDesejadas } },
          ],
        },
      });

      await tx.escala.updateMany({
        where: { eventoId: evento.id },
        data: {
          ...dadosTexto,
          tipo: evento.tipo,
        },
      });

      await tx.escala.createMany({
        data: datasDesejadas.flatMap((dataOcorrencia) => equipes.map((equipe) => ({
          id: randomUUID(),
          eventoId: evento.id,
          titulo: dadosTexto.titulo,
          local: dadosTexto.local,
          descricao: dadosTexto.descricao,
          tipo: evento.tipo,
          dataHora: dataOcorrencia,
          diaSemana: null,
          semanaMes: null,
          solicitadaPeloAdmin: true,
          equipeId: equipe.id,
        }))),
        skipDuplicates: true,
      });

      await aplicarModelosVoluntariosEscalas(tx, {
        eventoId: evento.id,
        datas: datasDesejadas,
        atribuidoPorId: req.usuarioAutenticado.id,
      });

      const primeiraEscala = await tx.escala.findFirst({
        where: { eventoId: evento.id },
        orderBy: { dataHora: 'asc' },
        select: { dataHora: true },
      });

      if (evento.tipo === 'ESPORADICA' && primeiraEscala?.dataHora && !datasIguais(primeiraEscala.dataHora, primeiraData)) {
        await tx.evento.update({
          where: { id: evento.id },
          data: {
            dataInicio: primeiraEscala.dataHora,
            diaSemana: primeiraEscala.dataHora.getUTCDay(),
            semanaMes: getSemanaMes(primeiraEscala.dataHora),
          },
        });
      }
    });

    apagarArquivosOrdensCulto(ordensCultoRemovidas);

    return res.status(200).json({
      mensagem: 'Evento atualizado e escalas futuras sincronizadas.',
      dataHora: ocorrenciaParaOrdem.toISOString(),
    });
  } catch (erro) {
    if (erro.code === 'P2002') {
      return res.status(409).json({ erro: 'Já existe uma escala desse evento nesta data e horário.' });
    }

    console.error('[ERRO LOG] PATCH /api/escalas/admin/eventos/:id:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.patch('/admin/eventos/:id/ocorrencias', autenticar, exigirAdmin, async (req, res) => {
  try {
    const { titulo, local, descricao, dataHoraAtual, dataHora } = req.body ?? {};
    const ocorrenciaAtual = parseDataHoraEvento(dataHoraAtual);
    const novaOcorrencia = parseDataHoraEvento(dataHora || dataHoraAtual);
    const tituloNormalizado = typeof titulo === 'string' ? titulo.trim() : '';
    const dadosTexto = {
      titulo: tituloNormalizado,
      local: typeof local === 'string' && local.trim() ? local.trim() : null,
      descricao: typeof descricao === 'string' && descricao.trim() ? descricao.trim() : null,
    };

    if (tituloNormalizado.length < 3) {
      return res.status(400).json({ erro: 'Informe o título da escala.' });
    }

    if (!ocorrenciaAtual || !novaOcorrencia) {
      return res.status(400).json({ erro: 'Informe uma data e horário válidos para a escala.' });
    }

    if (escalaEstaEncerrada(ocorrenciaAtual)) {
      return res.status(409).json({ erro: 'Escalas passadas são somente para consulta e não podem ser alteradas.' });
    }

    if (novaOcorrencia <= getAgoraEvento()) {
      return res.status(400).json({ erro: 'A escala deve ter data e horário futuros.' });
    }

    const evento = await prisma.evento.findFirst({
      where: { id: req.params.id, ativo: true },
      include: {
        escalas: {
          where: { dataHora: ocorrenciaAtual },
          select: { id: true },
        },
      },
    });

    if (!evento || evento.escalas.length === 0) {
      return res.status(404).json({ erro: 'Ocorrência do evento não encontrada.' });
    }

    const alterouData = !datasIguais(ocorrenciaAtual, novaOcorrencia);

    if (alterouData && evento.frequencia !== 'NAO_REPETE') {
      return res.status(400).json({ erro: 'A data de eventos recorrentes segue a regra de recorrência.' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.evento.update({
        where: { id: evento.id },
        data: dadosTexto,
      });

      await tx.escala.updateMany({
        where: { eventoId: evento.id },
        data: dadosTexto,
      });

      if (!alterouData) return;

      await tx.escala.updateMany({
        where: { eventoId: evento.id, dataHora: ocorrenciaAtual },
        data: {
          dataHora: novaOcorrencia,
        },
      });

      await tx.ordemCulto.updateMany({
        where: { eventoId: evento.id, dataHora: ocorrenciaAtual },
        data: {
          dataHora: novaOcorrencia,
          dataCulto: novaOcorrencia,
        },
      });

      const primeiraEscala = await tx.escala.findFirst({
        where: { eventoId: evento.id },
        orderBy: { dataHora: 'asc' },
        select: { dataHora: true },
      });
      const dataInicio = primeiraEscala?.dataHora || novaOcorrencia;

      await tx.evento.update({
        where: { id: evento.id },
        data: {
          dataInicio,
          diaSemana: dataInicio.getUTCDay(),
          semanaMes: getSemanaMes(dataInicio),
        },
      });
    });

    return res.status(200).json({
      mensagem: 'Escala atualizada com sucesso.',
      dataHora: novaOcorrencia.toISOString(),
    });
  } catch (erro) {
    if (erro.code === 'P2002') {
      return res.status(409).json({ erro: 'Já existe uma escala desse evento nesta data e horário.' });
    }

    console.error('[ERRO LOG] PATCH /api/escalas/admin/eventos/:id/ocorrencias:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.delete('/admin/eventos/:id/ocorrencias', autenticar, exigirAdmin, async (req, res) => {
  try {
    const ocorrencia = parseDataHoraEvento(req.query.dataHora);

    if (!ocorrencia) {
      return res.status(400).json({ erro: 'Informe a data e horário da escala.' });
    }

    if (escalaEstaEncerrada(ocorrencia)) {
      return res.status(409).json({ erro: 'Escalas passadas são somente para consulta e não podem ser alteradas.' });
    }

    const evento = await prisma.evento.findFirst({
      where: { id: req.params.id, ativo: true },
      include: {
        escalas: {
          where: { dataHora: ocorrencia },
          select: { id: true },
        },
      },
    });

    if (!evento || evento.escalas.length === 0) {
      return res.status(404).json({ erro: 'Ocorrência do evento não encontrada.' });
    }

    if (evento.frequencia !== 'NAO_REPETE') {
      const agora = getAgoraEscalas();
      const ordensCultoRemovidas = await prisma.ordemCulto.findMany({
        where: {
          eventoId: evento.id,
          dataHora: { gte: agora },
        },
        select: { arquivoKey: true },
      });
      const removidas = await prisma.$transaction(async (tx) => {
        await tx.evento.update({
          where: { id: evento.id },
          data: { ativo: false },
        });
        await tx.ordemCulto.deleteMany({
          where: {
            eventoId: evento.id,
            dataHora: { gte: agora },
          },
        });
        const resultado = await tx.escala.deleteMany({
          where: {
            eventoId: evento.id,
            dataHora: { gte: agora },
          },
        });

        return resultado.count;
      });

      apagarArquivosOrdensCulto(ordensCultoRemovidas);

      return res.status(200).json({
        mensagem: `${removidas} escala(s) futura(s) removida(s). O evento recorrente não gerará novas ocorrências.`,
      });
    }

    const ordensCultoRemovidas = await prisma.ordemCulto.findMany({
      where: {
        eventoId: evento.id,
        dataHora: ocorrencia,
      },
      select: { arquivoKey: true },
    });
    const removidas = await prisma.$transaction(async (tx) => {
      await tx.ordemCulto.deleteMany({
        where: {
          eventoId: evento.id,
          dataHora: ocorrencia,
        },
      });
      const resultado = await tx.escala.deleteMany({
        where: {
          eventoId: evento.id,
          dataHora: ocorrencia,
        },
      });
      const primeiraEscalaRestante = await tx.escala.findFirst({
        where: { eventoId: evento.id },
        orderBy: { dataHora: 'asc' },
        select: { dataHora: true },
      });

      if (!primeiraEscalaRestante) {
        await tx.evento.delete({ where: { id: evento.id } });
        return resultado.count;
      }

      await tx.evento.update({
        where: { id: evento.id },
        data: {
          dataInicio: primeiraEscalaRestante.dataHora,
          diaSemana: primeiraEscalaRestante.dataHora.getUTCDay(),
          semanaMes: getSemanaMes(primeiraEscalaRestante.dataHora),
        },
      });

      return resultado.count;
    });

    apagarArquivosOrdensCulto(ordensCultoRemovidas);

    return res.status(200).json({
      mensagem: `${removidas} escala(s) removida(s) com sucesso.`,
    });
  } catch (erro) {
    if (erro.code === 'P2025') {
      return res.status(404).json({ erro: 'Evento ou escala não encontrado.' });
    }

    console.error('[ERRO LOG] DELETE /api/escalas/admin/eventos/:id/ocorrencias:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.patch('/admin/recorrentes/:id', autenticar, exigirAdmin, async (req, res) => {
  try {
    const { titulo, diaSemana, semanaMes, horario } = req.body ?? {};
    const diaSemanaNumero = Number(diaSemana);
    const semanaMesNumero = Number(semanaMes);

    if (!Number.isInteger(diaSemanaNumero) || diaSemanaNumero < 0 || diaSemanaNumero > 6 || ![1, 2, 3, 4, 5].includes(semanaMesNumero)) {
      return res.status(400).json({ erro: 'Informe um dia da semana e uma semana do mês válidos.' });
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

    const escalaExistente = await prisma.escala.findUnique({
      where: { id: req.params.id },
      select: { dataHora: true },
    });

    if (!escalaExistente) return res.status(404).json({ erro: 'Escala recorrente não encontrada.' });
    if (escalaEstaEncerrada(escalaExistente.dataHora)) {
      return res.status(409).json({ erro: 'Escalas passadas são somente para consulta e não podem ser alteradas.' });
    }

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
        nome: true,
        lideres: {
          select: { id: true },
        },
      },
    });

    if (equipes.length !== equipeIds.length) {
      return res.status(400).json({ erro: 'Uma ou mais equipes selecionadas são inválidas.' });
    }

    const datas = datasInformadas.map(parseDataHoraEvento);

    if (datas.some((data) => !data)) {
      return res.status(400).json({ erro: 'Uma ou mais datas/horários são inválidos.' });
    }

    const agora = getAgoraEvento();

    if (datas.some((data) => data <= agora)) {
      return res.status(400).json({ erro: 'As escalas esporádicas devem ter data e horário futuros.' });
    }

    const grupos = datas.map((data) => ({
      data,
      grupoEsporadicoId: randomUUID(),
    }));

    const escalasCriadas = await prisma.$transaction(
      grupos.flatMap(({ data, grupoEsporadicoId }) => (
        equipes.map((equipe) => prisma.escala.create({
          data: {
            titulo: titulo.trim(),
            local: typeof local === 'string' && local.trim() ? local.trim() : null,
            descricao: typeof descricao === 'string' && descricao.trim() ? descricao.trim() : null,
            tipo: 'ESPORADICA',
            diaSemana: data.getUTCDay(),
            semanaMes: getSemanaMes(data),
            dataHora: data,
            grupoEsporadicoId,
            solicitadaPeloAdmin: true,
            equipeId: equipe.id,
          },
        }))
      )),
    );

    await notificarNovaEscalaAdmin(prisma, {
      escalas: escalasCriadas.map((escala) => ({
        ...escala,
        equipe: equipes.find((equipe) => equipe.id === escala.equipeId),
      })),
    }).catch((notificationError) => {
      console.warn('[WARN] Falha ao notificar líderes sobre nova escala:', notificationError.message);
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

    if (!Number.isInteger(diaSemanaNumero) || diaSemanaNumero < 0 || diaSemanaNumero > 6 || ![1, 2, 3, 4, 5].includes(semanaMesNumero)) {
      return res.status(400).json({ erro: 'Informe um dia da semana e uma semana do mês válidos.' });
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
        nome: true,
        lideres: {
          select: { id: true },
        },
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
    const tituloPadrao = `${semanaMesNumero}ª ${nomesDiasSemana[diaSemanaNumero]}`;

    const escalasCriadas = await prisma.$transaction(
      equipes.map((equipe) => prisma.escala.create({
        data: {
          titulo: typeof titulo === 'string' && titulo.trim() ? titulo.trim() : tituloPadrao,
          local: typeof local === 'string' && local.trim() ? local.trim() : null,
          descricao: typeof descricao === 'string' && descricao.trim() ? descricao.trim() : null,
          tipo: 'RECORRENTE',
          diaSemana: diaSemanaNumero,
          semanaMes: semanaMesNumero,
          dataHora,
          solicitadaPeloAdmin: true,
          equipeId: equipe.id,
        },
      })),
    );

    await notificarNovaEscalaAdmin(prisma, {
      escalas: escalasCriadas.map((escala) => ({
        ...escala,
        equipe: equipes.find((equipe) => equipe.id === escala.equipeId),
      })),
    }).catch((notificationError) => {
      console.warn('[WARN] Falha ao notificar líderes sobre nova escala:', notificationError.message);
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
        escala: {
          dataHora: { gte: getAgoraEscalas() },
        },
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
            evento: {
              select: {
                id: true,
                titulo: true,
                frequencia: true,
                diaSemana: true,
                semanaMes: true,
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
        status: true,
        dataOcorrenciaStatus: true,
        dataOcorrenciaSubstituicao: true,
        substituto: true,
        usuario: {
          select: {
            id: true,
            nomeCompleto: true,
          },
        },
        escala: {
          include: {
            equipe: {
              select: {
                id: true,
                nome: true,
                lideres: {
                  select: {
                    id: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!escalaExistente) {
      return res.status(404).json({ erro: 'Escala não encontrada para este usuário.' });
    }

    const ocorrenciaAtual = getProximaOcorrencia(escalaExistente.escala);
    const dataOcorrenciaStatus = new Date(dataOcorrencia || ocorrenciaAtual);

    if (Number.isNaN(dataOcorrenciaStatus.getTime()) || !datasIguais(dataOcorrenciaStatus, ocorrenciaAtual)) {
      return res.status(400).json({ erro: 'A ocorrência informada não corresponde à próxima escala.' });
    }

    const statusAtualOcorrencia = escalaExistente.escala.tipo !== 'RECORRENTE'
      || datasIguais(escalaExistente.dataOcorrenciaStatus, dataOcorrenciaStatus)
      ? escalaExistente.status
      : 'PENDENTE';

    if (statusAtualOcorrencia === 'CONFIRMADA') {
      return res.status(409).json({ erro: 'Esta escala já foi confirmada.' });
    }

    const erroJanelaAlteracao = getErroJanelaAlteracaoEscala(dataOcorrenciaStatus);

    if (erroJanelaAlteracao) {
      return res.status(409).json({ erro: erroJanelaAlteracao });
    }

    if (escalaEstaEncerrada(dataOcorrenciaStatus)) {
      return res.status(409).json({ erro: 'Escalas passadas são somente para consulta e não podem ser alteradas.' });
    }

    const escalaAtualizada = await prisma.voluntarioEscala.update({
      where: {
        id: escalaExistente.id,
      },
      data: {
        status,
        dataOcorrenciaStatus,
        justificativaSubstituicao: status === 'PEDIU_SUBSTITUICAO'
          ? String(justificativaSubstituicao).trim()
          : null,
        dataOcorrenciaSubstituicao: status === 'PEDIU_SUBSTITUICAO'
          ? dataOcorrenciaStatus
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

      await notificarConfirmacaoEscala(prisma, {
        participacao: {
          ...escalaAtualizada,
          usuario: escalaExistente.usuario,
          escala: escalaExistente.escala,
        },
        dataOcorrencia: dataOcorrenciaStatus,
      }).catch((notificationError) => {
        console.warn('[WARN] Falha ao notificar líderes sobre confirmação:', notificationError.message);
      });
    }

    if (status === 'PEDIU_SUBSTITUICAO') {
      await notificarPedidoSubstituicao(prisma, {
        participacao: {
          ...escalaAtualizada,
          usuario: escalaExistente.usuario,
          escala: escalaExistente.escala,
        },
      }).catch((notificationError) => {
        console.warn('[WARN] Falha ao notificar líderes sobre substituição:', notificationError.message);
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

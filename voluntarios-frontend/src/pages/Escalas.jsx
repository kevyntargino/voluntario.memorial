import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  FileText,
  List,
  Loader2,
  MapPin,
  RefreshCcw,
  Repeat2,
  Search,
  SlidersHorizontal,
  UsersRound,
  X,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import { Footer } from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { buildApiUrl } from '../lib/api';
import { escalaEstaEncerrada, getAgoraEscalas } from '../lib/escalas';
import { formatarTelefoneExibicao } from '../lib/telefone';

const areas = ['Midia', 'Iluminação', 'Filmagem', 'Fotografia', 'DTV', 'Direção', 'Redes Sociais'];
const semanas = [1, 2, 3, 4, 5];
const opcoesItensPorPagina = [5, 10, 20, 30];
const dias = [
  { value: 'TODOS', label: 'Todos' },
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
];
const filtrosStatus = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'PENDENTE', label: 'Pendentes' },
  { value: 'CONFIRMADA', label: 'Confirmadas' },
  { value: 'PEDIU_SUBSTITUICAO', label: 'Substituição' },
  { value: 'AUSENTE', label: 'Ausentes' },
];
const filtrosTipo = [
  { value: 'TODAS', label: 'Todas' },
  { value: 'RECORRENTE', label: 'Recorrentes' },
  { value: 'ESPORADICA', label: 'Esporádicas' },
];
const diasCalendario = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MODO_VISUALIZACAO_KEY = 'mcom_escalas_visualizacao';

const statusConfig = {
  PENDENTE: {
    label: 'Pendente',
    className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200',
    icon: Clock3,
  },
  CONFIRMADA: {
    label: 'Confirmada',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
    icon: CheckCircle2,
  },
  PEDIU_SUBSTITUICAO: {
    label: 'Substituição',
    className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200',
    icon: RefreshCcw,
  },
  AUSENTE: {
    label: 'Ausente',
    className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200',
    icon: AlertCircle,
  },
};

function getData(escala) {
  return escala.dataHora ? new Date(escala.dataHora) : null;
}

function getDiaSemana(escala) {
  const data = getData(escala);
  return data ? data.getUTCDay() : escala.diaSemana;
}

function getSemanaDoMes(escala) {
  const data = getData(escala);

  if (!data) {
    return null;
  }

  return Math.ceil(data.getUTCDate() / 7);
}

function formatarDataCompleta(dataHora) {
  if (!dataHora) {
    return 'Data a confirmar';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(dataHora));
}

function inicioMesAtual() {
  const agora = new Date();
  return new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), 1));
}

function chaveDataUtc(data) {
  return [
    data.getUTCFullYear(),
    String(data.getUTCMonth() + 1).padStart(2, '0'),
    String(data.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function getOcorrenciaRecorrenteNoMes(escala, mesReferencia) {
  const ocorrencias = [];
  const horarioBase = getData(escala);
  const ano = mesReferencia.getUTCFullYear();
  const mes = mesReferencia.getUTCMonth();

  for (let dia = 1; dia <= 31; dia += 1) {
    const data = new Date(Date.UTC(
      ano,
      mes,
      dia,
      horarioBase?.getUTCHours() ?? 18,
      horarioBase?.getUTCMinutes() ?? 0,
    ));

    if (data.getUTCMonth() !== mes) break;
    if (data.getUTCDay() === escala.diaSemana) ocorrencias.push(data);
  }

  return ocorrencias[(escala.semanaMes || 1) - 1] || null;
}

function getDiasDoCalendario(mesReferencia) {
  const ano = mesReferencia.getUTCFullYear();
  const mes = mesReferencia.getUTCMonth();
  const primeiroDia = new Date(Date.UTC(ano, mes, 1));
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0));
  const inicio = new Date(Date.UTC(ano, mes, 1 - primeiroDia.getUTCDay()));
  const totalCelulas = primeiroDia.getUTCDay() + ultimoDia.getUTCDate() > 35 ? 42 : 35;

  return Array.from({ length: totalCelulas }, (_, indice) => (
    new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), inicio.getUTCDate() + indice))
  ));
}

function getModoVisualizacaoInicial() {
  const modoSalvo = window.localStorage.getItem(MODO_VISUALIZACAO_KEY);
  return ['lista', 'calendario'].includes(modoSalvo) ? modoSalvo : 'lista';
}

function prepararEscalaModal(escala, data) {
  const dataIso = data.toISOString();
  const voluntarios = (escala.voluntarios || []).map((item) => {
    if (escala.tipo !== 'RECORRENTE') return item;

    const statusDaOcorrencia = item.dataOcorrenciaStatus
      && new Date(item.dataOcorrenciaStatus).toISOString() === dataIso;
    const substituicaoDaOcorrencia = !item.dataOcorrenciaSubstituicao
      || new Date(item.dataOcorrenciaSubstituicao).toISOString() === dataIso;

    return {
      ...item,
      status: statusDaOcorrencia ? item.status : 'PENDENTE',
      substituto: substituicaoDaOcorrencia ? item.substituto : false,
    };
  });

  return { ...escala, dataHora: dataIso, voluntarios };
}

function normalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function contarVoluntariosUnicos(escalas) {
  const voluntarioIds = new Set();

  escalas.forEach((escala) => {
    (escala.voluntarios || []).forEach((item) => {
      const usuarioId = item.usuarioId || item.usuario?.id;
      if (usuarioId) voluntarioIds.add(usuarioId);
    });
  });

  return voluntarioIds.size;
}

function mesmaDataHora(dataA, dataB) {
  if (!dataA || !dataB) return false;
  const primeira = new Date(dataA);
  const segunda = new Date(dataB);
  return !Number.isNaN(primeira.getTime())
    && !Number.isNaN(segunda.getTime())
    && primeira.getTime() === segunda.getTime();
}

function getEventoDomId(eventoId, dataHora) {
  return `evento-${eventoId}-${new Date(dataHora).getTime()}`;
}

export default function Escalas() {
  const { token, logout } = useAuth();
  const { navigate, search } = useNavigation();
  const parametrosIniciais = new URLSearchParams(search || '');
  const filtroInicial = parametrosIniciais.get('filtro');
  const eventoInicial = parametrosIniciais.get('evento') || '';
  const dataEventoInicial = parametrosIniciais.get('data') || '';
  const [visao, setVisao] = useState(filtroInicial === 'confirmacoes' ? 'minhas' : 'todas');
  const [filtroConfirmacoes, setFiltroConfirmacoes] = useState(filtroInicial === 'confirmacoes');
  const [participacaoSelecionadaId, setParticipacaoSelecionadaId] = useState(parametrosIniciais.get('participacao') || '');
  const [eventoSelecionadoId, setEventoSelecionadoId] = useState(eventoInicial);
  const [dataEventoSelecionada, setDataEventoSelecionada] = useState(dataEventoInicial);
  const [diaSelecionado, setDiaSelecionado] = useState('TODOS');
  const [semanaSelecionada, setSemanaSelecionada] = useState('TODAS');
  const [tipoFiltro, setTipoFiltro] = useState('TODAS');
  const [statusFiltro, setStatusFiltro] = useState(filtroInicial === 'confirmacoes' ? 'PENDENTE' : 'TODOS');
  const [areaFiltro, setAreaFiltro] = useState('TODAS');
  const [ordem, setOrdem] = useState('proximas');
  const [busca, setBusca] = useState('');
  const [escalas, setEscalas] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [atualizandoId, setAtualizandoId] = useState(null);
  const [substituicaoAbertaId, setSubstituicaoAbertaId] = useState(null);
  const [justificativa, setJustificativa] = useState('');
  const [modoVisualizacao, setModoVisualizacao] = useState(getModoVisualizacaoInicial);
  const [mesCalendario, setMesCalendario] = useState(inicioMesAtual);
  const [eventoModal, setEventoModal] = useState(null);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [itensPorPagina, setItensPorPagina] = useState(10);

  const carregarEscalas = useCallback(async () => {
    setErro('');
    setCarregando(true);

    try {
      const resposta = await fetch(buildApiUrl(`/api/escalas?visao=${visao}`), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        if (resposta.status === 401) {
          logout();
          navigate('/login', { replace: true });
          return;
        }

        throw new Error(dados.erro || 'Não foi possível carregar as escalas.');
      }

      setEscalas(dados.escalas || []);
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar as escalas.');
    } finally {
      setCarregando(false);
    }
  }, [logout, navigate, token, visao]);

  useEffect(() => {
    carregarEscalas();
  }, [carregarEscalas]);

  useEffect(() => {
    window.localStorage.setItem(MODO_VISUALIZACAO_KEY, modoVisualizacao);
  }, [modoVisualizacao]);

  useEffect(() => {
    const params = new URLSearchParams(search || '');
    const filtro = params.get('filtro');
    const participacao = params.get('participacao') || '';
    const evento = params.get('evento') || '';
    const dataEvento = params.get('data') || '';

    if (evento && dataEvento) {
      setEventoSelecionadoId(evento);
      setDataEventoSelecionada(dataEvento);
      setModoVisualizacao('lista');
      setVisao('todas');
      setFiltroConfirmacoes(false);
      setParticipacaoSelecionadaId('');
      setTipoFiltro('TODAS');
      setStatusFiltro('TODOS');
      setAreaFiltro('TODAS');
      setOrdem('proximas');
      setBusca('');
    } else if (filtro === 'confirmacoes') {
      setEventoSelecionadoId('');
      setDataEventoSelecionada('');
      setVisao('minhas');
      setFiltroConfirmacoes(true);
      setStatusFiltro('PENDENTE');
      setParticipacaoSelecionadaId(participacao);
      setTipoFiltro('TODAS');
      setAreaFiltro('TODAS');
      setOrdem('proximas');
      setBusca('');
    } else {
      setFiltroConfirmacoes(false);
      setParticipacaoSelecionadaId('');
      setEventoSelecionadoId('');
      setDataEventoSelecionada('');
    }
  }, [search]);

  useEffect(() => {
    if (!participacaoSelecionadaId || carregando) {
      return;
    }

    window.setTimeout(() => {
      document.getElementById(`participacao-${participacaoSelecionadaId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 120);
  }, [carregando, participacaoSelecionadaId]);

  useEffect(() => {
    if (!eventoSelecionadoId || !dataEventoSelecionada || carregando) return;

    window.setTimeout(() => {
      document.getElementById(getEventoDomId(eventoSelecionadoId, dataEventoSelecionada))?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 120);
  }, [carregando, dataEventoSelecionada, eventoSelecionadoId]);

  const atualizarStatus = async (participacaoId, status, justificativaSubstituicao = '', dataOcorrencia = '') => {
    setErro('');
    setAtualizandoId(participacaoId);

    try {
      const resposta = await fetch(buildApiUrl(`/api/escalas/${participacaoId}/status`), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status, justificativaSubstituicao, dataOcorrencia }),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        if (resposta.status === 401) {
          logout();
          navigate('/login', { replace: true });
          return;
        }

        throw new Error(dados.erro || 'Não foi possível atualizar a escala.');
      }

      setEscalas((atuais) => atuais.map((escala) => {
        if (escala.minhaParticipacao?.id !== participacaoId) {
          return escala;
        }

        return {
          ...escala,
          minhaParticipacao: {
            ...escala.minhaParticipacao,
            status,
            justificativaSubstituicao: status === 'PEDIU_SUBSTITUICAO' ? justificativaSubstituicao : null,
            dataOcorrenciaSubstituicao: status === 'PEDIU_SUBSTITUICAO' ? dataOcorrencia : null,
          },
          voluntarios: escala.voluntarios.map((item) => (
            item.id === participacaoId
              ? {
                ...item,
                status,
                justificativaSubstituicao: status === 'PEDIU_SUBSTITUICAO' ? justificativaSubstituicao : null,
                dataOcorrenciaSubstituicao: status === 'PEDIU_SUBSTITUICAO' ? dataOcorrencia : null,
              }
              : item
          )),
        };
      }));
      setSubstituicaoAbertaId(null);
      setJustificativa('');
    } catch (error) {
      setErro(error.message || 'Não foi possível atualizar a escala.');
    } finally {
      setAtualizandoId(null);
    }
  };

  const abrirOrdemCulto = async (ordemCulto) => {
    setErro('');
    const janela = window.open('about:blank', '_blank');

    try {
      const resposta = await fetch(buildApiUrl(ordemCulto.arquivoUrl || `/api/ordens-culto/${ordemCulto.id}/arquivo`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => ({}));
        throw new Error(dados.erro || 'Não foi possível abrir a ordem de culto.');
      }
      const url = URL.createObjectURL(await resposta.blob());
      if (janela) {
        janela.opener = null;
        janela.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      janela?.close();
      setErro(error.message || 'Não foi possível abrir a ordem de culto.');
    }
  };

  const escalasVisiveis = useMemo(() => {
    const termo = normalizar(busca);
    const agora = getAgoraEscalas().getTime();

    return escalas.filter((escala) => {
      const isEsporadicaMinha = visao === 'minhas' && escala.tipo === 'ESPORADICA';
      const mesmaSemana = getSemanaDoMes(escala) === semanaSelecionada;
      const mesmoDia = getDiaSemana(escala) === diaSelecionado;
      const correspondeParticipacao = !participacaoSelecionadaId || escala.minhaParticipacao?.id === participacaoSelecionadaId;
      const correspondeEvento = !eventoSelecionadoId
        || (escala.eventoId === eventoSelecionadoId && mesmaDataHora(escala.dataHora, dataEventoSelecionada));
      const futura = !escala.encerrada && (getData(escala)?.getTime() || 0) >= agora;
      const correspondeConfirmacao = !filtroConfirmacoes || (futura && escala.minhaParticipacao?.status === 'PENDENTE');
      const correspondeTipo = tipoFiltro === 'TODAS' || escala.tipo === tipoFiltro;
      const correspondeArea = areaFiltro === 'TODAS' || escala.equipe?.nome === areaFiltro;
      const statusBase = visao === 'minhas'
        ? [escala.minhaParticipacao?.status]
        : (escala.voluntarios || []).map((item) => item.status);
      const correspondeStatus = statusFiltro === 'TODOS'
        || (statusBase.includes(statusFiltro) && (statusFiltro !== 'PENDENTE' || futura));
      const usaFiltroPeriodo = modoVisualizacao === 'lista'
        && escala.tipo === 'RECORRENTE'
        && tipoFiltro !== 'ESPORADICA';
      const texto = normalizar([
        escala.titulo,
        escala.local,
        escala.descricao,
        escala.equipe?.nome,
        escala.voluntarios?.map((item) => [
          item.usuario?.nomeCompleto,
          item.usuario?.telefone,
          statusConfig[item.status]?.label,
        ].join(' ')).join(' '),
      ].join(' '));
      const correspondeTexto = !termo || texto.includes(termo);

      if (!futura) return false;

      if (filtroConfirmacoes) {
        return correspondeParticipacao && correspondeConfirmacao && correspondeTipo && correspondeArea && correspondeTexto;
      }

      return correspondeEvento
        && correspondeTipo
        && correspondeArea
        && correspondeStatus
        && (eventoSelecionadoId || isEsporadicaMinha || !usaFiltroPeriodo || (
          (semanaSelecionada === 'TODAS' || mesmaSemana)
          && (diaSelecionado === 'TODOS' || mesmoDia)
        ))
        && correspondeTexto;
    }).sort((a, b) => {
      if (ordem === 'distantes') {
        return (getData(b)?.getTime() || 0) - (getData(a)?.getTime() || 0);
      }

      if (ordem === 'area') {
        return (a.equipe?.nome || '').localeCompare(b.equipe?.nome || '', 'pt-BR')
          || (getData(a)?.getTime() || 0) - (getData(b)?.getTime() || 0);
      }

      if (ordem === 'pendentes') {
        const aPendente = a.minhaParticipacao?.status === 'PENDENTE' ? 0 : 1;
        const bPendente = b.minhaParticipacao?.status === 'PENDENTE' ? 0 : 1;
        return aPendente - bPendente || (getData(a)?.getTime() || 0) - (getData(b)?.getTime() || 0);
      }

      return (getData(a)?.getTime() || 0) - (getData(b)?.getTime() || 0);
    });
  }, [areaFiltro, busca, dataEventoSelecionada, diaSelecionado, escalas, eventoSelecionadoId, filtroConfirmacoes, modoVisualizacao, ordem, participacaoSelecionadaId, semanaSelecionada, statusFiltro, tipoFiltro, visao]);

  const totalPaginas = Math.max(1, Math.ceil(escalasVisiveis.length / itensPorPagina));
  const escalasPaginadas = useMemo(() => {
    const inicio = (paginaAtual - 1) * itensPorPagina;
    return escalasVisiveis.slice(inicio, inicio + itensPorPagina);
  }, [escalasVisiveis, itensPorPagina, paginaAtual]);

  useEffect(() => {
    setPaginaAtual((pagina) => Math.min(pagina, totalPaginas));
  }, [totalPaginas]);

  useEffect(() => {
    setPaginaAtual(1);
  }, [areaFiltro, busca, diaSelecionado, eventoSelecionadoId, filtroConfirmacoes, modoVisualizacao, ordem, participacaoSelecionadaId, semanaSelecionada, statusFiltro, tipoFiltro, visao]);

  const eventosLista = useMemo(() => {
    const eventos = new Map();

    for (const escala of escalasPaginadas) {
      const data = getData(escala);
      const dataIso = data?.toISOString() || 'sem-data';
      const chave = escala.eventoId
        ? `evento:${escala.eventoId}:${dataIso}`
        : escala.grupoEsporadicoId
          ? `grupo:${escala.grupoEsporadicoId}:${dataIso}`
          : `${normalizar(escala.titulo)}:${dataIso}:${normalizar(escala.local)}`;
      const existente = eventos.get(chave);

      if (existente) {
        existente.escalas.push(escala);
      } else {
        eventos.set(chave, {
          id: chave,
          eventoId: escala.eventoId,
          titulo: escala.titulo || escala.evento?.titulo || 'Evento sem título',
          dataHora: escala.dataHora,
          local: escala.local,
          descricao: escala.descricao,
          tipo: escala.tipo,
          encerrada: escala.encerrada || escalaEstaEncerrada(escala.dataHora),
          ordemCulto: escala.ordemCulto,
          escalas: [escala],
        });
      }
    }

    return Array.from(eventos.values());
  }, [escalasPaginadas]);

  const totalVoluntarios = useMemo(() => contarVoluntariosUnicos(escalasVisiveis), [escalasVisiveis]);
  const ocorrenciasCalendario = useMemo(() => {
    const eventos = new Map();

    escalasVisiveis.forEach((escala) => {
      const data = escala.tipo === 'RECORRENTE' && escala.diaSemana != null && escala.semanaMes != null
        ? getOcorrenciaRecorrenteNoMes(escala, mesCalendario)
        : getData(escala);

      if (!data
        || data.getUTCFullYear() !== mesCalendario.getUTCFullYear()
        || data.getUTCMonth() !== mesCalendario.getUTCMonth()) {
        return;
      }

      const chaveEvento = escala.eventoId
        ? `evento:${escala.eventoId}:${data.toISOString()}`
        : escala.grupoEsporadicoId
          ? `grupo:${escala.grupoEsporadicoId}:${data.toISOString()}`
          : [
              escala.tipo,
              data.toISOString(),
              normalizar(escala.local),
            ].join(':');
      const eventoExistente = eventos.get(chaveEvento);
      const area = prepararEscalaModal(escala, data);

      if (eventoExistente) {
        eventoExistente.areas.push(area);
        return;
      }

      eventos.set(chaveEvento, {
        id: chaveEvento,
        titulo: escala.titulo || 'Evento sem título',
        tipo: escala.tipo,
        data,
        dataHora: data.toISOString(),
        local: escala.local,
        descricao: escala.descricao,
        areas: [area],
      });
    });

    return Array.from(eventos.values())
      .map((evento) => ({
        evento: {
          ...evento,
          areas: evento.areas.sort((a, b) => (
            (a.equipe?.nome || '').localeCompare(b.equipe?.nome || '', 'pt-BR')
          )),
        },
        data: evento.data,
      }))
      .sort((a, b) => a.data.getTime() - b.data.getTime());
  }, [escalasVisiveis, mesCalendario]);
  const temFiltrosAtivos = filtroConfirmacoes
    || Boolean(participacaoSelecionadaId)
    || Boolean(eventoSelecionadoId)
    || diaSelecionado !== 'TODOS'
    || semanaSelecionada !== 'TODAS'
    || busca.trim()
    || areaFiltro !== 'TODAS'
    || statusFiltro !== 'TODOS'
    || tipoFiltro !== 'TODAS'
    || ordem !== 'proximas';
  const totalFiltrosPainelAtivos = [
    filtroConfirmacoes || Boolean(participacaoSelecionadaId),
    Boolean(eventoSelecionadoId),
    diaSelecionado !== 'TODOS',
    semanaSelecionada !== 'TODAS',
    areaFiltro !== 'TODAS',
    statusFiltro !== 'TODOS',
    tipoFiltro !== 'TODAS',
  ].filter(Boolean).length;

  const limparFiltros = () => {
    setFiltroConfirmacoes(false);
    setParticipacaoSelecionadaId('');
    setEventoSelecionadoId('');
    setDataEventoSelecionada('');
    setDiaSelecionado('TODOS');
    setSemanaSelecionada('TODAS');
    setTipoFiltro('TODAS');
    setStatusFiltro('TODOS');
    setAreaFiltro('TODAS');
    setOrdem('proximas');
    setBusca('');
    navigate('/escalas', { replace: true });
  };

  const alterarVisao = (valor) => {
    setVisao(valor);
    if (filtroConfirmacoes && valor !== 'minhas') {
      limparFiltros();
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <Navbar />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-6 sm:px-6 md:pb-10 lg:px-8 lg:pt-8">
        <header className="border-b border-gray-200 pb-5 dark:border-gray-800">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Escalas MCom</p>
              <h1 className="mt-1 text-2xl font-bold text-gray-950 dark:text-white sm:text-3xl">
                {filtroConfirmacoes
                  ? 'Confirmações pendentes'
                  : modoVisualizacao === 'calendario' ? 'Calendário de eventos' : 'Escalas por evento'}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">
                {participacaoSelecionadaId
                  ? 'Abrimos a pendência exata enviada pela notificação para você confirmar ou solicitar substituição.'
                  : filtroConfirmacoes
                  ? 'Veja somente suas escalas que ainda aguardam confirmação.'
                  : modoVisualizacao === 'calendario'
                    ? 'Consulte cada evento do mês e abra seus detalhes para ver os voluntários organizados por área.'
                    : 'Consulte cada evento e veja funções, voluntários e confirmações em uma única tabela.'}
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-end lg:justify-end">
              <div className="flex items-center divide-x divide-gray-200 dark:divide-gray-700">
                <Resumo label="Escalas" value={escalasVisiveis.length} icon={CalendarDays} />
                <Resumo label="Voluntários" value={totalVoluntarios} icon={UsersRound} />
              </div>
              <SeletorVisualizacao value={modoVisualizacao} onChange={setModoVisualizacao} />
            </div>
          </div>
        </header>

        <section className="mt-4 rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:shadow-black/20">
          <div className="grid gap-3 p-4 lg:grid-cols-[auto_minmax(220px,1fr)_minmax(170px,0.45fr)_auto] lg:items-end">
            <Segmento
              label="Visão"
              options={[
                { value: 'todas', label: 'Todas' },
                { value: 'minhas', label: 'Minhas' },
              ]}
              value={visao}
              onChange={alterarVisao}
            />

            <div>
              <p id="escalas-busca-label" className="mb-1 text-[11px] font-semibold uppercase text-gray-500 dark:text-gray-400">Busca</p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  aria-labelledby="escalas-busca-label"
                  className="block h-9 w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-gray-400 dark:focus:ring-gray-400/20"
                  placeholder="Buscar por área, título ou voluntário"
                />
              </div>
            </div>

            <SelectFiltro
              label="Ordenar"
              value={ordem}
              onChange={setOrdem}
              options={[
                { value: 'proximas', label: 'Mais próximas' },
                { value: 'distantes', label: 'Mais distantes' },
                { value: 'area', label: 'Área' },
                { value: 'pendentes', label: 'Pendentes primeiro' },
              ]}
            />

            <button
              type="button"
              onClick={() => setFiltrosAbertos((aberto) => !aberto)}
              className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
                filtrosAbertos || totalFiltrosPainelAtivos > 0
                  ? 'border-gray-950 bg-gray-950 text-white hover:bg-gray-800 dark:border-white dark:bg-white dark:text-gray-950'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-800'
              }`}
              aria-expanded={filtrosAbertos}
            >
              <SlidersHorizontal size={16} />
              <span>Filtros</span>
              {totalFiltrosPainelAtivos > 0 && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold leading-none">
                  {totalFiltrosPainelAtivos}
                </span>
              )}
            </button>
          </div>

          <div className={`${filtrosAbertos ? 'block' : 'hidden'} border-t border-gray-200 p-4 dark:border-gray-800`}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SelectFiltro
                label="Tipo"
                value={tipoFiltro}
                onChange={setTipoFiltro}
                options={filtrosTipo}
              />

              <SelectFiltro
                label="Status"
                value={statusFiltro}
                onChange={(valor) => {
                  setStatusFiltro(valor);
                  if (valor !== 'PENDENTE') {
                    setFiltroConfirmacoes(false);
                    setParticipacaoSelecionadaId('');
                    navigate('/escalas', { replace: true });
                  }
                }}
                options={filtrosStatus}
              />

              <SelectFiltro
                label="Área"
                value={areaFiltro}
                onChange={setAreaFiltro}
                options={[
                  { value: 'TODAS', label: 'Todas as áreas' },
                  ...areas.map((area) => ({ value: area, label: area })),
                ]}
              />
            </div>

            <div className="mt-4 grid gap-4 border-t border-gray-100 pt-4 dark:border-gray-800">
              <div className="space-y-3">
                {modoVisualizacao === 'lista' && tipoFiltro !== 'ESPORADICA' && !filtroConfirmacoes && (
                  <div className="flex flex-wrap gap-2">
                    <Segmento
                      label="Dia"
                      options={dias}
                      value={diaSelecionado}
                      onChange={setDiaSelecionado}
                    />
                  </div>
                )}
                {modoVisualizacao === 'lista' && tipoFiltro !== 'ESPORADICA' && !filtroConfirmacoes && (
                  <div className="flex flex-wrap gap-2">
                    {['TODAS', ...semanas].map((semana) => (
                      <button
                        key={semana}
                        type="button"
                        onClick={() => setSemanaSelecionada(semana)}
                        className={`h-8 rounded-md px-2.5 text-xs font-semibold transition ${
                          semanaSelecionada === semana
                            ? 'bg-gray-950 text-white dark:bg-white dark:text-gray-950'
                            : 'border border-gray-300 bg-white text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-gray-500'
                        }`}
                      >
                        {semana === 'TODAS' ? 'Todas as semanas' : `${semana}ª semana`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {filtroConfirmacoes && (
                <button
                  type="button"
                  onClick={limparFiltros}
                  className="min-h-10 rounded-md border border-gray-950 bg-gray-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700"
                >
                  {participacaoSelecionadaId ? 'Mostrando a pendência selecionada - limpar' : 'Mostrando pendentes - limpar'}
                </button>
              )}
              {temFiltrosAtivos && !filtroConfirmacoes && (
                <button
                  type="button"
                  onClick={limparFiltros}
                  className="min-h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          </div>
        </section>

        {erro && (
          <div role="alert" aria-live="assertive" className="mt-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            <AlertCircle size={16} />
            {erro}
          </div>
        )}

        {carregando ? (
          <div className="mt-5 flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-6 py-12 text-gray-500 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando escalas...
          </div>
        ) : modoVisualizacao === 'calendario' ? (
          <CalendarioEscalas
            mes={mesCalendario}
            ocorrencias={ocorrenciasCalendario}
            visao={visao}
            onVisaoChange={alterarVisao}
            onMesAnterior={() => setMesCalendario((atual) => new Date(Date.UTC(atual.getUTCFullYear(), atual.getUTCMonth() - 1, 1)))}
            onProximoMes={() => setMesCalendario((atual) => new Date(Date.UTC(atual.getUTCFullYear(), atual.getUTCMonth() + 1, 1)))}
            onHoje={() => setMesCalendario(inicioMesAtual())}
            onSelecionar={setEventoModal}
          />
        ) : (
          <TabelaEscalas
            eventos={eventosLista}
            temResultados={escalasVisiveis.length > 0}
            totalItens={escalasVisiveis.length}
            paginaAtual={paginaAtual}
            totalPaginas={totalPaginas}
            itensPorPagina={itensPorPagina}
            onPaginaChange={setPaginaAtual}
            onItensPorPaginaChange={(valor) => {
              setItensPorPagina(Number(valor));
              setPaginaAtual(1);
            }}
            participacaoSelecionadaId={participacaoSelecionadaId}
            eventoSelecionadoId={eventoSelecionadoId}
            dataEventoSelecionada={dataEventoSelecionada}
            atualizandoId={atualizandoId}
            substituicaoAbertaId={substituicaoAbertaId}
            justificativa={justificativa}
            onAbrirSubstituicao={(id) => {
              setSubstituicaoAbertaId(id);
              setJustificativa('');
            }}
            onCancelarSubstituicao={() => {
              setSubstituicaoAbertaId(null);
              setJustificativa('');
            }}
            onChangeJustificativa={setJustificativa}
            onAtualizarStatus={atualizarStatus}
            onAbrirOrdemCulto={abrirOrdemCulto}
          />
        )}
      </main>

      {eventoModal && <ModalEvento evento={eventoModal} onClose={() => setEventoModal(null)} onAbrirOrdemCulto={abrirOrdemCulto} />}

      <Footer />
    </div>
  );
}

function SeletorVisualizacao({ value, onChange }) {
  return (
    <div className="w-full sm:w-auto">
      <p className="mb-1 text-[11px] font-semibold uppercase text-gray-500 dark:text-gray-400">Exibição</p>
      <div className="inline-flex rounded-md border border-gray-300 bg-gray-100 p-0.5 dark:border-gray-700 dark:bg-gray-900">
        {[
          { value: 'lista', label: 'Lista', icon: List },
          { value: 'calendario', label: 'Calendário', icon: CalendarDays },
        ].map((opcao) => {
          const Icon = opcao.icon;

          return (
            <button
              key={opcao.value}
              type="button"
              onClick={() => onChange(opcao.value)}
              className={`inline-flex h-8 w-9 items-center justify-center rounded transition ${
                value === opcao.value
                  ? 'bg-white text-gray-950 shadow-sm dark:bg-gray-700 dark:text-white'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
              title={opcao.label}
              aria-label={`Visualizar como ${opcao.label.toLowerCase()}`}
            >
              <Icon size={15} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CalendarioEscalas({
  mes,
  ocorrencias,
  visao,
  onVisaoChange,
  onMesAnterior,
  onProximoMes,
  onHoje,
  onSelecionar,
}) {
  const diasMes = useMemo(() => getDiasDoCalendario(mes), [mes]);
  const ocorrenciasPorDia = useMemo(() => {
    const mapa = new Map();

    for (const ocorrencia of ocorrencias) {
      const chave = chaveDataUtc(ocorrencia.data);
      mapa.set(chave, [...(mapa.get(chave) || []), ocorrencia]);
    }

    return mapa;
  }, [ocorrencias]);
  const agora = new Date();
  const hoje = chaveDataUtc(new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate())));
  const tituloMes = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(mes);

  return (
    <section className="mt-5 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:shadow-black/20">
      <div className="flex flex-col gap-4 border-b border-gray-200 px-3 py-4 dark:border-gray-800 sm:flex-row sm:items-end sm:justify-between sm:px-4">
        <div>
          <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Calendário</p>
          <h2 className="mt-1 text-lg font-bold capitalize text-gray-950 dark:text-white sm:text-xl">{tituloMes}</h2>
        </div>
        <div className="grid w-full gap-3 sm:flex sm:w-auto sm:flex-wrap sm:items-end sm:justify-end">
          <div className="min-w-0">
            <p className="mb-1.5 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Escalas exibidas</p>
            <div className="flex rounded-md border border-gray-300 bg-gray-100 p-1 dark:border-gray-700 dark:bg-gray-950">
              {[
                { value: 'todas', label: 'Todas' },
                { value: 'minhas', label: 'Minhas' },
              ].map((opcao) => (
                <button
                  key={opcao.value}
                  type="button"
                  onClick={() => onVisaoChange(opcao.value)}
                  className={`min-h-9 flex-1 rounded px-3 py-1.5 text-sm font-semibold transition sm:flex-none ${
                    visao === opcao.value
                      ? 'bg-white text-gray-950 shadow-sm dark:bg-gray-700 dark:text-white'
                      : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                  }`}
                  aria-pressed={visao === opcao.value}
                >
                  {opcao.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_2.5rem_2.5rem] items-center gap-1.5 sm:flex sm:shrink-0 sm:gap-2">
            <button type="button" onClick={onHoje} className="grid h-10 min-w-10 place-items-center rounded-md border border-gray-300 px-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 sm:flex sm:px-3" aria-label="Voltar para o mês atual" title="Mês atual">
              <CalendarDays size={17} className="sm:hidden" />
              <span className="hidden sm:inline">Hoje</span>
            </button>
            <button type="button" onClick={onMesAnterior} className="grid h-10 w-10 place-items-center rounded-md border border-gray-300 text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" aria-label="Mês anterior" title="Mês anterior">
              <ChevronLeft size={18} />
            </button>
            <button type="button" onClick={onProximoMes} className="grid h-10 w-10 place-items-center rounded-md border border-gray-300 text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" aria-label="Próximo mês" title="Próximo mês">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      <div>
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950/60">
            {diasCalendario.map((dia) => (
              <div key={dia} className="px-0.5 py-2.5 text-center text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 sm:px-2 sm:py-3 sm:text-xs">{dia}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {diasMes.map((dia) => {
              const chave = chaveDataUtc(dia);
              const itens = ocorrenciasPorDia.get(chave) || [];
              const pertenceAoMes = dia.getUTCMonth() === mes.getUTCMonth();
              const isHoje = chave === hoje;

              return (
                <div
                  key={chave}
                  className={`min-h-[4.75rem] min-w-0 border-b border-r border-gray-100 p-1 dark:border-gray-800 sm:min-h-28 sm:p-2 ${pertenceAoMes ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/70 dark:bg-gray-950/50'}`}
                >
                  <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold sm:h-7 sm:w-7 sm:text-sm ${
                    isHoje
                      ? 'bg-gray-950 text-white dark:bg-white dark:text-gray-950'
                      : pertenceAoMes ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-600'
                  }`}>
                    {dia.getUTCDate()}
                  </span>
                  <div className="mt-1 grid grid-cols-2 gap-0.5 sm:mt-2 sm:flex sm:flex-wrap">
                    {itens.slice(0, 4).map(({ evento, data }) => {
                      const titulo = `${evento.titulo} - ${formatarDataCompleta(data)} - ${evento.areas.length} função(ões)`;

                      return (
                        <button
                          key={evento.id}
                          type="button"
                          onClick={() => onSelecionar(evento)}
                          className="grid h-5 w-5 place-items-center rounded-full transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-950 dark:hover:bg-gray-800 dark:focus:ring-white sm:h-6 sm:w-6"
                          aria-label={titulo}
                          title={titulo}
                        >
                          <span className={`h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-gray-900 sm:h-3 sm:w-3 ${evento.tipo === 'ESPORADICA' ? 'bg-amber-500' : 'bg-blue-600'}`} />
                        </button>
                      );
                    })}
                    {itens.length > 4 && (
                      <button
                        type="button"
                        onClick={() => onSelecionar(itens[0].evento)}
                        className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 sm:h-6 sm:w-6"
                        aria-label={`Mais ${itens.length - 4} evento(s) neste dia`}
                        title={`Mais ${itens.length - 4} evento(s)`}
                      >
                        +{itens.length - 4}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
      </div>

      {ocorrencias.length === 0 ? (
        <div className="border-t border-gray-100 px-5 py-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
          Nenhuma escala encontrada neste mês com os filtros selecionados.
        </div>
      ) : (
      <div className="flex flex-col gap-3 border-t border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-950/60 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
              Recorrente
            </span>
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              Evento especial
            </span>
          </div>
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{ocorrencias.length} evento(s) no mês</span>
        </div>
      )}
    </section>
  );
}

function ModalEvento({ evento, onClose, onAbrirOrdemCulto }) {
  const fecharRef = useRef(null);
  const ordemCulto = evento.areas.find((area) => area.ordemCulto)?.ordemCulto || null;
  const totalVoluntariosEvento = contarVoluntariosUnicos(evento.areas);

  useEffect(() => {
    const fecharComEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', fecharComEscape);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    fecharRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', fecharComEscape);
      document.body.style.overflow = overflowAnterior;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-gray-950/65 sm:items-center sm:p-4 sm:backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="modal-evento-titulo" className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:rounded-lg">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">{evento.areas.length} função(ões) requisitada(s)</p>
            <h2 id="modal-evento-titulo" className="mt-1 text-xl font-bold text-gray-950 dark:text-white">{evento.titulo}</h2>
          </div>
          <button ref={fecharRef} type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-gray-300 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white" aria-label="Fechar detalhes do evento" title="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 border-b border-gray-100 pb-3 dark:border-gray-800 sm:border-b-0 sm:border-r sm:pr-3">
              <CalendarDays className="mt-0.5 h-5 w-5 text-dourado-700" />
              <div>
                <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Data e horário</p>
                <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{formatarDataCompleta(evento.dataHora)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              {evento.local ? <MapPin className="mt-0.5 h-5 w-5 text-dourado-700" /> : <Repeat2 className="mt-0.5 h-5 w-5 text-dourado-700" />}
              <div>
                <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">{evento.local ? 'Local' : 'Tipo'}</p>
                <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{evento.local || (evento.tipo === 'RECORRENTE' ? 'Evento recorrente' : 'Evento especial')}</p>
              </div>
            </div>
          </div>

          {evento.descricao && (
            <div>
              <h3 className="text-sm font-bold text-gray-950 dark:text-white">Descrição</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-gray-300">{evento.descricao}</p>
            </div>
          )}

          {ordemCulto && (
            <button
              type="button"
              onClick={() => onAbrirOrdemCulto(ordemCulto)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-800 transition hover:bg-gray-50 dark:border-white/70 dark:bg-gray-950 dark:text-white dark:hover:bg-gray-800 sm:w-auto"
            >
              <FileText size={17} />
              Visualizar ordem de culto
            </button>
          )}

          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="inline-flex items-center gap-2 text-sm font-bold text-gray-950 dark:text-white"><UsersRound size={17} /> Funções e pessoas atribuídas</h3>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{totalVoluntariosEvento} escalado(s)</span>
            </div>
            <div className="mt-3 divide-y divide-gray-200 border-y border-gray-200 dark:divide-gray-800 dark:border-gray-800">
              {evento.areas.map((area) => (
                <section key={area.id} className="py-4 first:pt-3 last:pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">{area.equipe?.nome || 'Outras funções'}</h4>
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{area.voluntarios?.length || 0} pessoa(s)</span>
                  </div>

                  {(area.voluntarios || []).length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Nenhuma pessoa atribuída nesta função.</p>
                  ) : (
                    <div className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
                      {area.voluntarios.map((item) => {
                        const config = statusConfig[item.status] || statusConfig.PENDENTE;
                        const Icon = config.icon;

                        return (
                          <div key={item.id} className="flex flex-col gap-2 py-3 first:pt-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-gray-200 bg-gray-100 text-sm font-bold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                                {item.usuario?.urlFoto ? (
                                  <img src={item.usuario.urlFoto} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  item.usuario?.nomeCompleto?.slice(0, 1) || '?'
                                )}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{item.usuario?.nomeCompleto || 'Voluntário'}</p>
                                {item.usuario?.telefone && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{formatarTelefoneExibicao(item.usuario.telefone)}</p>}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
                              <span className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-semibold ${config.className}`}><Icon size={12} /> {config.label}</span>
                              {item.substituto && <span className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-200">Substituto</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Resumo({ icon: Icon, label, value }) {
  return (
    <div className="min-w-24 px-3 first:pl-0 sm:px-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <p className="mt-0.5 text-xl font-bold text-gray-950 dark:text-white">{value}</p>
    </div>
  );
}

function Segmento({ label, options, value, onChange }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase text-gray-500 dark:text-gray-400">{label}</p>
      <div className="flex rounded-md border border-gray-300 bg-gray-100 p-0.5 dark:border-gray-700 dark:bg-gray-950">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`h-8 flex-1 rounded px-2.5 text-xs font-semibold transition ${
              value === option.value
                ? 'bg-white text-gray-950 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectFiltro({ label, options, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase text-gray-500 dark:text-gray-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="block h-9 w-full rounded-md border border-gray-300 bg-white px-2.5 text-sm font-semibold text-gray-700 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-gray-400 dark:focus:ring-gray-400/20"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function TabelaEscalas({
  eventos,
  temResultados,
  totalItens,
  paginaAtual,
  totalPaginas,
  itensPorPagina,
  onPaginaChange,
  onItensPorPaginaChange,
  participacaoSelecionadaId,
  eventoSelecionadoId,
  dataEventoSelecionada,
  atualizandoId,
  substituicaoAbertaId,
  justificativa,
  onAbrirSubstituicao,
  onCancelarSubstituicao,
  onChangeJustificativa,
  onAtualizarStatus,
  onAbrirOrdemCulto,
}) {
  if (!temResultados) {
    return (
      <section className="mt-5 rounded-lg border border-gray-200 bg-white px-6 py-12 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <p className="text-base font-bold text-gray-950 dark:text-white">Nenhuma escala encontrada</p>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Ajuste os filtros ou limpe os critérios para visualizar outras escalas.</p>
      </section>
    );
  }

  return (
    <section className="mt-5 space-y-4">
      {eventos.map((evento) => (
        <EventoEscalaCard
          key={evento.id}
          evento={evento}
          participacaoSelecionadaId={participacaoSelecionadaId}
          destaqueEvento={evento.eventoId === eventoSelecionadoId && mesmaDataHora(evento.dataHora, dataEventoSelecionada)}
          atualizandoId={atualizandoId}
          substituicaoAbertaId={substituicaoAbertaId}
          justificativa={justificativa}
          onAbrirSubstituicao={onAbrirSubstituicao}
          onCancelarSubstituicao={onCancelarSubstituicao}
          onChangeJustificativa={onChangeJustificativa}
          onAtualizarStatus={onAtualizarStatus}
          onAbrirOrdemCulto={onAbrirOrdemCulto}
        />
      ))}
      <PaginacaoEscalas
        totalItens={totalItens}
        paginaAtual={paginaAtual}
        totalPaginas={totalPaginas}
        itensPorPagina={itensPorPagina}
        onPaginaChange={onPaginaChange}
        onItensPorPaginaChange={onItensPorPaginaChange}
      />
    </section>
  );
}

function PaginacaoEscalas({
  totalItens,
  paginaAtual,
  totalPaginas,
  itensPorPagina,
  onPaginaChange,
  onItensPorPaginaChange,
}) {
  const inicio = totalItens === 0 ? 0 : ((paginaAtual - 1) * itensPorPagina) + 1;
  const fim = Math.min(totalItens, paginaAtual * itensPorPagina);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          Mostrando {inicio}-{fim} de {totalItens} escala(s)
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Página {paginaAtual} de {totalPaginas}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <SelectFiltro
          label="Itens por página"
          value={String(itensPorPagina)}
          onChange={onItensPorPaginaChange}
          options={opcoesItensPorPagina.map((quantidade) => ({
            value: String(quantidade),
            label: `${quantidade} escalas`,
          }))}
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onPaginaChange(Math.max(1, paginaAtual - 1))}
            disabled={paginaAtual <= 1}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-gray-300 px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <ChevronLeft size={16} /> Anterior
          </button>
          <button
            type="button"
            onClick={() => onPaginaChange(Math.min(totalPaginas, paginaAtual + 1))}
            disabled={paginaAtual >= totalPaginas}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-gray-300 px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Próxima <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function EventoEscalaCard({ evento, participacaoSelecionadaId, destaqueEvento, atualizandoId, substituicaoAbertaId, justificativa, onAbrirSubstituicao, onCancelarSubstituicao, onChangeJustificativa, onAtualizarStatus, onAbrirOrdemCulto }) {
  const participacoes = evento.escalas.filter((escala) => escala.minhaParticipacao && !escala.encerrada);

  return (
    <article
      id={evento.eventoId ? getEventoDomId(evento.eventoId, evento.dataHora) : undefined}
      className={`overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-gray-900 dark:shadow-black/20 ${
        destaqueEvento
          ? 'border-amber-400 ring-2 ring-amber-300 dark:border-amber-400 dark:ring-amber-600'
          : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      <header className="border-b border-gray-200 px-4 py-4 dark:border-gray-700 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="break-words text-xl font-bold text-gray-950 dark:text-white">{evento.titulo}</h2>
              {evento.encerrada && <span className="rounded border border-gray-300 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500 dark:border-white/60 dark:text-gray-200">Encerrada</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-gray-600 dark:text-gray-200">
              <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} />{formatarDataCompleta(evento.dataHora)}</span>
              {evento.local && <span className="inline-flex items-center gap-1.5"><MapPin size={15} />{evento.local}</span>}
            </div>
            {evento.descricao && <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-200">{evento.descricao}</p>}
          </div>
          {evento.ordemCulto && (
            <button type="button" onClick={() => onAbrirOrdemCulto(evento.ordemCulto)} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-xs font-bold text-gray-800 transition hover:bg-gray-50 dark:border-white/70 dark:bg-gray-950 dark:text-white dark:hover:bg-gray-800">
              <Eye size={15} /> Visualizar ordem
            </button>
          )}
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-bold uppercase text-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300">
            <tr><th className="px-4 py-2.5">Voluntário</th><th className="px-4 py-2.5">Função</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Ações</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {evento.escalas.flatMap((escala) => {
              const voluntarios = escala.voluntarios?.length ? escala.voluntarios : [null];
              return voluntarios.map((item) => {
                const config = statusConfig[item?.status] || statusConfig.PENDENTE;
                const Icon = config.icon;
                const minhaParticipacao = item?.id === escala.minhaParticipacao?.id ? escala.minhaParticipacao : null;
                const destaque = participacaoSelecionadaId && minhaParticipacao?.id === participacaoSelecionadaId;

                return (
                  <tr id={minhaParticipacao ? `participacao-${minhaParticipacao.id}` : undefined} key={`${escala.id}-${item?.id || 'vazio'}`} className={destaque ? 'bg-amber-50 dark:bg-amber-950/40' : ''}>
                    <td className="px-4 py-3"><AvatarVoluntario usuario={item?.usuario} /></td>
                    <td className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-100">{escala.equipe?.nome || 'Sem função'}</td>
                    <td className="px-4 py-3">
                      {item ? <div className="flex flex-wrap gap-1.5"><span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${config.className}`}><Icon size={11} />{config.label}</span>{item.substituto && <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-200">Substituto</span>}</div> : <span className="text-xs text-gray-400 dark:text-gray-300">Não atribuído</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {minhaParticipacao && !escala.encerrada && <AcoesEscala participacao={minhaParticipacao} escala={escala} atualizandoId={atualizandoId} onAbrirSubstituicao={onAbrirSubstituicao} onAtualizarStatus={onAtualizarStatus} />}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>

      {participacoes.map((escala) => escala.minhaParticipacao && substituicaoAbertaId === escala.minhaParticipacao.id ? (
        <div key={`justificativa-${escala.id}`} className="border-t border-sky-200 bg-sky-50 p-4 dark:border-sky-800 dark:bg-sky-950/40">
          <label className="block text-sm font-semibold text-sky-800 dark:text-sky-100">Justificativa da substituição
            <textarea value={justificativa} onChange={(event) => onChangeJustificativa(event.target.value)} rows={3} className="mt-2 block w-full rounded-md border border-sky-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none dark:border-white/60 dark:bg-gray-950 dark:text-white" placeholder="Explique rapidamente por que precisa de substituição." />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={atualizandoId === escala.minhaParticipacao.id} onClick={() => onAtualizarStatus(escala.minhaParticipacao.id, 'PEDIU_SUBSTITUICAO', justificativa, escala.dataHora)} className="inline-flex h-9 items-center gap-2 rounded-md bg-sky-700 px-3 text-sm font-semibold text-white disabled:opacity-60"><RefreshCcw size={15} />Enviar solicitação</button>
            <button type="button" onClick={onCancelarSubstituicao} className="h-9 rounded-md border border-sky-300 bg-white px-3 text-sm font-semibold text-sky-700 dark:border-white/60 dark:bg-gray-950 dark:text-sky-100">Cancelar</button>
          </div>
        </div>
      ) : null)}
    </article>
  );
}

function AvatarVoluntario({ usuario }) {
  if (!usuario) return <span className="text-sm text-gray-400 dark:text-gray-300">Nenhum voluntário</span>;

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-gray-200 bg-gray-100 text-sm font-bold text-gray-700 dark:border-white/60 dark:bg-gray-800 dark:text-white">
        {usuario.urlFoto ? <img src={usuario.urlFoto} alt="" className="h-full w-full object-cover" /> : usuario.nomeCompleto?.slice(0, 1) || '?'}
      </span>
      <div className="min-w-0"><p className="max-w-52 truncate font-semibold text-gray-800 dark:text-white">{usuario.nomeCompleto || 'Voluntário'}</p>{usuario.telefone && <p className="text-[11px] text-gray-500 dark:text-gray-300">{formatarTelefoneExibicao(usuario.telefone)}</p>}</div>
    </div>
  );
}

function AcoesEscala({ participacao, escala, atualizandoId, onAbrirSubstituicao, onAtualizarStatus }) {
  return (
    <div className="inline-flex gap-1.5">
      <button type="button" title="Confirmar escala" aria-label="Confirmar escala" disabled={atualizandoId === participacao.id || ['CONFIRMADA', 'AUSENTE'].includes(participacao.status)} onClick={() => onAtualizarStatus(participacao.id, 'CONFIRMADA', '', escala.dataHora)} className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-gray-950 text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-gray-950">
        {atualizandoId === participacao.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 size={15} />}
      </button>
      <button type="button" title="Solicitar substituição" aria-label="Solicitar substituição" disabled={atualizandoId === participacao.id || ['PEDIU_SUBSTITUICAO', 'AUSENTE'].includes(participacao.status)} onClick={() => onAbrirSubstituicao(participacao.id)} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/60 dark:bg-gray-950 dark:text-white">
        <RefreshCcw size={15} />
      </button>
    </div>
  );
}

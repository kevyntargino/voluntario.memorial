import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
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
import { formatarTelefoneExibicao } from '../lib/telefone';

const areas = ['Midia', 'Iluminação', 'Filmagem', 'Fotografia', 'DTV', 'Direção', 'Redes Sociais'];
const semanas = [1, 2, 3, 4];
const dias = [
  { value: 0, label: 'Domingo' },
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
const coresArea = {
  Midia: 'bg-blue-600',
  'Iluminação': 'bg-amber-500',
  Filmagem: 'bg-emerald-600',
  Fotografia: 'bg-violet-600',
  DTV: 'bg-rose-600',
  'Direção': 'bg-cyan-600',
  'Redes Sociais': 'bg-red-600',
};

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

function formatarHorario(dataHora) {
  if (!dataHora) {
    return 'Horário a confirmar';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(dataHora));
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

export default function Escalas() {
  const { token, logout } = useAuth();
  const { navigate, search } = useNavigation();
  const parametrosIniciais = new URLSearchParams(search || '');
  const filtroInicial = parametrosIniciais.get('filtro');
  const [visao, setVisao] = useState(filtroInicial === 'confirmacoes' ? 'minhas' : 'todas');
  const [filtroConfirmacoes, setFiltroConfirmacoes] = useState(filtroInicial === 'confirmacoes');
  const [participacaoSelecionadaId, setParticipacaoSelecionadaId] = useState(parametrosIniciais.get('participacao') || '');
  const [diaSelecionado, setDiaSelecionado] = useState(0);
  const [semanaSelecionada, setSemanaSelecionada] = useState(1);
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
  const [escalaModal, setEscalaModal] = useState(null);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

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

    if (filtro === 'confirmacoes') {
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

  const escalasVisiveis = useMemo(() => {
    const termo = normalizar(busca);

    return escalas.filter((escala) => {
      const isEsporadicaMinha = visao === 'minhas' && escala.tipo === 'ESPORADICA';
      const mesmaSemana = getSemanaDoMes(escala) === semanaSelecionada;
      const mesmoDia = getDiaSemana(escala) === diaSelecionado;
      const correspondeParticipacao = !participacaoSelecionadaId || escala.minhaParticipacao?.id === participacaoSelecionadaId;
      const correspondeConfirmacao = !filtroConfirmacoes || escala.minhaParticipacao?.status === 'PENDENTE';
      const correspondeTipo = tipoFiltro === 'TODAS' || escala.tipo === tipoFiltro;
      const correspondeArea = areaFiltro === 'TODAS' || escala.equipe?.nome === areaFiltro;
      const statusBase = visao === 'minhas'
        ? [escala.minhaParticipacao?.status]
        : (escala.voluntarios || []).map((item) => item.status);
      const correspondeStatus = statusFiltro === 'TODOS' || statusBase.includes(statusFiltro);
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

      if (filtroConfirmacoes) {
        return correspondeParticipacao && correspondeConfirmacao && correspondeTipo && correspondeArea && correspondeTexto;
      }

      return correspondeTipo
        && correspondeArea
        && correspondeStatus
        && (isEsporadicaMinha || !usaFiltroPeriodo || (mesmaSemana && mesmoDia))
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
  }, [areaFiltro, busca, diaSelecionado, escalas, filtroConfirmacoes, modoVisualizacao, ordem, participacaoSelecionadaId, semanaSelecionada, statusFiltro, tipoFiltro, visao]);

  const escalasPorArea = useMemo(() => {
    const mapa = new Map(areas.map((area) => [area, []]));

    for (const escala of escalasVisiveis) {
      const area = escala.equipe?.nome || 'Outras';
      mapa.set(area, [...(mapa.get(area) || []), escala]);
    }

    const manterAreasVazias = !filtroConfirmacoes
      && !participacaoSelecionadaId
      && !busca.trim()
      && areaFiltro === 'TODAS'
      && statusFiltro === 'TODOS'
      && tipoFiltro !== 'ESPORADICA';

    return Array.from(mapa.entries())
      .map(([area, itens]) => ({ area, itens }))
      .filter(({ itens }) => manterAreasVazias || itens.length > 0);
  }, [areaFiltro, busca, escalasVisiveis, filtroConfirmacoes, participacaoSelecionadaId, statusFiltro, tipoFiltro]);

  const totalVoluntarios = escalasVisiveis.reduce((total, escala) => total + (escala.voluntarios?.length || 0), 0);
  const ocorrenciasCalendario = useMemo(() => escalasVisiveis
    .map((escala) => {
      const data = escala.tipo === 'RECORRENTE'
        ? getOcorrenciaRecorrenteNoMes(escala, mesCalendario)
        : getData(escala);

      return data ? { escala, data } : null;
    })
    .filter((item) => item
      && item.data.getUTCFullYear() === mesCalendario.getUTCFullYear()
      && item.data.getUTCMonth() === mesCalendario.getUTCMonth()), [escalasVisiveis, mesCalendario]);
  const temFiltrosAtivos = filtroConfirmacoes
    || Boolean(participacaoSelecionadaId)
    || busca.trim()
    || areaFiltro !== 'TODAS'
    || statusFiltro !== 'TODOS'
    || tipoFiltro !== 'TODAS'
    || ordem !== 'proximas';
  const totalFiltrosAtivos = [
    filtroConfirmacoes || Boolean(participacaoSelecionadaId),
    Boolean(busca.trim()),
    areaFiltro !== 'TODAS',
    statusFiltro !== 'TODOS',
    tipoFiltro !== 'TODAS',
    ordem !== 'proximas',
  ].filter(Boolean).length;

  const limparFiltros = () => {
    setFiltroConfirmacoes(false);
    setParticipacaoSelecionadaId('');
    setTipoFiltro('TODAS');
    setStatusFiltro('TODOS');
    setAreaFiltro('TODAS');
    setOrdem('proximas');
    setBusca('');
    navigate('/escalas', { replace: true });
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
                {filtroConfirmacoes ? 'Confirmações pendentes' : 'Escalas por área'}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">
                {participacaoSelecionadaId
                  ? 'Abrimos a pendência exata enviada pela notificação para você confirmar ou solicitar substituição.'
                  : filtroConfirmacoes
                  ? 'Veja somente suas escalas que ainda aguardam confirmação.'
                  : 'Veja os voluntários escalados para cada área nos sábados e domingos do 1º ao 4º fim de semana.'}
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

        <section className="mt-4 border-y border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 md:rounded-lg md:border md:shadow-sm">
          <button
            type="button"
            onClick={() => setFiltrosAbertos((aberto) => !aberto)}
            className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left md:hidden"
            aria-expanded={filtrosAbertos}
          >
            <span className="inline-flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-100">
              <SlidersHorizontal size={17} />
              Filtros e ordenação
            </span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              {totalFiltrosAtivos > 0 ? `${totalFiltrosAtivos} ativo(s)` : filtrosAbertos ? 'Fechar' : 'Abrir'}
            </span>
          </button>

          <div className={`${filtrosAbertos ? 'block' : 'hidden'} border-t border-gray-200 p-4 dark:border-gray-800 md:block md:border-t-0`}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[auto_minmax(140px,0.7fr)_minmax(140px,0.7fr)_minmax(160px,0.8fr)_minmax(220px,1.2fr)] xl:items-end">
            <Segmento
              label="Visão"
              options={[
                { value: 'todas', label: 'Todas as escalas' },
                { value: 'minhas', label: 'Somente minhas' },
              ]}
              value={visao}
              onChange={(valor) => {
                setVisao(valor);
                if (filtroConfirmacoes && valor !== 'minhas') {
                  limparFiltros();
                }
              }}
            />

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

            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Busca</p>
              <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                className="block min-h-11 w-full rounded-md border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-gray-400 dark:focus:ring-gray-400/20"
                placeholder="Buscar por área, título ou voluntário"
              />
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 border-t border-gray-100 pt-4 dark:border-gray-800 lg:grid-cols-[1fr_auto] lg:items-end">
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
                  {semanas.map((semana) => (
                    <button
                      key={semana}
                      type="button"
                      onClick={() => setSemanaSelecionada(semana)}
                      className={`min-h-10 rounded-md px-3 py-2 text-sm font-semibold transition ${
                        semanaSelecionada === semana
                          ? 'bg-gray-950 text-white dark:bg-white dark:text-gray-950'
                          : 'border border-gray-300 bg-white text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-gray-500'
                      }`}
                    >
                      {semana}º fim de semana
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-3 lg:justify-end">
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
          <div className="mt-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
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
            onMesAnterior={() => setMesCalendario((atual) => new Date(Date.UTC(atual.getUTCFullYear(), atual.getUTCMonth() - 1, 1)))}
            onProximoMes={() => setMesCalendario((atual) => new Date(Date.UTC(atual.getUTCFullYear(), atual.getUTCMonth() + 1, 1)))}
            onHoje={() => setMesCalendario(inicioMesAtual())}
            onSelecionar={(escala, data) => setEscalaModal(prepararEscalaModal(escala, data))}
          />
        ) : (
          <TabelaEscalas
            escalasPorArea={escalasPorArea}
            temResultados={escalasVisiveis.length > 0}
            participacaoSelecionadaId={participacaoSelecionadaId}
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
          />
        )}
      </main>

      {escalaModal && <ModalEscala escala={escalaModal} onClose={() => setEscalaModal(null)} />}

      <Footer />
    </div>
  );
}

function SeletorVisualizacao({ value, onChange }) {
  return (
    <div className="w-full sm:w-auto">
      <p className="mb-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Exibição</p>
      <div className="flex rounded-md border border-gray-300 bg-gray-100 p-1 dark:border-gray-700 dark:bg-gray-900">
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
              className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded px-3 py-2 text-sm font-semibold transition sm:flex-none ${
                value === opcao.value
                  ? 'bg-white text-gray-950 shadow-sm dark:bg-gray-700 dark:text-white'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              <Icon size={15} />
              {opcao.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CalendarioEscalas({ mes, ocorrencias, onMesAnterior, onProximoMes, onHoje, onSelecionar }) {
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
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-3 py-4 dark:border-gray-800 sm:px-4">
        <div>
          <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Calendário</p>
          <h2 className="mt-1 text-lg font-bold capitalize text-gray-950 dark:text-white sm:text-xl">{tituloMes}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
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
                  className={`min-h-20 border-b border-r border-gray-100 p-1 dark:border-gray-800 sm:min-h-28 sm:p-2 ${pertenceAoMes ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/70 dark:bg-gray-950/50'}`}
                >
                  <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold sm:h-7 sm:w-7 sm:text-sm ${
                    isHoje
                      ? 'bg-gray-950 text-white dark:bg-white dark:text-gray-950'
                      : pertenceAoMes ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-600'
                  }`}>
                    {dia.getUTCDate()}
                  </span>
                  <div className="mt-1 flex flex-wrap gap-0 sm:mt-2 sm:gap-0.5">
                    {itens.map(({ escala, data }) => {
                      const titulo = `${escala.equipe?.nome || 'Equipe'}: ${escala.titulo || 'Escala'} - ${formatarDataCompleta(data)}`;

                      return (
                        <button
                          key={`${escala.id}-${data.toISOString()}`}
                          type="button"
                          onClick={() => onSelecionar(escala, data)}
                          className="grid h-6 w-6 place-items-center rounded-full transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-950 dark:hover:bg-gray-800 dark:focus:ring-white"
                          aria-label={titulo}
                          title={titulo}
                        >
                          <span className={`h-3 w-3 rounded-full ring-2 ring-white dark:ring-gray-900 ${coresArea[escala.equipe?.nome] || 'bg-gray-600'}`} />
                        </button>
                      );
                    })}
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
        <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-950/60">
          {Array.from(new Set(ocorrencias.map(({ escala }) => escala.equipe?.nome || 'Outras'))).map((area) => (
            <span key={area} className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
              <span className={`h-2.5 w-2.5 rounded-full ${coresArea[area] || 'bg-gray-600'}`} />
              {area}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function ModalEscala({ escala, onClose }) {
  const fecharRef = useRef(null);

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
      <div role="dialog" aria-modal="true" aria-labelledby="modal-escala-titulo" className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:rounded-lg">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">{escala.equipe?.nome || 'Equipe'}</p>
            <h2 id="modal-escala-titulo" className="mt-1 text-xl font-bold text-gray-950 dark:text-white">{escala.titulo || 'Escala sem título'}</h2>
          </div>
          <button ref={fecharRef} type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-gray-300 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white" aria-label="Fechar detalhes da escala" title="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 border-b border-gray-100 pb-3 dark:border-gray-800 sm:border-b-0 sm:border-r sm:pr-3">
              <CalendarDays className="mt-0.5 h-5 w-5 text-dourado-700" />
              <div>
                <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Data e horário</p>
                <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{formatarDataCompleta(escala.dataHora)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              {escala.local ? <MapPin className="mt-0.5 h-5 w-5 text-dourado-700" /> : <Repeat2 className="mt-0.5 h-5 w-5 text-dourado-700" />}
              <div>
                <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">{escala.local ? 'Local' : 'Tipo'}</p>
                <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{escala.local || (escala.tipo === 'RECORRENTE' ? 'Escala recorrente' : 'Escala esporádica')}</p>
              </div>
            </div>
          </div>

          {escala.descricao && (
            <div>
              <h3 className="text-sm font-bold text-gray-950 dark:text-white">Descrição</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-gray-300">{escala.descricao}</p>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="inline-flex items-center gap-2 text-sm font-bold text-gray-950 dark:text-white"><UsersRound size={17} /> Voluntários</h3>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{escala.voluntarios?.length || 0} escalado(s)</span>
            </div>
            {(escala.voluntarios || []).length === 0 ? (
              <p className="mt-3 rounded-md border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">Nenhum voluntário atribuído a esta escala.</p>
            ) : (
              <div className="mt-3 divide-y divide-gray-100 border-y border-gray-100 dark:divide-gray-800 dark:border-gray-800">
                {escala.voluntarios.map((item) => {
                  const config = statusConfig[item.status] || statusConfig.PENDENTE;
                  const Icon = config.icon;

                  return (
                    <div key={item.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{item.usuario?.nomeCompleto || 'Voluntário'}</p>
                        {item.usuario?.telefone && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{formatarTelefoneExibicao(item.usuario.telefone)}</p>}
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                        <span className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-semibold ${config.className}`}><Icon size={12} /> {config.label}</span>
                        {item.substituto && <span className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700">Substituto</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
      <p className="mb-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{label}</p>
      <div className="flex rounded-md border border-gray-300 bg-gray-100 p-1 dark:border-gray-700 dark:bg-gray-950">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`min-h-10 flex-1 rounded px-3 py-2 text-sm font-semibold transition ${
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
      <span className="mb-2 block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="block min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-gray-400 dark:focus:ring-gray-400/20"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function TabelaEscalas({
  escalasPorArea,
  temResultados,
  participacaoSelecionadaId,
  atualizandoId,
  substituicaoAbertaId,
  justificativa,
  onAbrirSubstituicao,
  onCancelarSubstituicao,
  onChangeJustificativa,
  onAtualizarStatus,
}) {
  const linhas = escalasPorArea.flatMap(({ area, itens }) => (
    itens.length > 0
      ? itens.map((escala) => ({ area, escala }))
      : [{ area, escala: null }]
  ));

  return (
    <section className="mt-5 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:shadow-black/20">
      <div className="hidden grid-cols-[minmax(160px,0.8fr)_minmax(220px,1.2fr)] border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-bold uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-400 md:grid">
        <span>Função</span>
        <span>Voluntários</span>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {!temResultados ? (
          <div className="px-6 py-12 text-center">
            <p className="text-base font-bold text-gray-950 dark:text-white">Nenhuma escala encontrada</p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Ajuste os filtros, altere a busca ou limpe os critérios para visualizar outras escalas.</p>
          </div>
        ) : linhas.map(({ area, escala }) => (
          <EscalaLinha
            key={escala?.id || area}
            area={area}
            escala={escala}
            destaque={Boolean(participacaoSelecionadaId && escala?.minhaParticipacao?.id === participacaoSelecionadaId)}
            atualizandoId={atualizandoId}
            substituicaoAbertaId={substituicaoAbertaId}
            justificativa={justificativa}
            onAbrirSubstituicao={onAbrirSubstituicao}
            onCancelarSubstituicao={onCancelarSubstituicao}
            onChangeJustificativa={onChangeJustificativa}
            onAtualizarStatus={onAtualizarStatus}
          />
        ))}
      </div>
    </section>
  );
}

function EscalaLinha({
  area,
  escala,
  destaque,
  atualizandoId,
  substituicaoAbertaId,
  justificativa,
  onAbrirSubstituicao,
  onCancelarSubstituicao,
  onChangeJustificativa,
  onAtualizarStatus,
}) {
  const participacao = escala?.minhaParticipacao;
  const justificando = participacao && substituicaoAbertaId === participacao.id;

  return (
    <div
      id={participacao ? `participacao-${participacao.id}` : undefined}
      className={`grid gap-4 px-4 py-5 transition md:grid-cols-[minmax(160px,0.8fr)_minmax(220px,1.2fr)] ${
        destaque ? 'bg-amber-50/80 ring-2 ring-inset ring-amber-300 dark:bg-amber-950/45 dark:ring-amber-500/70' : ''
      }`}
    >
      <div className="border-b border-gray-100 pb-4 dark:border-gray-800 md:border-b-0 md:pb-0 md:pr-4">
        <div className="flex items-start justify-between gap-3">
        <p className="text-base font-bold text-gray-950 dark:text-white">{area}</p>
        {destaque && (
          <span className="inline-flex rounded border border-amber-300 bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Selecionada
          </span>
        )}
        </div>
        {escala ? (
          <>
            <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-300">{formatarHorario(escala.dataHora)}</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{escala.titulo || 'Escala sem título'}</p>
            {escala.tipo === 'ESPORADICA' && (
              <span className="mt-2 inline-flex rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold uppercase text-amber-700 dark:border-amber-700 dark:bg-amber-950/70 dark:text-amber-200">
                Esporádica
              </span>
            )}
            {escala.tipo === 'ESPORADICA' && (
              <p className="mt-2 text-xs font-semibold text-gray-600 dark:text-gray-200">{formatarDataCompleta(escala.dataHora)}</p>
            )}
            {escala.local && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Local: {escala.local}</p>}
            {escala.descricao && <p className="mt-2 max-w-sm text-xs leading-5 text-gray-600 dark:text-gray-300">{escala.descricao}</p>}
          </>
        ) : (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Nenhuma escala neste período.</p>
        )}
      </div>

      {escala ? (
        <div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:flex xl:flex-wrap">
              {(escala.voluntarios || []).map((item) => {
                const config = statusConfig[item.status] || statusConfig.PENDENTE;
                const Icon = config.icon;

                return (
                  <div key={item.id} className="flex min-w-0 items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-950 xl:min-w-48">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-white text-sm font-bold text-gray-700 shadow-sm dark:bg-gray-800 dark:text-gray-200 dark:shadow-none">
                      {item.usuario?.nomeCompleto?.slice(0, 1) || '?'}
                    </span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                        <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{item.usuario?.nomeCompleto || 'Voluntário'}</p>
                        {item.usuario?.telefone && (
                          <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">{formatarTelefoneExibicao(item.usuario.telefone)}</span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <p className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${config.className}`}>
                          <Icon size={11} />
                          {config.label}
                        </p>
                        {item.substituto && (
                          <span className="inline-flex rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-200">
                            Substituto
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {participacao && (
              <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:justify-end">
                <button
                  type="button"
                  disabled={atualizandoId === participacao.id || ['CONFIRMADA', 'AUSENTE'].includes(participacao.status)}
                  onClick={() => onAtualizarStatus(participacao.id, 'CONFIRMADA', '', escala.dataHora)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-gray-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                >
                  {atualizandoId === participacao.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 size={16} />}
                  Confirmar
                </button>
                <button
                  type="button"
                  disabled={atualizandoId === participacao.id || ['PEDIU_SUBSTITUICAO', 'AUSENTE'].includes(participacao.status)}
                  onClick={() => onAbrirSubstituicao(participacao.id)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <RefreshCcw size={16} />
                  Substituição
                </button>
              </div>
            )}
          </div>

          {justificando && (
            <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950/40">
              <label className="block text-sm font-semibold text-sky-800 dark:text-sky-200">
                Justificativa da substituição
                <textarea
                  value={justificativa}
                  onChange={(event) => onChangeJustificativa(event.target.value)}
                  rows={3}
                  className="mt-2 block w-full rounded-md border border-sky-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10 dark:border-sky-900 dark:bg-gray-950 dark:text-gray-100"
                  placeholder="Explique rapidamente por que precisa de substituição."
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={atualizandoId === participacao.id}
                  onClick={() => onAtualizarStatus(participacao.id, 'PEDIU_SUBSTITUICAO', justificativa, escala.dataHora)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                  {atualizandoId === participacao.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw size={16} />}
                  Enviar solicitação
                </button>
                <button type="button" onClick={onCancelarSubstituicao} className="min-h-11 rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-700 dark:border-sky-900 dark:bg-gray-950 dark:text-sky-200">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-gray-500 dark:text-gray-400">Sem voluntários escalados.</div>
      )}
    </div>
  );
}

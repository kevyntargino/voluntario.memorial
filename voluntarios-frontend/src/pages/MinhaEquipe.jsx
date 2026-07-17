import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  List,
  Loader2,
  Save,
  SlidersHorizontal,
  UserPlus,
  UsersRound,
  RefreshCcw,
  Search,
  Bell,
  X,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import { Footer } from '../components/Footer';
import { UsuarioInfoButton, UsuarioModal } from '../components/UsuarioModal';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { buildApiUrl } from '../lib/api';
import { PhoneInput } from '../components/PhoneInput';
import { formatarTelefoneExibicao } from '../lib/telefone';

const formEscalaInicial = {
  id: null,
  titulo: '',
  voluntarioIds: [],
  substitutoIds: [],
};
const formNovoVoluntarioInicial = {
  nomeCompleto: '',
  email: '',
  telefone: '',
};

const filtrosRecorrentes = [0, 6].flatMap((diaSemana) => (
  [1, 2, 3, 4].map((semanaMes) => ({
    chave: `RECORRENTE:${diaSemana}:${semanaMes}`,
    diaSemana,
    semanaMes,
    label: `${semanaMes}º ${diaSemana === 0 ? 'domingo' : 'sábado'}`,
  }))
));

const statusConfig = {
  PENDENTE: { label: 'Pendente', className: 'border-amber-200 bg-amber-50 text-amber-700', icon: Clock3 },
  CONFIRMADA: { label: 'Confirmado', className: 'border-emerald-200 bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  PEDIU_SUBSTITUICAO: { label: 'Substituição', className: 'border-sky-200 bg-sky-50 text-sky-700', icon: RefreshCcw },
  AUSENTE: { label: 'Ausente', className: 'border-red-200 bg-red-50 text-red-700', icon: AlertCircle },
};
const filtrosTipoEscala = [
  { value: 'TODAS', label: 'Todas' },
  { value: 'RECORRENTE', label: 'Recorrentes' },
  { value: 'ESPORADICA', label: 'Esporádicas' },
];
const filtrosStatusEscala = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'PENDENTE', label: 'Pendentes' },
  { value: 'CONFIRMADA', label: 'Confirmados' },
  { value: 'PEDIU_SUBSTITUICAO', label: 'Substituição' },
  { value: 'AUSENTE', label: 'Ausentes' },
];
const opcoesItensPorPaginaEscalas = [5, 10, 20, 30];
const diasCalendario = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function normalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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

function gerarSenhaTemporaria(nomeCompleto) {
  const primeiroNome = String(nomeCompleto || '').trim().split(/\s+/)[0] || '';
  return primeiroNome ? `${primeiroNome.toLowerCase()}123` : '';
}

function formatarData(dataHora) {
  if (!dataHora) {
    return 'Sem data';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(dataHora));
}

function getEscalaFiltroId(filtroEscala) {
  if (filtroEscala.startsWith('ESCALA:')) {
    return filtroEscala.replace('ESCALA:', '');
  }

  if (filtroEscala.startsWith('ESPORADICA:')) {
    return filtroEscala.replace('ESPORADICA:', '');
  }

  return '';
}

function formatarOpcaoEscala(escala) {
  const titulo = escala.titulo || (escala.tipo === 'ESPORADICA' ? 'Escala esporádica' : 'Escala fixa');
  return `${titulo} - ${formatarData(escala.dataHora)}`;
}

export default function MinhaEquipe() {
  const { token, usuario, logout } = useAuth();
  const { navigate, search } = useNavigation();
  const parametros = new URLSearchParams(search || '');
  const equipeUrlId = parametros.get('equipe') || '';
  const escalaSelecionadaId = parametros.get('escala') || '';
  const pedidoSelecionadoId = parametros.get('pedido') || '';
  const participacaoSelecionadaId = parametros.get('participacao') || '';
  const [equipes, setEquipes] = useState([]);
  const [equipeId, setEquipeId] = useState('');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [formEscala, setFormEscala] = useState(formEscalaInicial);
  const [substitutosSelecionados, setSubstitutosSelecionados] = useState({});
  const [filtroEscala, setFiltroEscala] = useState('TODAS');
  const [usuarioModal, setUsuarioModal] = useState(null);
  const [mostrarCadastroVoluntario, setMostrarCadastroVoluntario] = useState(false);
  const [formNovoVoluntario, setFormNovoVoluntario] = useState(formNovoVoluntarioInicial);
  const [buscaEscalas, setBuscaEscalas] = useState('');
  const [tipoEscalas, setTipoEscalas] = useState('TODAS');
  const [statusEscalas, setStatusEscalas] = useState('TODOS');
  const [ordemEscalas, setOrdemEscalas] = useState('proximas');
  const [modoEscalasEquipe, setModoEscalasEquipe] = useState('lista');
  const [filtrosEscalasAbertos, setFiltrosEscalasAbertos] = useState(false);
  const [mesEscalasEquipe, setMesEscalasEquipe] = useState(inicioMesAtual);
  const [paginaEscalas, setPaginaEscalas] = useState(1);
  const [itensPorPaginaEscalas, setItensPorPaginaEscalas] = useState(5);

  const carregarEquipes = useCallback(async () => {
    setErro('');
    setCarregando(true);

    try {
      const resposta = await fetch(buildApiUrl('/api/equipes/minhas'), {
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

        throw new Error(dados.erro || 'Não foi possível carregar sua equipe.');
      }

      const proximasEquipes = dados.equipes || [];
      setEquipes(proximasEquipes);
      setEquipeId((atual) => (
        equipeUrlId && proximasEquipes.some((equipe) => equipe.id === equipeUrlId)
          ? equipeUrlId
          : atual || proximasEquipes?.[0]?.id || ''
      ));
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar sua equipe.');
    } finally {
      setCarregando(false);
    }
  }, [equipeUrlId, logout, navigate, token]);

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

  useEffect(() => {
    carregarEquipes();
  }, [carregarEquipes]);

  useEffect(() => {
    if (equipeUrlId && equipes.some((equipe) => equipe.id === equipeUrlId)) {
      setEquipeId(equipeUrlId);
    }
  }, [equipeUrlId, equipes]);

  const equipeSelecionada = useMemo(
    () => equipes.find((equipe) => equipe.id === equipeId) || null,
    [equipeId, equipes],
  );
  const senhaTemporariaNovoVoluntario = gerarSenhaTemporaria(formNovoVoluntario.nomeCompleto);

  useEffect(() => {
    if (!escalaSelecionadaId || !equipeSelecionada) {
      return;
    }

    const escala = equipeSelecionada.escalas.find((item) => item.id === escalaSelecionadaId);

    if (!escala) {
      return;
    }

    setBuscaEscalas('');
    setTipoEscalas('TODAS');
    setStatusEscalas('TODOS');
    setFiltroEscala(`ESCALA:${escala.id}`);
    setFormEscala({
      id: escala.id,
      voluntarioIds: escala.voluntarios.map((item) => item.usuario.id),
      substitutoIds: escala.voluntarios.filter((item) => item.substituto).map((item) => item.usuario.id),
    });

    window.setTimeout(() => {
      document.getElementById(`equipe-escala-${escala.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 120);
  }, [equipeSelecionada, escalaSelecionadaId]);

  const escalasEsporadicas = useMemo(() => (
    (equipeSelecionada?.escalas || [])
      .filter((escala) => escala.tipo === 'ESPORADICA')
      .sort((a, b) => new Date(a.dataHora || 0).getTime() - new Date(b.dataHora || 0).getTime())
  ), [equipeSelecionada]);

  const escalasFiltradas = useMemo(() => {
    if (!equipeSelecionada) {
      return [];
    }

    const termo = normalizar(buscaEscalas);
    let base = equipeSelecionada.escalas || [];

    if (filtroEscala.startsWith('ESCALA:') || filtroEscala.startsWith('ESPORADICA:')) {
      const escalaId = getEscalaFiltroId(filtroEscala);
      base = base.filter((escala) => escala.id === escalaId);
    } else if (filtroEscala === 'RECORRENTES') {
      base = base.filter((escala) => escala.tipo === 'RECORRENTE');
    } else if (filtroEscala === 'ESPORADICAS') {
      base = base.filter((escala) => escala.tipo === 'ESPORADICA');
    } else if (filtroEscala !== 'TODAS') {
      const filtro = filtrosRecorrentes.find((item) => item.chave === filtroEscala);

      if (filtro) {
        base = base.filter((escala) => (
          escala.tipo === 'RECORRENTE'
          && escala.diaSemana === filtro.diaSemana
          && escala.semanaMes === filtro.semanaMes
        ));
      }
    }

    return base
      .filter((escala) => {
        const correspondeTipo = tipoEscalas === 'TODAS' || escala.tipo === tipoEscalas;
        const statusDaEscala = (escala.voluntarios || []).map((item) => item.status);
        const correspondeStatus = statusEscalas === 'TODOS' || statusDaEscala.includes(statusEscalas);
        const texto = normalizar([
          escala.titulo,
          escala.local,
          escala.descricao,
          equipeSelecionada.nome,
          escala.voluntarios?.map((item) => [
            item.usuario?.nomeCompleto,
            item.usuario?.telefone,
            statusConfig[item.status]?.label,
          ].join(' ')).join(' '),
        ].join(' '));

        return correspondeTipo && correspondeStatus && (!termo || texto.includes(termo));
      })
      .sort((a, b) => {
        if (ordemEscalas === 'distantes') {
          return new Date(b.dataHora || 0).getTime() - new Date(a.dataHora || 0).getTime();
        }

        if (ordemEscalas === 'status') {
          const aPendentes = (a.voluntarios || []).filter((item) => item.status === 'PENDENTE').length;
          const bPendentes = (b.voluntarios || []).filter((item) => item.status === 'PENDENTE').length;
          return bPendentes - aPendentes || new Date(a.dataHora || 0).getTime() - new Date(b.dataHora || 0).getTime();
        }

        return new Date(a.dataHora || 0).getTime() - new Date(b.dataHora || 0).getTime();
      });
  }, [buscaEscalas, equipeSelecionada, filtroEscala, ordemEscalas, statusEscalas, tipoEscalas]);

  useEffect(() => {
    if (!equipeSelecionada) {
      return;
    }

    if (filtroEscala.startsWith('ESCALA:') || filtroEscala.startsWith('ESPORADICA:')) {
      const escalaId = getEscalaFiltroId(filtroEscala);
      const escalaAindaExiste = equipeSelecionada.escalas.some((escala) => escala.id === escalaId);

      if (!escalaAindaExiste) {
        setFiltroEscala('TODAS');
      }
    }
  }, [equipeSelecionada, filtroEscala]);

  const escalaFiltroId = getEscalaFiltroId(filtroEscala);
  const escalaSelecionadaNoFiltro = useMemo(() => (
    escalaFiltroId
      ? equipeSelecionada?.escalas?.find((escala) => escala.id === escalaFiltroId) || null
      : null
  ), [equipeSelecionada, escalaFiltroId]);
  const opcoesFiltroEscala = useMemo(() => {
    const esporadicas = escalasEsporadicas.map((escala) => ({
      value: `ESCALA:${escala.id}`,
      label: formatarOpcaoEscala(escala),
    }));
    const escalaExataJaIncluida = escalaSelecionadaNoFiltro
      && esporadicas.some((opcao) => opcao.value === `ESCALA:${escalaSelecionadaNoFiltro.id}`);

    return [
      { value: 'TODAS', label: 'Todas as escalas' },
      { value: 'RECORRENTES', label: 'Todas as fixas' },
      { value: 'ESPORADICAS', label: 'Todas as esporádicas' },
      {
        label: 'Fixa por semana',
        options: filtrosRecorrentes.map((filtro) => ({
          value: filtro.chave,
          label: filtro.label,
        })),
      },
      ...(escalaSelecionadaNoFiltro && !escalaExataJaIncluida
        ? [{
            label: 'Escala selecionada',
            options: [{
              value: `ESCALA:${escalaSelecionadaNoFiltro.id}`,
              label: formatarOpcaoEscala(escalaSelecionadaNoFiltro),
            }],
          }]
        : []),
      ...(esporadicas.length > 0
        ? [{ label: 'Esporádicas específicas', options: esporadicas }]
        : []),
    ];
  }, [escalaSelecionadaNoFiltro, escalasEsporadicas]);
  const totalPaginasEscalas = Math.max(1, Math.ceil(escalasFiltradas.length / itensPorPaginaEscalas));
  const escalasPaginadas = useMemo(() => {
    const inicio = (paginaEscalas - 1) * itensPorPaginaEscalas;
    return escalasFiltradas.slice(inicio, inicio + itensPorPaginaEscalas);
  }, [escalasFiltradas, itensPorPaginaEscalas, paginaEscalas]);
  const inicioEscalas = escalasFiltradas.length === 0 ? 0 : ((paginaEscalas - 1) * itensPorPaginaEscalas) + 1;
  const fimEscalas = Math.min(escalasFiltradas.length, paginaEscalas * itensPorPaginaEscalas);
  const filtrosEscalasAtivos = Boolean(
    buscaEscalas.trim()
    || filtroEscala !== 'TODAS'
    || tipoEscalas !== 'TODAS'
    || statusEscalas !== 'TODOS'
    || ordemEscalas !== 'proximas',
  );
  const filtrosPainelEscalasAtivos = [
    filtroEscala !== 'TODAS',
    tipoEscalas !== 'TODAS',
    statusEscalas !== 'TODOS',
  ].filter(Boolean).length;
  const escalasCalendarioEquipe = useMemo(() => (
    escalasFiltradas
      .map((escala) => ({ escala, data: escala.dataHora ? new Date(escala.dataHora) : null }))
      .filter(({ data }) => (
        data
        && !Number.isNaN(data.getTime())
        && data.getUTCFullYear() === mesEscalasEquipe.getUTCFullYear()
        && data.getUTCMonth() === mesEscalasEquipe.getUTCMonth()
      ))
      .sort((a, b) => a.data.getTime() - b.data.getTime())
  ), [escalasFiltradas, mesEscalasEquipe]);

  useEffect(() => {
    setPaginaEscalas((pagina) => Math.min(pagina, totalPaginasEscalas));
  }, [totalPaginasEscalas]);

  useEffect(() => {
    setPaginaEscalas(1);
  }, [buscaEscalas, equipeId, filtroEscala, ordemEscalas, statusEscalas, tipoEscalas]);

  const limparFiltrosEscalas = () => {
    setBuscaEscalas('');
    setFiltroEscala('TODAS');
    setTipoEscalas('TODAS');
    setStatusEscalas('TODOS');
    setOrdemEscalas('proximas');
    setPaginaEscalas(1);
  };

  const atualizarEquipe = (equipeAtualizada) => {
    setEquipes((atuais) => atuais.map((equipe) => (
      equipe.id === equipeAtualizada.id ? equipeAtualizada : equipe
    )));
  };

  const requestEquipe = async (path, options = {}) => {
    const resposta = await fetch(buildApiUrl(path), {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      throw new Error(dados.erro || 'Não foi possível concluir a operação.');
    }

    if (dados.equipe) {
      atualizarEquipe(dados.equipe);
    }

    setSucesso(dados.mensagem || 'Alteração salva com sucesso.');
    return dados;
  };

  const salvarEscala = async (event) => {
    event.preventDefault();

    if (!formEscala.id) {
      setErro('Selecione uma escala para atribuir voluntários.');
      return;
    }

    setErro('');
    setSucesso('');
    setSalvando(true);

    try {
      await requestEquipe(`/api/equipes/${equipeId}/escalas/${formEscala.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          voluntarioIds: formEscala.voluntarioIds,
          substitutoIds: formEscala.substitutoIds,
        }),
      });

      setFormEscala(formEscalaInicial);
    } catch (error) {
      setErro(error.message);
    } finally {
      setSalvando(false);
    }
  };

  const editarEscala = (escala) => {
    setFormEscala({
      id: escala.id,
      titulo: escala.titulo || '',
      voluntarioIds: escala.voluntarios.map((item) => item.usuario.id),
      substitutoIds: escala.voluntarios.filter((item) => item.substituto).map((item) => item.usuario.id),
    });
  };

  const abrirEscalaSolicitada = (escala) => {
    setBuscaEscalas('');
    setTipoEscalas('TODAS');
    setStatusEscalas('TODOS');
    setFiltroEscala(`ESCALA:${escala.id}`);
    editarEscala(escala);

    window.setTimeout(() => {
      document.getElementById(`equipe-escala-${escala.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 120);
  };

  const atribuirSubstituto = async (pedidoId) => {
    const substitutoId = substitutosSelecionados[pedidoId];

    if (!substitutoId) {
      setErro('Selecione um voluntário para substituir.');
      return;
    }

    setErro('');
    setSucesso('');
    setSalvando(true);

    try {
      await requestEquipe(`/api/equipes/${equipeId}/substituicoes/${pedidoId}/atribuir`, {
        method: 'POST',
        body: JSON.stringify({ substitutoId }),
      });
      setSubstitutosSelecionados((atuais) => {
        const proximos = { ...atuais };
        delete proximos[pedidoId];
        return proximos;
      });
    } catch (error) {
      setErro(error.message);
    } finally {
      setSalvando(false);
    }
  };

  const cadastrarVoluntario = async (event) => {
    event.preventDefault();

    setErro('');
    setSucesso('');
    setSalvando(true);

    try {
      const dados = await requestEquipe(`/api/equipes/${equipeId}/voluntarios`, {
        method: 'POST',
        body: JSON.stringify(formNovoVoluntario),
      });

      setFormNovoVoluntario(formNovoVoluntarioInicial);
      setMostrarCadastroVoluntario(false);
      setSucesso(`${dados.mensagem || 'Voluntário cadastrado na equipe.'} Senha inicial: ${dados.senhaTemporaria}`);
    } catch (error) {
      setErro(error.message);
    } finally {
      setSalvando(false);
    }
  };

  const alternarVoluntarioNaEscala = (voluntarioId) => {
    setFormEscala((atual) => ({
      ...atual,
      voluntarioIds: atual.voluntarioIds.includes(voluntarioId)
        ? atual.voluntarioIds.filter((id) => id !== voluntarioId)
        : [...atual.voluntarioIds, voluntarioId],
      substitutoIds: atual.voluntarioIds.includes(voluntarioId)
        ? atual.substitutoIds.filter((id) => id !== voluntarioId)
        : atual.substitutoIds,
    }));
  };

  const alternarSubstituto = (voluntarioId) => {
    setFormEscala((atual) => ({
      ...atual,
      voluntarioIds: atual.voluntarioIds.includes(voluntarioId)
        ? atual.voluntarioIds
        : [...atual.voluntarioIds, voluntarioId],
      substitutoIds: atual.substitutoIds.includes(voluntarioId)
        ? atual.substitutoIds.filter((id) => id !== voluntarioId)
        : [...atual.substitutoIds, voluntarioId],
    }));
  };

  const pedidosSubstituicao = useMemo(() => {
    if (!equipeSelecionada) {
      return [];
    }

    return equipeSelecionada.escalas.flatMap((escala) => (
      escala.voluntarios
        .filter((item) => item.status === 'PEDIU_SUBSTITUICAO')
        .map((item) => ({ ...item, escala }))
    ));
  }, [equipeSelecionada]);

  useEffect(() => {
    const alvo = pedidoSelecionadoId || participacaoSelecionadaId;

    if (!alvo || carregando) {
      return;
    }

    window.setTimeout(() => {
      document.getElementById(`equipe-participacao-${alvo}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 150);
  }, [carregando, participacaoSelecionadaId, pedidoSelecionadoId]);

  const pedidosEscalasEsporadicas = useMemo(() => {
    if (!equipeSelecionada) {
      return [];
    }

    return equipeSelecionada.escalas.filter((escala) => (
      escala.tipo === 'ESPORADICA'
      && escala.solicitadaPeloAdmin
      && escala.voluntarios.length === 0
    ));
  }, [equipeSelecionada]);

  const podeAcessar = usuario?.permissoes?.some((permissao) => ['LIDER_EQUIPE', 'ADMINISTRADOR'].includes(permissao));

  if (!podeAcessar) {
    return (
      <div className="flex min-h-screen flex-col bg-[#f7f4ed] text-gray-900">
        <Navbar />
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
          <div className="rounded-lg border border-red-100 bg-red-50 p-5 text-red-700">
            Acesso restrito a líderes de equipe.
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f4ed] text-gray-900">
      <Navbar />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-dourado-700">Liderança</p>
              <h1 className="mt-2 text-3xl font-bold text-gray-950">Minha equipe</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                Gerencie voluntários e escalas das equipes em que você atua como líder.
              </p>
            </div>

            <select
              value={equipeId}
              onChange={(event) => {
                setEquipeId(event.target.value);
                setFormEscala(formEscalaInicial);
                setFiltroEscala('TODAS');
              }}
              className="rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
            >
              {equipes.map((equipe) => (
                <option key={equipe.id} value={equipe.id}>
                  {equipe.nome}
                </option>
              ))}
            </select>
          </div>
        </section>

        {erro && <Feedback tipo="erro" mensagem={erro} />}
        {sucesso && <Feedback tipo="sucesso" mensagem={sucesso} />}

        {carregando ? (
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-6 py-12 text-gray-500 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando equipe...
          </div>
        ) : equipeSelecionada ? (
          <div className="mt-5 grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
            <section className="space-y-5">
              <Painel
                titulo="Solicitações de substituição"
                icone={Bell}
                badge={pedidosSubstituicao.length}
              >
                {pedidosSubstituicao.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhum pedido de substituição pendente.</p>
                ) : (
                  <div className="space-y-3">
                    {pedidosSubstituicao.map((pedido) => {
                      const selecionado = pedido.id === pedidoSelecionadoId;

                      return (
                      <div
                        id={`equipe-participacao-${pedido.id}`}
                        key={pedido.id}
                        className={`rounded-md border p-3 transition ${
                          selecionado ? 'border-amber-300 bg-amber-50 ring-2 ring-amber-200' : 'border-sky-100 bg-sky-50'
                        }`}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex items-start gap-2">
                              <UsuarioInfoButton usuario={pedido.usuario} onClick={setUsuarioModal} />
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-950">{pedido.usuario.nomeCompleto}</p>
                                <p className="mt-1 text-xs font-semibold text-sky-700">{pedido.escala.titulo || 'Escala sem título'} - {formatarData(pedido.escala.dataHora)}</p>
                              </div>
                            </div>
                          </div>
                          <div className="inline-flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 text-xs font-bold text-sky-700">
                            <RefreshCcw size={14} />
                            {selecionado ? 'Pedido selecionado' : 'Pedido aberto'}
                          </div>
                        </div>
                        <p className="mt-3 rounded-md bg-white px-3 py-2 text-sm text-gray-700">
                          {pedido.justificativaSubstituicao || 'Sem justificativa informada.'}
                        </p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                          <select
                            value={substitutosSelecionados[pedido.id] || ''}
                            onChange={(event) => setSubstitutosSelecionados((atuais) => ({
                              ...atuais,
                              [pedido.id]: event.target.value,
                            }))}
                            className="rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10"
                          >
                            <option value="">Selecionar substituto</option>
                            {equipeSelecionada.voluntarios
                              .filter((voluntario) => voluntario.id !== pedido.usuario.id)
                              .map((voluntario) => (
                                <option key={voluntario.id} value={voluntario.id}>
                                  {voluntario.telefone ? `${voluntario.nomeCompleto} - ${formatarTelefoneExibicao(voluntario.telefone)}` : voluntario.nomeCompleto}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            disabled={salvando}
                            onClick={() => atribuirSubstituto(pedido.id)}
                            className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:opacity-60"
                          >
                            <UserPlus size={15} />
                            Atribuir
                          </button>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                )}
              </Painel>

              <Painel
                titulo="Escalas esporádicas solicitadas"
                icone={CalendarPlus}
                badge={pedidosEscalasEsporadicas.length}
              >
                {pedidosEscalasEsporadicas.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhuma escala esporádica aguardando atribuição.</p>
                ) : (
                  <div className="space-y-3">
                    {pedidosEscalasEsporadicas.map((escala) => (
                      <div key={escala.id} className="rounded-md border border-amber-100 bg-amber-50 p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-bold text-gray-950">{escala.titulo || 'Escala esporádica'}</p>
                            <p className="mt-1 text-xs font-semibold text-amber-700">{formatarData(escala.dataHora)}</p>
                            {escala.local && <p className="mt-1 text-xs text-gray-600">Local: {escala.local}</p>}
                            {escala.descricao && <p className="mt-2 text-sm text-gray-700">{escala.descricao}</p>}
                            {escala.ordemCulto && (
                              <button type="button" onClick={() => abrirOrdemCulto(escala.ordemCulto)} className="mt-3 inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-800">
                                <FileText size={15} />
                                Visualizar ordem de culto
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => abrirEscalaSolicitada(escala)}
                            className="inline-flex items-center justify-center gap-2 rounded-md bg-amber-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-800"
                          >
                            <UserPlus size={15} />
                            Atribuir voluntários
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Painel>

              <Painel titulo="Voluntários" icone={UsersRound}>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">{equipeSelecionada.voluntarios.length} voluntário(s) cadastrado(s)</p>
                    <p className="mt-1 text-xs text-gray-500">Consulte os dados ou cadastre um novo voluntário já vinculado a esta equipe.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMostrarCadastroVoluntario((atual) => !atual)}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
                  >
                    <UserPlus size={15} />
                    {mostrarCadastroVoluntario ? 'Fechar cadastro' : 'Cadastrar voluntário'}
                  </button>
                </div>
                {mostrarCadastroVoluntario && (
                  <form onSubmit={cadastrarVoluntario} className="mb-4 grid gap-3 rounded-xl border border-gray-200 bg-white p-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Nome completo</span>
                        <input
                          value={formNovoVoluntario.nomeCompleto}
                          onChange={(event) => setFormNovoVoluntario((atual) => ({ ...atual, nomeCompleto: event.target.value }))}
                          className="mt-1 block w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                          placeholder="Nome do voluntário"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">E-mail</span>
                        <input
                          type="email"
                          value={formNovoVoluntario.email}
                          onChange={(event) => setFormNovoVoluntario((atual) => ({ ...atual, email: event.target.value }))}
                          className="mt-1 block w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                          placeholder="email@exemplo.com"
                        />
                      </label>
                      <PhoneInput value={formNovoVoluntario.telefone} onChange={(telefone) => setFormNovoVoluntario((atual) => ({ ...atual, telefone }))} />
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs font-semibold text-gray-500">
                        Senha inicial: {senhaTemporariaNovoVoluntario || 'digite o nome do voluntário'}
                      </p>
                      <button
                        disabled={salvando}
                        className="inline-flex w-fit items-center justify-center gap-2 rounded-md bg-gray-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
                      >
                        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus size={15} />}
                        Salvar voluntário
                      </button>
                    </div>
                  </form>
                )}
                <div className="space-y-2">
                  {equipeSelecionada.voluntarios.map((voluntario) => (
                    <div key={voluntario.id} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <UsuarioInfoButton usuario={voluntario} onClick={setUsuarioModal} />
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                            <p className="truncate text-sm font-bold text-gray-950">{voluntario.nomeCompleto}</p>
                            {voluntario.telefone && (
                              <span className="text-[11px] font-medium text-gray-400">{formatarTelefoneExibicao(voluntario.telefone)}</span>
                            )}
                          </div>
                          <p className="truncate text-xs text-gray-500">{voluntario.email}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Painel>

            </section>

            <section className="space-y-5">
              <Painel titulo="Escalas da equipe" icone={CalendarPlus}>
                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="grid gap-3 lg:grid-cols-[auto_minmax(220px,1fr)_minmax(170px,0.45fr)_auto] lg:items-end">
                      <SeletorVisualizacaoEquipe value={modoEscalasEquipe} onChange={setModoEscalasEquipe} />
                      <label className="relative block">
                        <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Pesquisar</span>
                        <Search className="pointer-events-none absolute left-3 top-[2.4rem] h-4 w-4 text-gray-400" />
                        <input
                          value={buscaEscalas}
                          onChange={(event) => setBuscaEscalas(event.target.value)}
                          className="block w-full rounded-md border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                          placeholder="Nome, telefone, título ou status"
                        />
                      </label>
                      <SelectFiltro
                        label="Ordenar"
                        value={ordemEscalas}
                        onChange={setOrdemEscalas}
                        options={[
                          { value: 'proximas', label: 'Mais próximas' },
                          { value: 'distantes', label: 'Mais distantes' },
                          { value: 'status', label: 'Pendências primeiro' },
                        ]}
                      />
                      <button
                        type="button"
                        onClick={() => setFiltrosEscalasAbertos((aberto) => !aberto)}
                        className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition ${
                          filtrosEscalasAbertos || filtrosPainelEscalasAtivos > 0
                            ? 'border-gray-950 bg-gray-950 text-white hover:bg-gray-800'
                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                        aria-expanded={filtrosEscalasAbertos}
                      >
                        <SlidersHorizontal size={15} />
                        Filtros
                        {filtrosPainelEscalasAtivos > 0 && (
                          <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold leading-none">
                            {filtrosPainelEscalasAtivos}
                          </span>
                        )}
                      </button>
                    </div>

                    {filtrosEscalasAbertos && (
                      <div className="mt-4 grid gap-3 border-t border-gray-200 pt-4 lg:grid-cols-[minmax(0,1fr)_0.6fr_0.6fr_auto] lg:items-end">
                        <SelectFiltro
                          label="Ocorrência"
                          value={filtroEscala}
                          onChange={setFiltroEscala}
                          options={opcoesFiltroEscala}
                        />
                        <SelectFiltro label="Tipo" value={tipoEscalas} onChange={setTipoEscalas} options={filtrosTipoEscala} />
                        <SelectFiltro label="Status" value={statusEscalas} onChange={setStatusEscalas} options={filtrosStatusEscala} />
                        <button
                          type="button"
                          onClick={limparFiltrosEscalas}
                          disabled={!filtrosEscalasAtivos}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <X size={15} />
                          Limpar
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-semibold text-gray-800">
                      {escalasFiltradas.length} de {equipeSelecionada.escalas.length} escala(s)
                    </p>
                    <p>
                      {modoEscalasEquipe === 'calendario'
                        ? `${escalasCalendarioEquipe.length} escala(s) neste mês`
                        : escalasFiltradas.length > 0
                          ? `Mostrando ${inicioEscalas}-${fimEscalas} em ${itensPorPaginaEscalas} por página`
                          : 'Ajuste os filtros para localizar escalas'}
                    </p>
                  </div>

                  {modoEscalasEquipe === 'calendario' ? (
                    <CalendarioEscalasEquipe
                      mes={mesEscalasEquipe}
                      escalas={escalasCalendarioEquipe}
                      onMesAnterior={() => setMesEscalasEquipe((atual) => new Date(Date.UTC(atual.getUTCFullYear(), atual.getUTCMonth() - 1, 1)))}
                      onProximoMes={() => setMesEscalasEquipe((atual) => new Date(Date.UTC(atual.getUTCFullYear(), atual.getUTCMonth() + 1, 1)))}
                      onHoje={() => setMesEscalasEquipe(inicioMesAtual())}
                      onSelecionarEscala={(escala) => {
                        setFiltroEscala(`ESCALA:${escala.id}`);
                        editarEscala(escala);
                        setModoEscalasEquipe('lista');
                      }}
                    />
                  ) : (
                  <div className="space-y-3">
                    {equipeSelecionada.escalas.length === 0 ? (
                      <p className="text-sm text-gray-500">Nenhuma escala cadastrada para esta equipe.</p>
                    ) : escalasFiltradas.length === 0 ? (
                      <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                        Nenhuma escala encontrada com os filtros selecionados.
                      </div>
                    ) : escalasPaginadas.map((escala) => (
                      <div id={`equipe-escala-${escala.id}`} key={escala.id} className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-5 shadow-sm">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-dourado-200 bg-dourado-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-dourado-700">
                                {equipeSelecionada.nome}
                              </span>
                              <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${
                                escala.tipo === 'ESPORADICA'
                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                  : 'border-gray-200 bg-white text-gray-500'
                              }`}
                              >
                                {escala.tipo === 'ESPORADICA' ? 'Esporádica' : 'Recorrente'}
                              </span>
                            </div>
                            <p className="mt-3 text-xl font-bold text-gray-950">{escala.titulo || 'Escala sem título'}</p>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                              <span>{formatarData(escala.dataHora)}</span>
                              {escala.local && <span>Local: {escala.local}</span>}
                              {escala.tipo === 'RECORRENTE' && (
                                <span>{escala.semanaMes}º {escala.diaSemana === 0 ? 'domingo' : 'sábado'}</span>
                              )}
                            </div>
                            {escala.descricao && (
                              <p className="mt-3 text-sm leading-6 text-gray-600">{escala.descricao}</p>
                            )}
                            {escala.ordemCulto && (
                              <button type="button" onClick={() => abrirOrdemCulto(escala.ordemCulto)} className="mt-3 inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50">
                                <FileText size={15} />
                                Visualizar ordem de culto
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (formEscala.id === escala.id) {
                                setFormEscala(formEscalaInicial);
                              } else {
                                editarEscala(escala);
                              }
                            }}
                            className={`inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition ${
                              formEscala.id === escala.id
                                ? 'border-gray-950 bg-gray-950 text-white hover:bg-gray-800'
                                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            <UserPlus size={15} />
                            {formEscala.id === escala.id ? 'Fechar atribuição' : 'Atribuir voluntários'}
                          </button>
                        </div>

                        {formEscala.id === escala.id ? (
                          <form onSubmit={salvarEscala} className="mt-5 rounded-xl border border-dourado-200 bg-dourado-50/50 p-4">
                            <div className="flex flex-col gap-2 border-b border-dourado-100 pb-3 sm:flex-row sm:items-end sm:justify-between">
                              <div>
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-dourado-700">Atribuir voluntários</p>
                                <p className="mt-1 text-sm text-gray-600">Selecione quem participará desta escala e marque substitutos quando necessário.</p>
                              </div>
                              <span className="text-xs font-bold text-gray-500">{formEscala.voluntarioIds.length} selecionado(s)</span>
                            </div>

                            {equipeSelecionada.voluntarios.length === 0 ? (
                              <div className="mt-4 rounded-md border border-dashed border-gray-200 bg-white px-3 py-5 text-sm text-gray-500">
                                Nenhum voluntário cadastrado nesta equipe.
                              </div>
                            ) : (
                              <div className="mt-4 grid gap-2 md:grid-cols-2">
                                {equipeSelecionada.voluntarios.map((voluntario) => {
                                  const escalado = formEscala.voluntarioIds.includes(voluntario.id);
                                  const substituto = formEscala.substitutoIds.includes(voluntario.id);

                                  return (
                                    <div key={voluntario.id} className={`rounded-md border p-3 transition ${escalado ? 'border-dourado-300 bg-white' : 'border-gray-200 bg-gray-50'}`}>
                                      <div className="flex items-start gap-2">
                                        <input
                                          type="checkbox"
                                          checked={escalado}
                                          onChange={() => alternarVoluntarioNaEscala(voluntario.id)}
                                          className="mt-1 h-4 w-4 accent-gray-950"
                                          aria-label={`Atribuir ${voluntario.nomeCompleto}`}
                                        />
                                        <UsuarioInfoButton usuario={voluntario} onClick={setUsuarioModal} className="h-7 w-7" />
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate text-sm font-bold text-gray-900">{voluntario.nomeCompleto}</p>
                                          {voluntario.telefone && <p className="truncate text-[11px] font-medium text-gray-400">{formatarTelefoneExibicao(voluntario.telefone)}</p>}
                                        </div>
                                      </div>
                                      <label className={`mt-3 flex items-center gap-2 border-t pt-2 text-xs font-semibold ${substituto ? 'border-violet-100 text-violet-700' : 'border-gray-100 text-gray-500'}`}>
                                        <input
                                          type="checkbox"
                                          checked={substituto}
                                          onChange={() => alternarSubstituto(voluntario.id)}
                                          className="h-4 w-4 accent-violet-600"
                                        />
                                        Marcar como substituto
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            <div className="mt-4 flex flex-wrap gap-2 border-t border-dourado-100 pt-4">
                              <button disabled={salvando} className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60">
                                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
                                Salvar atribuições
                              </button>
                              <button type="button" disabled={salvando} onClick={() => setFormEscala(formEscalaInicial)} className="rounded-md border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60">
                                Cancelar
                              </button>
                            </div>
                          </form>
                        ) : (
                        <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Voluntários da equipe</p>
                              <p className="mt-1 text-sm text-gray-600">
                                Função/equipe: <strong className="font-semibold text-gray-800">{equipeSelecionada.nome}</strong>
                              </p>
                            </div>
                            <span className="text-xs font-semibold text-gray-400">
                              {escala.voluntarios.length} voluntário(s)
                            </span>
                          </div>

                          <div className="mt-4 grid gap-2 md:grid-cols-2">
                            {escala.voluntarios.length === 0 ? (
                              <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500 md:col-span-2">
                                Nenhum voluntário da equipe foi atribuído para esta escala.
                              </div>
                            ) : escala.voluntarios.map((item) => {
                              const config = statusConfig[item.status] || statusConfig.PENDENTE;
                              const Icon = config.icon;
                              const selecionado = item.id === participacaoSelecionadaId;

                              return (
                                <div
                                  id={`equipe-participacao-${item.id}`}
                                  key={item.id}
                                  className={`rounded-lg border px-3 py-3 transition ${
                                    selecionado ? 'border-amber-300 bg-amber-50 ring-2 ring-amber-200' : 'border-gray-200 bg-gray-50'
                                  }`}
                                >
                                  <div className="flex items-start gap-2">
                                    <UsuarioInfoButton usuario={item.usuario} onClick={setUsuarioModal} />
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                        <p className="text-sm font-bold text-gray-900">{item.usuario.nomeCompleto}</p>
                                        {item.usuario.telefone && (
                                          <span className="text-[11px] font-medium text-gray-400">{formatarTelefoneExibicao(item.usuario.telefone)}</span>
                                        )}
                                        {selecionado && (
                                          <span className="rounded-full bg-gray-950 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                                            Selecionado
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${config.className}`}>
                                      <Icon size={11} />
                                      {config.label}
                                    </span>
                                    {item.substituto && (
                                      <span className="inline-flex rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700">
                                        Substituto
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        )}
                      </div>
                    ))}
                  </div>
                  )}

                  {modoEscalasEquipe === 'lista' && escalasFiltradas.length > 0 && (
                    <PaginacaoEscalasEquipe
                      totalItens={escalasFiltradas.length}
                      paginaAtual={paginaEscalas}
                      totalPaginas={totalPaginasEscalas}
                      itensPorPagina={itensPorPaginaEscalas}
                      onPaginaChange={setPaginaEscalas}
                      onItensPorPaginaChange={(valor) => {
                        setItensPorPaginaEscalas(Number(valor));
                        setPaginaEscalas(1);
                      }}
                    />
                  )}
                </div>
              </Painel>
            </section>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-gray-200 bg-white px-6 py-10 text-gray-500">
            Nenhuma equipe disponível para gerenciamento.
          </div>
        )}
      </main>

      <UsuarioModal usuario={usuarioModal} onClose={() => setUsuarioModal(null)} />
      <Footer />
    </div>
  );
}

function Painel({ titulo, icone: Icon, badge, children }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-dourado-600" />
          <h2 className="text-lg font-bold text-gray-950">{titulo}</h2>
        </div>
        {typeof badge === 'number' && badge > 0 && (
          <span className="rounded-full bg-sky-700 px-2.5 py-1 text-xs font-bold text-white">
            {badge}
          </span>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function SeletorVisualizacaoEquipe({ value, onChange }) {
  return (
    <div>
      <p className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Exibição</p>
      <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5">
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
              className={`inline-flex h-9 w-9 items-center justify-center rounded transition ${
                value === opcao.value
                  ? 'bg-gray-950 text-white'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`}
              title={opcao.label}
              aria-label={`Visualizar como ${opcao.label.toLowerCase()}`}
              aria-pressed={value === opcao.value}
            >
              <Icon size={16} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CalendarioEscalasEquipe({
  mes,
  escalas,
  onMesAnterior,
  onProximoMes,
  onHoje,
  onSelecionarEscala,
}) {
  const diasMes = useMemo(() => getDiasDoCalendario(mes), [mes]);
  const escalasPorDia = useMemo(() => {
    const mapa = new Map();

    for (const item of escalas) {
      const chave = chaveDataUtc(item.data);
      mapa.set(chave, [...(mapa.get(chave) || []), item]);
    }

    return mapa;
  }, [escalas]);
  const agora = new Date();
  const hoje = chaveDataUtc(new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate())));
  const tituloMes = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(mes);

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Calendário</p>
          <h3 className="mt-1 text-lg font-bold capitalize text-gray-950">{tituloMes}</h3>
        </div>
        <div className="grid grid-cols-[1fr_2.5rem_2.5rem] items-center gap-2 sm:flex">
          <button type="button" onClick={onHoje} className="grid h-10 min-w-10 place-items-center rounded-md border border-gray-200 px-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 sm:flex sm:px-3" aria-label="Voltar para o mês atual" title="Mês atual">
            <CalendarDays size={17} className="sm:hidden" />
            <span className="hidden sm:inline">Hoje</span>
          </button>
          <button type="button" onClick={onMesAnterior} className="grid h-10 w-10 place-items-center rounded-md border border-gray-200 text-gray-600 transition hover:bg-gray-50" aria-label="Mês anterior" title="Mês anterior">
            <ChevronLeft size={18} />
          </button>
          <button type="button" onClick={onProximoMes} className="grid h-10 w-10 place-items-center rounded-md border border-gray-200 text-gray-600 transition hover:bg-gray-50" aria-label="Próximo mês" title="Próximo mês">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
        {diasCalendario.map((dia) => (
          <div key={dia} className="px-1 py-2.5 text-center text-[10px] font-bold uppercase text-gray-500 sm:text-xs">{dia}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {diasMes.map((dia) => {
          const chave = chaveDataUtc(dia);
          const itens = escalasPorDia.get(chave) || [];
          const pertenceAoMes = dia.getUTCMonth() === mes.getUTCMonth();
          const isHoje = chave === hoje;

          return (
            <div key={chave} className={`min-h-[5.5rem] min-w-0 border-b border-r border-gray-100 p-1.5 sm:min-h-32 sm:p-2 ${pertenceAoMes ? 'bg-white' : 'bg-gray-50/70'}`}>
              <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold sm:h-7 sm:w-7 sm:text-sm ${
                isHoje
                  ? 'bg-gray-950 text-white'
                  : pertenceAoMes ? 'text-gray-800' : 'text-gray-400'
              }`}>
                {dia.getUTCDate()}
              </span>
              <div className="mt-1.5 space-y-1">
                {itens.slice(0, 3).map(({ escala }) => {
                  const pendentes = (escala.voluntarios || []).filter((item) => item.status === 'PENDENTE').length;

                  return (
                    <button
                      key={escala.id}
                      type="button"
                      onClick={() => onSelecionarEscala(escala)}
                      className="block w-full truncate rounded-md border border-gray-200 bg-gray-50 px-1.5 py-1 text-left text-[11px] font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
                      title={`${escala.titulo || 'Escala sem título'} - ${formatarData(escala.dataHora)}`}
                    >
                      {escala.titulo || 'Escala sem título'}
                      {pendentes > 0 && <span className="ml-1 text-amber-700">({pendentes})</span>}
                    </button>
                  );
                })}
                {itens.length > 3 && (
                  <span className="block rounded-md bg-gray-100 px-1.5 py-1 text-[11px] font-bold text-gray-500">
                    +{itens.length - 3} escala(s)
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {escalas.length === 0 && (
        <div className="border-t border-gray-100 px-5 py-8 text-center text-sm text-gray-500">
          Nenhuma escala encontrada neste mês com os filtros selecionados.
        </div>
      )}
    </section>
  );
}

function SelectFiltro({ label, options, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-gray-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="block w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
      >
        {options.map((option) => (
          option.options ? (
            <optgroup key={option.label} label={option.label}>
              {option.options.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </optgroup>
          ) : (
            <option key={option.value} value={option.value}>{option.label}</option>
          )
        ))}
      </select>
    </label>
  );
}

function PaginacaoEscalasEquipe({
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
    <div className="flex flex-col gap-3 rounded-md border border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-gray-700">
          Mostrando {inicio}-{fim} de {totalItens} escala(s)
        </p>
        <p className="mt-1 text-xs text-gray-500">Página {paginaAtual} de {totalPaginas}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <SelectFiltro
          label="Itens por página"
          value={String(itensPorPagina)}
          onChange={onItensPorPaginaChange}
          options={opcoesItensPorPaginaEscalas.map((quantidade) => ({
            value: String(quantidade),
            label: `${quantidade} escalas`,
          }))}
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onPaginaChange(Math.max(1, paginaAtual - 1))}
            disabled={paginaAtual <= 1}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-gray-300 px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft size={16} />
            Anterior
          </button>
          <button
            type="button"
            onClick={() => onPaginaChange(Math.min(totalPaginas, paginaAtual + 1))}
            disabled={paginaAtual >= totalPaginas}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-gray-300 px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Próxima
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Feedback({ tipo, mensagem }) {
  const isErro = tipo === 'erro';

  return (
    <div className={`mt-5 flex items-center gap-2 rounded-md border px-4 py-3 text-sm font-medium ${
      isErro ? 'border-red-100 bg-red-50 text-red-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'
    }`}>
      {isErro && <AlertCircle size={16} />}
      {mensagem}
    </div>
  );
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  Home,
  LayoutDashboard,
  Loader2,
  MapPin,
  Megaphone,
  MoreHorizontal,
  RefreshCcw,
  ShieldCheck,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { RecorrenciaBadge, RecorrenciaOrdinal } from './RecorrenciaBadge';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { buildApiUrl } from '../lib/api';
import { getAgoraEscalas } from '../lib/escalas';
import { formatarTelefoneExibicao } from '../lib/telefone';

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
const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;
const ANTECEDENCIA_CONFIRMACAO_ESCALA_MS = 5 * DIA_MS;
const LIMITE_ACAO_ESCALA_ANTES_INICIO_MS = 2 * HORA_MS;
const DURACAO_REFERENCIA_EVENTO_MS = 2 * HORA_MS;
const JANELA_PROXIMA_ESCALA_APOS_TERMINO_MS = 3 * HORA_MS;
const RETENCAO_PROXIMA_ESCALA_MS = DURACAO_REFERENCIA_EVENTO_MS + JANELA_PROXIMA_ESCALA_APOS_TERMINO_MS;
const QUERY_ABRIR_PROXIMA_ESCALA = 'abrirProximaEscala';
const QUERY_PARTICIPACAO_PROXIMA_ESCALA = 'proximaParticipacao';
const QUERY_DATA_PROXIMA_ESCALA = 'dataOcorrencia';

function formatarData(dataHora) {
  if (!dataHora) return 'Data a confirmar';

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(dataHora));
}

function getDataEscala(escala) {
  const data = escala?.dataHora ? new Date(escala.dataHora) : null;
  return data && !Number.isNaN(data.getTime()) ? data : null;
}

function mesmaDataEscala(data, dataReferencia) {
  if (!data || !dataReferencia) {
    return false;
  }

  const referencia = new Date(dataReferencia);

  return !Number.isNaN(referencia.getTime()) && data.getTime() === referencia.getTime();
}

function getProximaEscala(escalas, agora = getAgoraEscalas(), alvo = {}) {
  const agoraMs = agora.getTime();
  const candidatas = [...(escalas || [])]
    .filter((escala) => {
      const data = getDataEscala(escala);

      return escala.minhaParticipacao
        && data
        && data.getTime() + RETENCAO_PROXIMA_ESCALA_MS >= agoraMs;
    });
  const participacaoAlvo = alvo.participacaoId || '';
  const dataAlvo = alvo.dataOcorrencia || '';

  if (participacaoAlvo) {
    const escalaComData = candidatas.find((escala) => (
      escala.minhaParticipacao?.id === participacaoAlvo
      && (!dataAlvo || mesmaDataEscala(getDataEscala(escala), dataAlvo))
    ));

    if (escalaComData) {
      return escalaComData;
    }

    const escalaSemData = candidatas.find((escala) => escala.minhaParticipacao?.id === participacaoAlvo);

    if (escalaSemData) {
      return escalaSemData;
    }
  }

  const jaIniciadas = candidatas
    .filter((escala) => getDataEscala(escala).getTime() <= agoraMs)
    .sort((a, b) => getDataEscala(b).getTime() - getDataEscala(a).getTime());

  if (jaIniciadas.length > 0) {
    return jaIniciadas[0];
  }

  return candidatas
    .sort((a, b) => getDataEscala(a).getTime() - getDataEscala(b).getTime())[0] || null;
}

function getChaveOcorrenciaEscala(escala) {
  const data = getDataEscala(escala);
  const dataIso = data?.toISOString() || 'sem-data';

  if (escala?.eventoId) return `evento:${escala.eventoId}:${dataIso}`;
  if (escala?.grupoEsporadicoId) return `grupo:${escala.grupoEsporadicoId}:${dataIso}`;
  return `escala:${escala?.id || 'sem-id'}:${dataIso}`;
}

function enriquecerComVoluntariosDaOcorrencia(escalas, proximaEscala) {
  if (!proximaEscala) return null;

  const chave = getChaveOcorrenciaEscala(proximaEscala);
  const escalasDaOcorrencia = (escalas || []).filter((escala) => getChaveOcorrenciaEscala(escala) === chave);

  if (escalasDaOcorrencia.length <= 1) {
    return proximaEscala;
  }

  return {
    ...proximaEscala,
    ordemCulto: proximaEscala.ordemCulto || escalasDaOcorrencia.find((escala) => escala.ordemCulto)?.ordemCulto || null,
    voluntarios: escalasDaOcorrencia.flatMap((escala) => (
      (escala.voluntarios || []).map((item) => ({
        ...item,
        equipe: escala.equipe,
        escalaId: escala.id,
      }))
    )),
  };
}

function getDisponibilidadeAcoesEscala(escala, participacao, agora = getAgoraEscalas()) {
  const data = getDataEscala(escala);

  if (!participacao || !data) {
    return { podeConfirmar: false, podePedirSubstituicao: false, mensagem: '' };
  }

  if (participacao.status === 'CONFIRMADA') {
    return { podeConfirmar: false, podePedirSubstituicao: false, mensagem: 'Esta escala já foi confirmada.' };
  }

  if (participacao.status === 'AUSENTE') {
    return { podeConfirmar: false, podePedirSubstituicao: false, mensagem: 'Esta escala foi marcada como ausente.' };
  }

  const inicio = data.getTime();
  const atual = agora.getTime();
  const abertura = inicio - ANTECEDENCIA_CONFIRMACAO_ESCALA_MS;
  const fechamento = inicio - LIMITE_ACAO_ESCALA_ANTES_INICIO_MS;

  if (atual < abertura) {
    return {
      podeConfirmar: false,
      podePedirSubstituicao: false,
      mensagem: `A confirmação abre em ${formatarData(new Date(abertura).toISOString())}.`,
    };
  }

  if (atual >= fechamento) {
    return {
      podeConfirmar: false,
      podePedirSubstituicao: false,
      mensagem: 'O prazo para confirmar ou pedir substituição encerrou 2 horas antes do evento.',
    };
  }

  return {
    podeConfirmar: true,
    podePedirSubstituicao: participacao.status !== 'PEDIU_SUBSTITUICAO',
    mensagem: '',
  };
}

function escalaEstaAcontecendo(escala, agora = getAgoraEscalas()) {
  const data = getDataEscala(escala);

  if (!data) {
    return false;
  }

  const inicio = data.getTime();
  const atual = agora.getTime();

  return atual >= inicio && atual <= inicio + DURACAO_REFERENCIA_EVENTO_MS;
}

function getEstadoAtalhoProximaEscala(escala, agora = getAgoraEscalas()) {
  const participacao = escala?.minhaParticipacao;

  if (escalaEstaAcontecendo(escala, agora)) {
    return {
      tipo: 'ao-vivo',
      label: 'Agora',
      title: 'Evento acontecendo',
      ariaLabel: 'Abrir escala em andamento',
      icon: CalendarCheck2,
      className: 'bg-emerald-600 text-white shadow-emerald-600/35 dark:bg-emerald-400 dark:text-gray-950',
    };
  }

  const disponibilidadeAcoes = getDisponibilidadeAcoesEscala(escala, participacao, agora);

  if (participacao?.status === 'PENDENTE' && disponibilidadeAcoes.podeConfirmar) {
    return {
      tipo: 'pendente',
      label: 'Confirmar',
      title: 'Confirmação pendente',
      ariaLabel: 'Abrir escala com confirmação pendente',
      icon: AlertCircle,
      className: 'mobile-bottom-nav-pending bg-amber-500 text-gray-950 shadow-amber-500/35 dark:bg-amber-300 dark:text-gray-950',
    };
  }

  return {
    tipo: 'normal',
    label: 'Próxima',
    title: 'Próxima escala',
    ariaLabel: 'Abrir próxima escala',
    icon: CalendarCheck2,
    className: 'bg-gray-950 text-white shadow-gray-950/25 dark:bg-dourado-500 dark:text-gray-950',
  };
}

function getDestinoEscala(escala) {
  if (escala?.eventoId && escala?.dataHora) {
    return `/escalas?evento=${encodeURIComponent(escala.eventoId)}&data=${encodeURIComponent(escala.dataHora)}`;
  }

  if (escala?.minhaParticipacao?.id) {
    return `/escalas?filtro=confirmacoes&participacao=${encodeURIComponent(escala.minhaParticipacao.id)}`;
  }

  return '/escalas';
}

function itemNavegacaoEstaAtivo(item, pathname) {
  if (typeof item.ativo === 'boolean') return item.ativo;
  if (item.exato || item.path === '/') return pathname === item.path;
  return pathname.startsWith(item.path);
}

export function MobileBottomNav() {
  const { token, usuario, logout } = useAuth();
  const { pathname, search, navigate } = useNavigation();
  const [modalAberto, setModalAberto] = useState(false);
  const [carregandoEscala, setCarregandoEscala] = useState(false);
  const [erroEscala, setErroEscala] = useState('');
  const [proximaEscala, setProximaEscala] = useState(null);
  const [atualizandoStatus, setAtualizandoStatus] = useState('');
  const [abrindoOrdemCulto, setAbrindoOrdemCulto] = useState(false);
  const [substituicaoAberta, setSubstituicaoAberta] = useState(false);
  const [justificativaSubstituicao, setJustificativaSubstituicao] = useState('');
  const [erroAcaoEscala, setErroAcaoEscala] = useState('');
  const [menuAberto, setMenuAberto] = useState(false);
  const [agoraEscalas, setAgoraEscalas] = useState(() => getAgoraEscalas());
  const fecharRef = useRef(null);
  const navRef = useRef(null);
  const deepLinkTratadoRef = useRef('');
  const isAdmin = usuario?.permissoes?.includes('ADMINISTRADOR');
  const isLiderEquipe = usuario?.permissoes?.includes('LIDER_EQUIPE');
  const contextoAdmin = isAdmin && pathname.startsWith('/admin');
  const contextoEquipe = isLiderEquipe && pathname.startsWith('/minha-equipe');
  const parametrosEquipe = new URLSearchParams(search || '');
  const escalaEquipeViaLink = pathname === '/minha-equipe'
    && parametrosEquipe.has('escala')
    && !parametrosEquipe.has('pedido');
  const itensNavegacaoPrincipal = [
    { label: 'Início', path: '/', icon: Home },
    { label: 'Escalas', path: '/escalas', icon: CalendarDays },
    { key: 'proxima', label: 'Próxima', tipo: 'proxima' },
    { label: 'Equipe', path: '/minha-equipe', icon: UsersRound },
    { label: 'Manuais', path: '/manuais', icon: BookOpen },
    ...(isAdmin ? [{ label: 'Admin', path: '/admin', icon: ShieldCheck }] : []),
  ];
  const itensNavegacaoEquipe = [
    { label: 'Principal', path: '/', icon: Home, exato: true },
    {
      label: 'Dashboard',
      path: '/minha-equipe',
      icon: LayoutDashboard,
      ativo: pathname === '/minha-equipe' && !escalaEquipeViaLink,
    },
    { label: 'Voluntários', path: '/minha-equipe/voluntarios', icon: UsersRound, exato: true },
    {
      label: 'Escalas',
      path: '/minha-equipe/escalas',
      icon: CalendarDays,
      ativo: pathname === '/minha-equipe/escalas' || escalaEquipeViaLink,
    },
  ];
  const itensNavegacaoAdmin = [
    { label: 'Principal', path: '/', icon: Home, exato: true },
    { label: 'Dashboard', path: '/admin', icon: LayoutDashboard, exato: true },
    { label: 'Voluntários', path: '/admin/voluntarios', icon: UsersRound, exato: true },
    { label: 'Equipes', path: '/admin/equipes', icon: Users, exato: true },
    { label: 'Notificar', path: '/admin/notificacoes', icon: Megaphone, exato: true },
    { label: 'Escalas', path: '/admin/escalas', icon: CalendarDays, exato: true },
    { label: 'Manuais', path: '/admin/manuais', icon: BookOpen, exato: true },
  ];
  const contextoAtivo = contextoAdmin ? 'admin' : contextoEquipe ? 'equipe' : 'principal';
  const itensNavegacao = contextoAdmin
    ? itensNavegacaoAdmin
    : contextoEquipe
      ? itensNavegacaoEquipe
      : itensNavegacaoPrincipal;
  const temMenuMais = itensNavegacao.length > 5;
  const itensVisiveis = temMenuMais ? itensNavegacao.slice(0, 4) : itensNavegacao;
  const itensMenu = temMenuMais ? itensNavegacao.slice(4) : [];
  const menuAtivo = itensMenu.some((item) => itemNavegacaoEstaAtivo(item, pathname));

  const carregarProximaEscala = useCallback(async ({ abrirModal = true, participacaoId = '', dataOcorrencia = '' } = {}) => {
    if (!token) {
      setProximaEscala(null);
      return;
    }

    if (abrirModal) {
      setModalAberto(true);
      setCarregandoEscala(true);
      setErroEscala('');
      setErroAcaoEscala('');
      setSubstituicaoAberta(false);
      setJustificativaSubstituicao('');
    }

    try {
      const agoraAtual = getAgoraEscalas();
      setAgoraEscalas(agoraAtual);

      const resposta = await fetch(buildApiUrl('/api/escalas?visao=todas&atalhoProxima=1'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        if (resposta.status === 401) {
          logout();
          navigate('/login', { replace: true });
          return;
        }

        throw new Error(dados.erro || 'Não foi possível carregar sua próxima escala.');
      }

      const escalas = dados.escalas || [];
      const escalaSelecionada = getProximaEscala(escalas, agoraAtual, { participacaoId, dataOcorrencia });
      setProximaEscala(enriquecerComVoluntariosDaOcorrencia(escalas, escalaSelecionada));
    } catch (error) {
      if (abrirModal) {
        setErroEscala(error.message || 'Não foi possível carregar sua próxima escala.');
        setProximaEscala(null);
      }
    } finally {
      if (abrirModal) {
        setCarregandoEscala(false);
      }
    }
  }, [logout, navigate, token]);

  const abrirOrdemCulto = useCallback(async () => {
    const ordemCulto = proximaEscala?.ordemCulto;

    if (!ordemCulto || !token) return;

    const janela = window.open('', '_blank', 'noopener,noreferrer');

    setAbrindoOrdemCulto(true);
    setErroAcaoEscala('');

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
      setErroAcaoEscala(error.message || 'Não foi possível abrir a ordem de culto.');
    } finally {
      setAbrindoOrdemCulto(false);
    }
  }, [proximaEscala, token]);

  const atualizarStatusProximaEscala = useCallback(async (status, justificativa = '') => {
    const participacaoId = proximaEscala?.minhaParticipacao?.id;

    if (!participacaoId || !token) return;

    const justificativaNormalizada = String(justificativa || '').trim();

    if (status === 'PEDIU_SUBSTITUICAO' && justificativaNormalizada.length < 5) {
      setErroAcaoEscala('Informe uma justificativa com pelo menos 5 caracteres.');
      return;
    }

    setAtualizandoStatus(status);
    setErroAcaoEscala('');

    try {
      const resposta = await fetch(buildApiUrl(`/api/escalas/${participacaoId}/status`), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status,
          justificativaSubstituicao: justificativaNormalizada,
          dataOcorrencia: proximaEscala.dataHora,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        if (resposta.status === 401) {
          logout();
          navigate('/login', { replace: true });
          return;
        }

        throw new Error(dados.erro || 'Não foi possível atualizar sua escala.');
      }

      setProximaEscala((atual) => {
        if (!atual?.minhaParticipacao) return atual;

        const proximaParticipacao = {
          ...atual.minhaParticipacao,
          status,
          justificativaSubstituicao: status === 'PEDIU_SUBSTITUICAO' ? justificativaNormalizada : null,
          dataOcorrenciaSubstituicao: status === 'PEDIU_SUBSTITUICAO' ? atual.dataHora : null,
          dataOcorrenciaStatus: atual.dataHora,
        };

        return {
          ...atual,
          minhaParticipacao: proximaParticipacao,
          voluntarios: (atual.voluntarios || []).map((item) => (
            item.id === participacaoId
              ? {
                  ...item,
                  status,
                  justificativaSubstituicao: proximaParticipacao.justificativaSubstituicao,
                  dataOcorrenciaSubstituicao: proximaParticipacao.dataOcorrenciaSubstituicao,
                  dataOcorrenciaStatus: proximaParticipacao.dataOcorrenciaStatus,
                }
              : item
          )),
        };
      });
      setSubstituicaoAberta(false);
      setJustificativaSubstituicao('');
    } catch (error) {
      setErroAcaoEscala(error.message || 'Não foi possível atualizar sua escala.');
    } finally {
      setAtualizandoStatus('');
    }
  }, [logout, navigate, proximaEscala, token]);

  useEffect(() => {
    if (!modalAberto) return undefined;

    const fecharComEscape = (event) => {
      if (event.key === 'Escape') setModalAberto(false);
    };
    const overflowAnterior = document.body.style.overflow;

    document.addEventListener('keydown', fecharComEscape);
    document.body.style.overflow = 'hidden';
    fecharRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', fecharComEscape);
      document.body.style.overflow = overflowAnterior;
    };
  }, [modalAberto]);

  useEffect(() => {
    const intervalo = window.setInterval(() => {
      setAgoraEscalas(getAgoraEscalas());
    }, 60000);

    return () => window.clearInterval(intervalo);
  }, []);

  useEffect(() => {
    carregarProximaEscala({ abrirModal: false });
  }, [carregarProximaEscala]);

  useEffect(() => {
    const params = new URLSearchParams(search || '');
    const abrirProximaEscala = ['1', 'true'].includes(
      String(params.get(QUERY_ABRIR_PROXIMA_ESCALA) || '').toLowerCase(),
    );

    if (!abrirProximaEscala) {
      return;
    }

    const chaveDeepLink = `${pathname}${search || ''}`;

    if (deepLinkTratadoRef.current === chaveDeepLink) {
      return;
    }

    deepLinkTratadoRef.current = chaveDeepLink;
    carregarProximaEscala({
      abrirModal: true,
      participacaoId: params.get(QUERY_PARTICIPACAO_PROXIMA_ESCALA) || params.get('participacao') || '',
      dataOcorrencia: params.get(QUERY_DATA_PROXIMA_ESCALA) || '',
    });

    params.delete(QUERY_ABRIR_PROXIMA_ESCALA);
    params.delete(QUERY_PARTICIPACAO_PROXIMA_ESCALA);
    params.delete(QUERY_DATA_PROXIMA_ESCALA);

    navigate(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { replace: true });
  }, [carregarProximaEscala, navigate, pathname, search]);

  useEffect(() => {
    if (!menuAberto) return undefined;

    const fecharComEscape = (event) => {
      if (event.key === 'Escape') setMenuAberto(false);
    };
    const fecharAoTocarFora = (event) => {
      if (!navRef.current?.contains(event.target)) {
        setMenuAberto(false);
      }
    };

    document.addEventListener('keydown', fecharComEscape);
    document.addEventListener('pointerdown', fecharAoTocarFora);

    return () => {
      document.removeEventListener('keydown', fecharComEscape);
      document.removeEventListener('pointerdown', fecharAoTocarFora);
    };
  }, [menuAberto]);

  useEffect(() => {
    if (!temMenuMais && menuAberto) {
      setMenuAberto(false);
    }
  }, [menuAberto, temMenuMais]);

  const navegarPara = (path) => {
    setMenuAberto(false);
    navigate(path);
  };

  const renderItem = (item) => {
    const Icon = item.icon;
    const ativo = itemNavegacaoEstaAtivo(item, pathname);
    const classesContexto = contextoAtivo === 'admin'
      ? ativo
        ? 'text-white'
        : 'text-gray-400 active:bg-white/10'
      : contextoAtivo === 'equipe'
        ? ativo
          ? 'text-dourado-900 dark:text-dourado-100'
          : 'text-dourado-700/70 active:bg-dourado-100 dark:text-dourado-300/70 dark:active:bg-dourado-900'
        : ativo
          ? 'text-gray-950 dark:text-white'
          : 'text-gray-500 active:bg-gray-100 dark:text-gray-400 dark:active:bg-gray-900';

    return (
      <button
        key={item.path}
        type="button"
        onClick={() => navegarPara(item.path)}
        aria-current={ativo ? 'page' : undefined}
        className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-[11px] font-semibold transition-colors ${classesContexto}`}
      >
        {ativo && <span className={`absolute top-1 h-1 w-1 rounded-full ${contextoAtivo === 'admin' ? 'bg-dourado-400' : 'bg-dourado-600 dark:bg-dourado-300'}`} />}
        <Icon size={21} strokeWidth={ativo ? 2.4 : 1.8} />
        <span className="truncate">{item.label}</span>
      </button>
    );
  };

  const renderProximaItem = () => {
    const estadoAtalho = getEstadoAtalhoProximaEscala(proximaEscala, agoraEscalas);
    const AtalhoIcon = estadoAtalho.icon;
    const carregandoAtalho = carregandoEscala && modalAberto;

    return (
      <div key="proxima" className="flex justify-center">
        <button
          type="button"
          onClick={() => {
            setMenuAberto(false);
            carregarProximaEscala();
          }}
          className={`relative -mt-5 flex h-[4.45rem] w-[4.45rem] flex-col items-center justify-center gap-0.5 overflow-visible rounded-full border-[5px] border-white shadow-xl transition active:scale-95 dark:border-gray-950 ${estadoAtalho.className}`}
          aria-label={estadoAtalho.ariaLabel}
          title={estadoAtalho.title}
        >
          {estadoAtalho.tipo === 'ao-vivo' && (
            <>
              <span className="mobile-bottom-nav-radar absolute inset-0 rounded-full border border-emerald-400/70" />
              <span className="mobile-bottom-nav-radar mobile-bottom-nav-radar-delay absolute inset-0 rounded-full border border-emerald-300/60" />
            </>
          )}
          <span className="relative z-10 grid place-items-center">
            {carregandoAtalho ? <Loader2 className="h-5 w-5 animate-spin" /> : <AtalhoIcon size={24} />}
          </span>
          <span className="relative z-10 max-w-[3.5rem] truncate text-[10px] font-bold leading-none">{estadoAtalho.label}</span>
        </button>
      </div>
    );
  };

  const renderNavItem = (item) => (
    item.tipo === 'proxima' ? renderProximaItem() : renderItem(item)
  );

  return (
    <>
      <div className="h-[calc(5.75rem+env(safe-area-inset-bottom))] lg:hidden" aria-hidden="true" />
      <nav
        ref={navRef}
        aria-label={contextoAtivo === 'admin' ? 'Navegação administrativa' : contextoAtivo === 'equipe' ? 'Navegação da equipe' : 'Navegação principal'}
        data-navigation-context={contextoAtivo}
        className={`fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_14px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:hidden ${
          contextoAtivo === 'admin'
            ? 'border-gray-800 bg-gray-950/95'
            : contextoAtivo === 'equipe'
              ? 'border-dourado-300 bg-dourado-50/95 dark:border-dourado-800 dark:bg-gray-950/95'
              : 'border-gray-200 bg-white/95 dark:border-gray-800 dark:bg-gray-950/95'
        }`}
      >
        <div className="relative mx-auto max-w-md px-3">
          {temMenuMais && menuAberto && (
            <div role="menu" className="absolute bottom-[calc(100%+0.65rem)] right-3 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl shadow-gray-950/10 dark:border-gray-800 dark:bg-gray-900">
              <div className="grid gap-1 p-2">
                {itensMenu.map((item) => {
                  const Icon = item.icon;
                  const ativo = itemNavegacaoEstaAtivo(item, pathname);

                  return (
                    <button
                      key={item.path}
                      type="button"
                      role="menuitem"
                      onClick={() => navegarPara(item.path)}
                      className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition ${
                        ativo
                          ? 'bg-dourado-50 text-dourado-800 dark:bg-dourado-950/30 dark:text-dourado-200'
                          : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800'
                      }`}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div
            className="grid h-[5.05rem] items-center gap-1"
            style={{ gridTemplateColumns: `repeat(${itensVisiveis.length + (temMenuMais ? 1 : 0)}, minmax(0, 1fr))` }}
          >
            {itensVisiveis.map(renderNavItem)}
            {temMenuMais && (
              <button
                type="button"
                onClick={() => setMenuAberto((aberto) => !aberto)}
                aria-expanded={menuAberto}
                aria-haspopup="menu"
                className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-[11px] font-semibold transition-colors ${
                  contextoAtivo === 'admin'
                    ? menuAtivo || menuAberto ? 'text-white' : 'text-gray-400 active:bg-white/10'
                    : menuAtivo || menuAberto
                      ? 'text-gray-950 dark:text-white'
                      : 'text-gray-500 active:bg-gray-100 dark:text-gray-400 dark:active:bg-gray-900'
                }`}
              >
                {(menuAtivo || menuAberto) && <span className="absolute top-1 h-1 w-1 rounded-full bg-dourado-600 dark:bg-dourado-300" />}
                <MoreHorizontal size={22} strokeWidth={menuAtivo || menuAberto ? 2.4 : 1.8} />
                <span className="truncate">Mais</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {modalAberto && (
        <ProximaEscalaModal
          escala={proximaEscala}
          carregando={carregandoEscala}
          erro={erroEscala}
          erroAcao={erroAcaoEscala}
          atualizandoStatus={atualizandoStatus}
          abrindoOrdemCulto={abrindoOrdemCulto}
          agoraEscalas={agoraEscalas}
          substituicaoAberta={substituicaoAberta}
          justificativaSubstituicao={justificativaSubstituicao}
          fecharRef={fecharRef}
          onClose={() => setModalAberto(false)}
          onConfirmar={() => atualizarStatusProximaEscala('CONFIRMADA')}
          onAbrirSubstituicao={() => {
            setErroAcaoEscala('');
            setSubstituicaoAberta(true);
          }}
          onCancelarSubstituicao={() => {
            setErroAcaoEscala('');
            setSubstituicaoAberta(false);
            setJustificativaSubstituicao('');
          }}
          onChangeJustificativa={setJustificativaSubstituicao}
          onSolicitarSubstituicao={() => atualizarStatusProximaEscala('PEDIU_SUBSTITUICAO', justificativaSubstituicao)}
          onAbrirOrdemCulto={abrirOrdemCulto}
          onAbrirEscalas={() => {
            navigate(getDestinoEscala(proximaEscala));
            setModalAberto(false);
          }}
        />
      )}
    </>
  );
}

function ProximaEscalaModal({
  escala,
  carregando,
  erro,
  erroAcao,
  atualizandoStatus,
  abrindoOrdemCulto,
  agoraEscalas,
  substituicaoAberta,
  justificativaSubstituicao,
  fecharRef,
  onClose,
  onConfirmar,
  onAbrirSubstituicao,
  onCancelarSubstituicao,
  onChangeJustificativa,
  onSolicitarSubstituicao,
  onAbrirOrdemCulto,
  onAbrirEscalas,
}) {
  const participacao = escala?.minhaParticipacao;
  const config = statusConfig[participacao?.status] || statusConfig.PENDENTE;
  const StatusIcon = config.icon;
  const disponibilidadeAcoes = getDisponibilidadeAcoesEscala(escala, participacao, agoraEscalas);
  const podeConfirmar = disponibilidadeAcoes.podeConfirmar;
  const podePedirSubstituicao = disponibilidadeAcoes.podePedirSubstituicao;
  const mostrarAcoes = podeConfirmar || podePedirSubstituicao;
  const usuarioAtualId = (escala?.voluntarios || []).find((item) => item.id === participacao?.id)?.usuario?.id;
  const outrosVoluntarios = (escala?.voluntarios || []).filter((item) => (
    item.id !== participacao?.id
    && (!usuarioAtualId || item.usuario?.id !== usuarioAtualId)
  ));

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-gray-950/65 px-0 sm:items-center sm:px-4 sm:py-6 sm:backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="modal-proxima-escala-titulo" className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:rounded-lg">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-dourado-700 dark:text-dourado-300">Próxima escala</p>
            <h2 id="modal-proxima-escala-titulo" className="mt-1 text-xl font-bold text-gray-950 dark:text-white">
              {escala?.titulo || 'Sua próxima participação'}
              <RecorrenciaOrdinal escala={escala} className="ml-2" />
            </h2>
          </div>
          <button ref={fecharRef} type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-gray-300 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white" aria-label="Fechar próxima escala" title="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="space-y-4 p-4">
          {carregando ? (
            <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-8 text-sm font-semibold text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
              <Loader2 className="h-5 w-5 animate-spin" />
              Buscando sua próxima escala...
            </div>
          ) : erro ? (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              {erro}
            </div>
          ) : !escala ? (
            <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center dark:border-gray-700 dark:bg-gray-950">
              <p className="text-sm font-bold text-gray-900 dark:text-white">Nenhuma escala futura encontrada.</p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Quando uma nova escala for atribuída a você, ela aparecerá aqui.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3">
                <RecorrenciaBadge escala={escala} />
                <InfoLinha icon={CalendarDays} label="Data e horário" value={formatarData(escala.dataHora)} />
                <InfoLinha icon={UsersRound} label="Função/equipe" value={escala.equipe?.nome || 'Equipe não informada'} />
                <InfoLinha icon={escala.local ? MapPin : CalendarCheck2} label={escala.local ? 'Local' : 'Tipo'} value={escala.local || (escala.tipo === 'RECORRENTE' ? 'Evento recorrente' : 'Evento especial')} />
              </div>

              {escala.ordemCulto && (
                <button
                  type="button"
                  disabled={abrindoOrdemCulto}
                  onClick={onAbrirOrdemCulto}
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-950 dark:text-white dark:hover:bg-gray-800"
                >
                  {abrindoOrdemCulto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye size={16} />}
                  Visualizar ordem de culto
                </button>
              )}

              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-950">
                <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Seu status</p>
                <span className={`mt-2 inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-bold ${config.className}`}>
                  <StatusIcon size={13} />
                  {config.label}
                </span>
              </div>

              {disponibilidadeAcoes.mensagem && (
                <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                  <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
                  {disponibilidadeAcoes.mensagem}
                </div>
              )}

              {mostrarAcoes && (
                <div className="rounded-md border border-gray-200 bg-white px-3 py-3 dark:border-gray-800 dark:bg-gray-950">
                  <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Ações da escala</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {podeConfirmar && (
                      <button
                        type="button"
                        disabled={Boolean(atualizandoStatus)}
                        onClick={onConfirmar}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {atualizandoStatus === 'CONFIRMADA' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 size={16} />}
                        Confirmar escala
                      </button>
                    )}
                    {podePedirSubstituicao && (
                      <button
                        type="button"
                        disabled={Boolean(atualizandoStatus)}
                        onClick={onAbrirSubstituicao}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-bold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200"
                      >
                        <RefreshCcw size={16} />
                        Pedir substituição
                      </button>
                    )}
                  </div>

                  {substituicaoAberta && podePedirSubstituicao && (
                    <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-3 dark:border-sky-800 dark:bg-sky-950/40">
                      <label className="block text-sm font-bold text-sky-800 dark:text-sky-100">
                        Justificativa
                        <textarea
                          value={justificativaSubstituicao}
                          onChange={(event) => onChangeJustificativa(event.target.value)}
                          rows={3}
                          className="mt-2 block w-full rounded-md border border-sky-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10 dark:border-sky-800 dark:bg-gray-950 dark:text-white"
                          placeholder="Explique rapidamente por que precisa de substituição."
                        />
                      </label>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          disabled={Boolean(atualizandoStatus)}
                          onClick={onCancelarSubstituicao}
                          className="min-h-9 rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-bold text-sky-700 transition hover:bg-sky-50 disabled:opacity-50 dark:border-sky-800 dark:bg-gray-950 dark:text-sky-100"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(atualizandoStatus)}
                          onClick={onSolicitarSubstituicao}
                          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-sky-700 px-3 py-2 text-sm font-bold text-white transition hover:bg-sky-800 disabled:opacity-50"
                        >
                          {atualizandoStatus === 'PEDIU_SUBSTITUICAO' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw size={15} />}
                          Enviar pedido
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {erroAcao && (
                <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                  <AlertCircle className="mt-0.5 h-4 w-4" />
                  {erroAcao}
                </div>
              )}

              {escala.descricao && (
                <div>
                  <h3 className="text-sm font-bold text-gray-950 dark:text-white">Descrição</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-gray-300">{escala.descricao}</p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-gray-950 dark:text-white">Outros voluntários escalados</h3>
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{outrosVoluntarios.length}</span>
                </div>
                {outrosVoluntarios.length > 0 ? (
                  <div className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-950">
                    {outrosVoluntarios.map((item) => (
                      <VoluntarioEscalado key={item.id} item={item} />
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-sm font-semibold text-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400">
                    Nenhum outro voluntário escalado nesta função.
                  </p>
                )}
              </div>
            </>
          )}

          <div className="flex flex-col gap-2 border-t border-gray-100 pt-4 dark:border-gray-800 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="min-h-10 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-800">
              Fechar
            </button>
            <button type="button" onClick={onAbrirEscalas} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-gray-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950">
              <CalendarDays size={16} />
              Abrir em Escalas
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function InfoLinha({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-gray-200 bg-white px-3 py-3 dark:border-gray-800 dark:bg-gray-950">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-dourado-700 dark:text-dourado-300" />
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">{label}</p>
        <p className="mt-1 break-words text-sm font-semibold text-gray-800 dark:text-gray-100">{value}</p>
      </div>
    </div>
  );
}

function VoluntarioEscalado({ item, destaque }) {
  const config = statusConfig[item.status] || statusConfig.PENDENTE;
  const StatusIcon = config.icon;
  const detalhe = [item.equipe?.nome, item.usuario?.telefone ? formatarTelefoneExibicao(item.usuario.telefone) : '']
    .filter(Boolean)
    .join(' - ');

  return (
    <div className={`flex items-center justify-between gap-3 px-3 py-3 ${destaque ? 'bg-dourado-50 dark:bg-dourado-950/20' : ''}`}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-gray-200 bg-gray-100 text-sm font-bold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-white">
          {item.usuario?.urlFoto ? <img src={item.usuario.urlFoto} alt="" className="h-full w-full object-cover" /> : item.usuario?.nomeCompleto?.slice(0, 1) || '?'}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{item.usuario?.nomeCompleto || 'Voluntário'}</p>
          {detalhe && <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{detalhe}</p>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${config.className}`}>
          <StatusIcon size={11} />
          {config.label}
        </span>
        {item.substituto && <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-200">Substituto</span>}
      </div>
    </div>
  );
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Home,
  Loader2,
  MapPin,
  RefreshCcw,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react';
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

function formatarData(dataHora) {
  if (!dataHora) return 'Data a confirmar';

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(dataHora));
}

function getProximaEscala(escalas) {
  const agora = getAgoraEscalas().getTime();

  return [...(escalas || [])]
    .filter((escala) => {
      const data = escala.dataHora ? new Date(escala.dataHora) : null;
      return escala.minhaParticipacao
        && data
        && !Number.isNaN(data.getTime())
        && data.getTime() >= agora;
    })
    .sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime())[0] || null;
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

export function MobileBottomNav() {
  const { token, usuario, logout } = useAuth();
  const { pathname, navigate } = useNavigation();
  const [modalAberto, setModalAberto] = useState(false);
  const [carregandoEscala, setCarregandoEscala] = useState(false);
  const [erroEscala, setErroEscala] = useState('');
  const [proximaEscala, setProximaEscala] = useState(null);
  const fecharRef = useRef(null);
  const podeGerenciarEquipe = usuario?.permissoes?.some((permissao) => ['LIDER_EQUIPE', 'ADMINISTRADOR'].includes(permissao));
  const isAdmin = usuario?.permissoes?.includes('ADMINISTRADOR');
  const itensEsquerda = [
    { label: 'Início', path: '/', icon: Home },
    { label: 'Escalas', path: '/escalas', icon: CalendarDays },
  ];
  const itensDireita = [
    ...(podeGerenciarEquipe ? [{ label: 'Equipe', path: '/minha-equipe', icon: UsersRound }] : []),
    { label: 'Manuais', path: '/manuais', icon: BookOpen },
    ...(isAdmin ? [{ label: 'Admin', path: '/admin', icon: ShieldCheck }] : []),
  ].slice(0, 3);
  const posicoesEsquerda = ['col-start-1', 'col-start-2'];
  const posicoesDireita = itensDireita.length === 1
    ? ['col-start-6']
    : itensDireita.length === 2
      ? ['col-start-5', 'col-start-6']
      : ['col-start-5', 'col-start-6', 'col-start-7'];

  const carregarProximaEscala = useCallback(async () => {
    if (!token) return;

    setModalAberto(true);
    setCarregandoEscala(true);
    setErroEscala('');

    try {
      const resposta = await fetch(buildApiUrl('/api/escalas?visao=minhas'), {
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

      setProximaEscala(getProximaEscala(dados.escalas || []));
    } catch (error) {
      setErroEscala(error.message || 'Não foi possível carregar sua próxima escala.');
      setProximaEscala(null);
    } finally {
      setCarregandoEscala(false);
    }
  }, [logout, navigate, token]);

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

  const renderItem = (item, slotClassName) => {
    const Icon = item.icon;
    const ativo = item.path === '/' ? pathname === '/' : pathname.startsWith(item.path);

    return (
      <button
        key={item.path}
        type="button"
        onClick={() => navigate(item.path)}
        aria-current={ativo ? 'page' : undefined}
        className={`${slotClassName} relative flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold transition-colors ${
          ativo
            ? 'text-dourado-700 dark:text-dourado-300'
            : 'text-gray-500 active:bg-gray-100 dark:text-gray-400 dark:active:bg-gray-900'
        }`}
      >
        {ativo && <span className="absolute top-0 h-0.5 w-8 rounded-b bg-dourado-600" />}
        <Icon size={21} strokeWidth={ativo ? 2.4 : 1.8} />
        <span className="truncate">{item.label}</span>
      </button>
    );
  };

  return (
    <>
      <div className="h-[calc(5.25rem+env(safe-area-inset-bottom))] md:hidden" aria-hidden="true" />
      <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_12px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/95 md:hidden">
        <div className="relative mx-auto grid h-[4.75rem] max-w-md grid-cols-[1fr_1fr_1fr_5.5rem_1fr_1fr_1fr]">
          {itensEsquerda.map((item, index) => renderItem(item, posicoesEsquerda[index]))}
          <div className="col-start-4" aria-hidden="true" />
          {itensDireita.map((item, index) => renderItem(item, posicoesDireita[index]))}
          <button
            type="button"
            onClick={carregarProximaEscala}
            className="absolute left-1/2 top-0 z-10 flex h-[4.35rem] w-[4.35rem] -translate-x-1/2 -translate-y-3 flex-col items-center justify-center gap-0.5 rounded-full border-[5px] border-white bg-gray-950 text-white shadow-xl shadow-gray-950/25 transition active:translate-y-[-0.65rem] dark:border-gray-950 dark:bg-dourado-500 dark:text-gray-950"
            aria-label="Abrir próxima escala"
            title="Próxima escala"
          >
            {carregandoEscala && modalAberto ? <Loader2 className="h-5 w-5 animate-spin" /> : <CalendarCheck2 size={23} />}
            <span className="text-[10px] font-bold leading-none">Próxima</span>
          </button>
        </div>
      </nav>

      {modalAberto && (
        <ProximaEscalaModal
          escala={proximaEscala}
          carregando={carregandoEscala}
          erro={erroEscala}
          fecharRef={fecharRef}
          onClose={() => setModalAberto(false)}
          onAbrirEscalas={() => {
            navigate(getDestinoEscala(proximaEscala));
            setModalAberto(false);
          }}
        />
      )}
    </>
  );
}

function ProximaEscalaModal({ escala, carregando, erro, fecharRef, onClose, onAbrirEscalas }) {
  const participacao = escala?.minhaParticipacao;
  const config = statusConfig[participacao?.status] || statusConfig.PENDENTE;
  const StatusIcon = config.icon;

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-gray-950/65 px-0 sm:items-center sm:px-4 sm:py-6 sm:backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="modal-proxima-escala-titulo" className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:rounded-lg">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-dourado-700 dark:text-dourado-300">Próxima escala</p>
            <h2 id="modal-proxima-escala-titulo" className="mt-1 text-xl font-bold text-gray-950 dark:text-white">
              {escala?.titulo || 'Sua próxima participação'}
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
                <InfoLinha icon={CalendarDays} label="Data e horário" value={formatarData(escala.dataHora)} />
                <InfoLinha icon={UsersRound} label="Função/equipe" value={escala.equipe?.nome || 'Equipe não informada'} />
                <InfoLinha icon={escala.local ? MapPin : CalendarCheck2} label={escala.local ? 'Local' : 'Tipo'} value={escala.local || (escala.tipo === 'RECORRENTE' ? 'Evento recorrente' : 'Evento especial')} />
              </div>

              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-950">
                <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Seu status</p>
                <span className={`mt-2 inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-bold ${config.className}`}>
                  <StatusIcon size={13} />
                  {config.label}
                </span>
              </div>

              {escala.descricao && (
                <div>
                  <h3 className="text-sm font-bold text-gray-950 dark:text-white">Descrição</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-gray-300">{escala.descricao}</p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-gray-950 dark:text-white">Pessoas escaladas</h3>
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{escala.voluntarios?.length || 0}</span>
                </div>
                <div className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-950">
                  {(escala.voluntarios || []).map((item) => (
                    <VoluntarioEscalado key={item.id} item={item} destaque={item.id === participacao?.id} />
                  ))}
                </div>
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

  return (
    <div className={`flex items-center justify-between gap-3 px-3 py-3 ${destaque ? 'bg-dourado-50 dark:bg-dourado-950/20' : ''}`}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-gray-200 bg-gray-100 text-sm font-bold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-white">
          {item.usuario?.urlFoto ? <img src={item.usuario.urlFoto} alt="" className="h-full w-full object-cover" /> : item.usuario?.nomeCompleto?.slice(0, 1) || '?'}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{item.usuario?.nomeCompleto || 'Voluntário'}</p>
          {item.usuario?.telefone && <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{formatarTelefoneExibicao(item.usuario.telefone)}</p>}
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

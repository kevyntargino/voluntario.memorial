import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCcw,
  Repeat2,
  Search,
  UserRoundCheck,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import { Footer } from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { buildApiUrl } from '../lib/api';

const filtros = [
  { value: 'TODAS', label: 'Todas' },
  { value: 'PENDENTE', label: 'Pendentes' },
  { value: 'CONFIRMADA', label: 'Confirmadas' },
  { value: 'PEDIU_SUBSTITUICAO', label: 'Substituição' },
];

const statusConfig = {
  PENDENTE: {
    label: 'Pendente',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    icon: Clock3,
  },
  CONFIRMADA: {
    label: 'Confirmada',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: CheckCircle2,
  },
  PEDIU_SUBSTITUICAO: {
    label: 'Pediu substituição',
    className: 'border-sky-200 bg-sky-50 text-sky-700',
    icon: RefreshCcw,
  },
};

const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function formatarData(dataHora) {
  if (!dataHora) {
    return 'Data a combinar';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(dataHora));
}

function formatarRecorrencia(escala) {
  if (escala.tipo === 'RECORRENTE' && escala.diaSemana !== null && escala.diaSemana !== undefined) {
    return `Toda ${diasSemana[escala.diaSemana] || 'semana'}`;
  }

  return escala.tipo === 'RECORRENTE' ? 'Recorrente' : 'Esporádica';
}

export default function Escalas() {
  const { token, logout } = useAuth();
  const { navigate } = useNavigation();
  const [escalas, setEscalas] = useState([]);
  const [filtro, setFiltro] = useState('TODAS');
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [atualizandoId, setAtualizandoId] = useState(null);

  const carregarEscalas = useCallback(async () => {
    setErro('');
    setCarregando(true);

    try {
      const resposta = await fetch(buildApiUrl('/api/escalas/minhas'), {
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

        throw new Error(dados.erro || 'Não foi possível carregar suas escalas.');
      }

      setEscalas(dados.escalas || []);
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar suas escalas.');
    } finally {
      setCarregando(false);
    }
  }, [logout, navigate, token]);

  useEffect(() => {
    carregarEscalas();
  }, [carregarEscalas]);

  const atualizarStatus = async (id, status) => {
    setErro('');
    setAtualizandoId(id);

    try {
      const resposta = await fetch(buildApiUrl(`/api/escalas/${id}/status`), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        if (resposta.status === 401) {
          logout();
          navigate('/login', { replace: true });
          return;
        }

        throw new Error(dados.erro || 'Não foi possível atualizar esta escala.');
      }

      setEscalas((atuais) => atuais.map((item) => (item.id === id ? dados.escala : item)));
    } catch (error) {
      setErro(error.message || 'Não foi possível atualizar esta escala.');
    } finally {
      setAtualizandoId(null);
    }
  };

  const escalasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return escalas.filter((item) => {
      const passaStatus = filtro === 'TODAS' || item.status === filtro;
      const texto = [
        item.escala?.titulo,
        item.escala?.equipe?.nome,
        item.status,
      ].filter(Boolean).join(' ').toLowerCase();

      return passaStatus && (!termo || texto.includes(termo));
    });
  }, [busca, escalas, filtro]);

  const contadores = useMemo(() => ({
    total: escalas.length,
    pendentes: escalas.filter((item) => item.status === 'PENDENTE').length,
    confirmadas: escalas.filter((item) => item.status === 'CONFIRMADA').length,
    substituicoes: escalas.filter((item) => item.status === 'PEDIU_SUBSTITUICAO').length,
  }), [escalas]);

  return (
    <div className="min-h-screen bg-[#f7f4ed] text-gray-900">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm md:col-span-2">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-dourado-700">Escalas</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-950">Minhas escalas</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Acompanhe seus compromissos, confirme presença e sinalize quando precisar de substituição.
            </p>
          </div>

          <ResumoCard icon={CalendarClock} label="Total" value={contadores.total} />
          <ResumoCard icon={Clock3} label="Pendentes" value={contadores.pendentes} />
        </section>

        <section className="mt-6 rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-gray-100 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                className="block w-full rounded-md border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                placeholder="Buscar por equipe ou título"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {filtros.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFiltro(item.value)}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                    filtro === item.value
                      ? 'bg-gray-950 text-white'
                      : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {erro && (
            <div className="mx-4 mt-4 flex items-center gap-2 rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              <AlertCircle size={16} />
              {erro}
            </div>
          )}

          {carregando ? (
            <div className="flex items-center gap-3 px-6 py-12 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando escalas...
            </div>
          ) : escalasFiltradas.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <CalendarCheck2 className="mx-auto h-10 w-10 text-gray-300" />
              <h2 className="mt-4 text-lg font-bold text-gray-950">Nenhuma escala encontrada</h2>
              <p className="mt-2 text-sm text-gray-500">
                Quando uma liderança atribuir você a uma escala, ela aparecerá aqui.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {escalasFiltradas.map((item) => (
                <EscalaItem
                  key={item.id}
                  item={item}
                  atualizando={atualizandoId === item.id}
                  onAtualizarStatus={atualizarStatus}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}

function ResumoCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-500">{label}</p>
        <Icon className="h-5 w-5 text-dourado-600" />
      </div>
      <p className="mt-3 text-3xl font-bold text-gray-950">{value}</p>
    </div>
  );
}

function EscalaItem({ item, atualizando, onAtualizarStatus }) {
  const config = statusConfig[item.status] || statusConfig.PENDENTE;
  const StatusIcon = config.icon;
  const escala = item.escala || {};

  return (
    <article className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold ${config.className}`}>
            <StatusIcon size={13} />
            {config.label}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600">
            <Repeat2 size={13} />
            {formatarRecorrencia(escala)}
          </span>
        </div>

        <h2 className="mt-3 text-lg font-bold text-gray-950">
          {escala.titulo || 'Escala sem título'}
        </h2>

        <div className="mt-3 grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
          <p className="flex items-center gap-2">
            <CalendarClock size={16} className="text-gray-400" />
            {formatarData(escala.dataHora)}
          </p>
          <p className="flex items-center gap-2">
            <UserRoundCheck size={16} className="text-gray-400" />
            {escala.equipe?.nome || 'Equipe não informada'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 lg:justify-end">
        <button
          type="button"
          disabled={atualizando || item.status === 'CONFIRMADA'}
          onClick={() => onAtualizarStatus(item.id, 'CONFIRMADA')}
          className="inline-flex items-center gap-2 rounded-md bg-gray-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {atualizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 size={16} />}
          Confirmar
        </button>
        <button
          type="button"
          disabled={atualizando || item.status === 'PEDIU_SUBSTITUICAO'}
          onClick={() => onAtualizarStatus(item.id, 'PEDIU_SUBSTITUICAO')}
          className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCcw size={16} />
          Pedir substituição
        </button>
      </div>
    </article>
  );
}

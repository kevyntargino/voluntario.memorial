import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCcw,
  Search,
  UsersRound,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import { Footer } from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { buildApiUrl } from '../lib/api';

const areas = ['Midia', 'Iluminação', 'Filmagem', 'Fotografia', 'DTV', 'Direção', 'Redes Sociais'];
const semanas = [1, 2, 3, 4];
const dias = [
  { value: 0, label: 'Domingo' },
  { value: 6, label: 'Sábado' },
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
    label: 'Substituição',
    className: 'border-sky-200 bg-sky-50 text-sky-700',
    icon: RefreshCcw,
  },
  AUSENTE: {
    label: 'Ausente',
    className: 'border-red-200 bg-red-50 text-red-700',
    icon: AlertCircle,
  },
};

function getData(escala) {
  return escala.dataHora ? new Date(escala.dataHora) : null;
}

function getDiaSemana(escala) {
  const data = getData(escala);
  return data ? data.getDay() : escala.diaSemana;
}

function getSemanaDoMes(escala) {
  const data = getData(escala);

  if (!data) {
    return null;
  }

  return Math.ceil(data.getDate() / 7);
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
  }).format(new Date(dataHora));
}

function formatarDataCompleta(dataHora) {
  if (!dataHora) {
    return 'Data a confirmar';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(dataHora));
}

function normalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export default function Escalas() {
  const { token, logout } = useAuth();
  const { navigate } = useNavigation();
  const [visao, setVisao] = useState('todas');
  const [diaSelecionado, setDiaSelecionado] = useState(0);
  const [semanaSelecionada, setSemanaSelecionada] = useState(1);
  const [busca, setBusca] = useState('');
  const [escalas, setEscalas] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [atualizandoId, setAtualizandoId] = useState(null);
  const [substituicaoAbertaId, setSubstituicaoAbertaId] = useState(null);
  const [justificativa, setJustificativa] = useState('');

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
      const texto = normalizar([
        escala.titulo,
        escala.local,
        escala.descricao,
        escala.equipe?.nome,
        escala.voluntarios?.map((item) => item.usuario?.nomeCompleto).join(' '),
      ].join(' '));

      return (isEsporadicaMinha || (mesmaSemana && mesmoDia)) && (!termo || texto.includes(termo));
    });
  }, [busca, diaSelecionado, escalas, semanaSelecionada, visao]);

  const escalasPorArea = useMemo(() => {
    const mapa = new Map(areas.map((area) => [area, []]));

    for (const escala of escalasVisiveis) {
      const area = escala.equipe?.nome || 'Outras';
      mapa.set(area, [...(mapa.get(area) || []), escala]);
    }

    return Array.from(mapa.entries()).map(([area, itens]) => ({ area, itens }));
  }, [escalasVisiveis]);

  const totalVoluntarios = escalasVisiveis.reduce((total, escala) => total + (escala.voluntarios?.length || 0), 0);

  return (
    <div className="min-h-screen bg-[#f7f4ed] text-gray-900">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-dourado-700">Escalas MCom</p>
              <h1 className="mt-2 text-3xl font-bold text-gray-950">Escalas por área</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                Veja os voluntários escalados para cada área nos sábados e domingos do 1º ao 4º fim de semana.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Resumo label="Escalas visíveis" value={escalasVisiveis.length} icon={CalendarDays} />
              <Resumo label="Voluntários" value={totalVoluntarios} icon={UsersRound} />
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid gap-4 xl:grid-cols-[auto_auto_1fr] xl:items-center">
            <Segmento
              label="Visão"
              options={[
                { value: 'todas', label: 'Todas as escalas' },
                { value: 'minhas', label: 'Somente minhas' },
              ]}
              value={visao}
              onChange={setVisao}
            />

            <Segmento
              label="Dia"
              options={dias}
              value={diaSelecionado}
              onChange={setDiaSelecionado}
            />

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                className="block w-full rounded-md border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                placeholder="Buscar por área, título ou voluntário"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {semanas.map((semana) => (
              <button
                key={semana}
                type="button"
                onClick={() => setSemanaSelecionada(semana)}
                className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                  semanaSelecionada === semana
                    ? 'bg-gray-950 text-white'
                    : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                {semana}º fim de semana
              </button>
            ))}
          </div>
        </section>

        {erro && (
          <div className="mt-5 flex items-center gap-2 rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            <AlertCircle size={16} />
            {erro}
          </div>
        )}

        {carregando ? (
          <div className="mt-5 flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-6 py-12 text-gray-500 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando escalas...
          </div>
        ) : (
          <TabelaEscalas
            escalasPorArea={escalasPorArea}
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

      <Footer />
    </div>
  );
}

function Resumo({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-500">
        <Icon className="h-4 w-4 text-dourado-600" />
        {label}
      </div>
      <p className="mt-1 text-2xl font-bold text-gray-950">{value}</p>
    </div>
  );
}

function Segmento({ label, options, value, onChange }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">{label}</p>
      <div className="flex rounded-md border border-gray-200 bg-gray-50 p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded px-3 py-2 text-sm font-semibold transition ${
              value === option.value ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TabelaEscalas({
  escalasPorArea,
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
    <section className="mt-5 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="grid grid-cols-[minmax(160px,0.8fr)_minmax(220px,1.2fr)] border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
        <span>Função</span>
        <span>Voluntários</span>
      </div>

      <div className="divide-y divide-gray-100">
        {linhas.map(({ area, escala }) => (
          <EscalaLinha
            key={escala?.id || area}
            area={area}
            escala={escala}
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
    <div className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(160px,0.8fr)_minmax(220px,1.2fr)]">
      <div>
        <p className="text-base font-bold text-gray-950">{area}</p>
        {escala ? (
          <>
            <p className="mt-1 text-sm font-semibold text-gray-500">{formatarHorario(escala.dataHora)}</p>
            <p className="mt-1 text-sm text-gray-600">{escala.titulo || 'Escala sem título'}</p>
            {escala.tipo === 'ESPORADICA' && (
              <span className="mt-2 inline-flex rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-700">
                Esporádica
              </span>
            )}
            {escala.tipo === 'ESPORADICA' && (
              <p className="mt-2 text-xs font-semibold text-gray-600">{formatarDataCompleta(escala.dataHora)}</p>
            )}
            {escala.local && <p className="mt-1 text-xs text-gray-500">Local: {escala.local}</p>}
            {escala.descricao && <p className="mt-2 max-w-sm text-xs leading-5 text-gray-600">{escala.descricao}</p>}
          </>
        ) : (
          <p className="mt-1 text-sm text-gray-500">Nenhuma escala neste período.</p>
        )}
      </div>

      {escala ? (
        <div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {(escala.voluntarios || []).map((item) => {
                const config = statusConfig[item.status] || statusConfig.PENDENTE;
                const Icon = config.icon;

                return (
                  <div key={item.id} className="flex min-w-48 items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-white text-sm font-bold text-gray-700">
                      {item.usuario?.nomeCompleto?.slice(0, 1) || '?'}
                    </span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                        <p className="truncate text-sm font-semibold text-gray-800">{item.usuario?.nomeCompleto || 'Voluntário'}</p>
                        {item.usuario?.telefone && (
                          <span className="text-[11px] font-medium text-gray-400">{item.usuario.telefone}</span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <p className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${config.className}`}>
                          <Icon size={11} />
                          {config.label}
                        </p>
                        {item.substituto && (
                          <span className="inline-flex rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700">
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
              <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                <button
                  type="button"
                  disabled={atualizandoId === participacao.id || ['CONFIRMADA', 'AUSENTE'].includes(participacao.status)}
                  onClick={() => onAtualizarStatus(participacao.id, 'CONFIRMADA')}
                  className="inline-flex items-center gap-2 rounded-md bg-gray-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {atualizandoId === participacao.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 size={16} />}
                  Confirmar
                </button>
                <button
                  type="button"
                  disabled={atualizandoId === participacao.id || ['PEDIU_SUBSTITUICAO', 'AUSENTE'].includes(participacao.status)}
                  onClick={() => onAbrirSubstituicao(participacao.id)}
                  className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCcw size={16} />
                  Substituição
                </button>
              </div>
            )}
          </div>

          {justificando && (
            <div className="mt-4 rounded-md border border-sky-100 bg-sky-50 p-3">
              <label className="block text-sm font-semibold text-sky-800">
                Justificativa da substituição
                <textarea
                  value={justificativa}
                  onChange={(event) => onChangeJustificativa(event.target.value)}
                  rows={3}
                  className="mt-2 block w-full rounded-md border border-sky-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10"
                  placeholder="Explique rapidamente por que precisa de substituição."
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={atualizandoId === participacao.id}
                  onClick={() => onAtualizarStatus(participacao.id, 'PEDIU_SUBSTITUICAO', justificativa, escala.dataHora)}
                  className="inline-flex items-center gap-2 rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:opacity-60"
                >
                  {atualizandoId === participacao.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw size={16} />}
                  Enviar solicitação
                </button>
                <button type="button" onClick={onCancelarSubstituicao} className="rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-700">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-gray-500">Sem voluntários escalados.</div>
      )}
    </div>
  );
}

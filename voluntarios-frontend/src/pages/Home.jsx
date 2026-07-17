import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bell, CalendarDays, ClipboardList, LogOut } from 'lucide-react';
import Navbar from '../components/Navbar';
import { Footer } from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { buildApiUrl } from '../lib/api';
import { getAgoraEscalas } from '../lib/escalas';
import logo from '../assets/ico.png';

function estaNosProximos7Dias(dataHora) {
  if (!dataHora) return false;

  const dataEscala = new Date(dataHora);
  if (Number.isNaN(dataEscala.getTime())) return false;

  const agora = getAgoraEscalas();
  const fimJanela = new Date(agora.getTime() + 7 * 86400000);

  return dataEscala >= agora && dataEscala <= fimJanela;
}

export default function Home() {
  const { token, usuario, logout } = useAuth();
  const { navigate } = useNavigation();
  const [totalAvisos, setTotalAvisos] = useState(null);
  const [totalConfirmacoesPendentes, setTotalConfirmacoesPendentes] = useState(null);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const carregarResumoAvisos = useCallback(async () => {
    try {
      const resposta = await fetch(buildApiUrl('/api/avisos'), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        if (resposta.status === 401) {
          logout();
          navigate('/login', { replace: true });
        }

        return;
      }

      setTotalAvisos(dados.totalNaoVisualizados ?? (dados.avisos || []).length);
    } catch {
      setTotalAvisos(null);
    }
  }, [logout, navigate, token]);

  const carregarResumoEscalas = useCallback(async () => {
    try {
      const resposta = await fetch(buildApiUrl('/api/escalas?visao=minhas'), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        if (resposta.status === 401) {
          logout();
          navigate('/login', { replace: true });
        }

        return;
      }

      const pendentes = (dados.escalas || []).filter((escala) => (
        escala.minhaParticipacao?.status === 'PENDENTE'
        && estaNosProximos7Dias(escala.dataHora)
      ));
      setTotalConfirmacoesPendentes(pendentes.length);
    } catch {
      setTotalConfirmacoesPendentes(null);
    }
  }, [logout, navigate, token]);

  useEffect(() => {
    carregarResumoAvisos();
    carregarResumoEscalas();
  }, [carregarResumoAvisos, carregarResumoEscalas]);

  const cards = useMemo(() => ([
    {
      title: 'Próximas escalas',
      value: '3',
      description: 'Você tem compromissos confirmados para esta semana.',
      icon: CalendarDays,
      action: 'Ver escalas',
      path: '/escalas',
    },
    {
      title: 'Avisos não visualizados',
      value: totalAvisos === null ? '-' : String(totalAvisos),
      description: totalAvisos === 0
        ? 'Você já visualizou todos os avisos disponíveis.'
        : 'Há comunicados aguardando sua leitura.',
      icon: Bell,
      action: 'Ver avisos',
      path: '/avisos',
    },
    {
      title: 'Confirmações pendentes',
      value: totalConfirmacoesPendentes === null ? '-' : String(totalConfirmacoesPendentes),
      description: totalConfirmacoesPendentes === 0
        ? 'Você não tem escalas aguardando confirmação.'
        : totalConfirmacoesPendentes === 1
        ? 'Há uma escala aguardando sua confirmação.'
        : `Há ${totalConfirmacoesPendentes} escalas aguardando sua confirmação.`,
      icon: ClipboardList,
      action: 'Ver confirmações',
      path: '/escalas?filtro=confirmacoes',
    },
  ]), [totalAvisos, totalConfirmacoesPendentes]);

  return (
    <div className="app-page">
      <Navbar />

      <main className="app-main">
        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="grid gap-8 px-5 py-6 sm:px-7 lg:grid-cols-[1.4fr_0.8fr] lg:px-9 lg:py-9">
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-dourado-700 dark:text-dourado-300">
                <img src={logo} alt="MCom" className="mr-2 h-5 w-5 object-contain" />
                Portal do voluntário
              </span>

              <h1 className="mt-4 max-w-2xl text-2xl font-bold text-gray-950 dark:text-white sm:text-3xl">
                Bem-vindo, {usuario?.nomeCompleto || 'voluntário'}.
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300 sm:text-base">
                Aqui está um panorama rápido da sua conta. Use este espaço como ponto de partida para ver escalas, avisos e tarefas importantes.
              </p>

            </div>

            <aside className="rounded-lg border border-gray-800 bg-gray-950 p-5 text-white dark:bg-gray-950">
              <p className="text-xs font-semibold uppercase text-gray-400">
                Sessão ativa
              </p>
              <div className="mt-6 space-y-5">
                <div>
                  <p className="text-sm text-white/60">Usuário autenticado</p>
                  <p className="mt-1 text-lg font-semibold">{usuario?.email || '-'}</p>
                </div>

                <div>
                  <p className="text-sm text-white/60">Permissões</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(usuario?.permissoes || ['VOLUNTARIO']).map((permissao) => (
                      <span key={permissao} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white/90">
                        {permissao.replaceAll('_', ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <button onClick={handleLogout} className="mt-6 inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
                <LogOut size={16} />
                Sair da sessão
              </button>
            </aside>
          </div>
        </section>

        <section className="mt-5 grid gap-3 md:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;

            return (
              <article key={card.title} className="flex min-h-[190px] flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{card.title}</p>
                  <span className="grid h-8 w-8 place-items-center rounded-md bg-dourado-50 text-dourado-700 dark:bg-gray-800 dark:text-dourado-300"><Icon className="h-4 w-4" /></span>
                </div>
                <p className="mt-3 text-3xl font-bold text-gray-950 dark:text-white">{card.value}</p>
                <p className="mt-2 flex-1 text-sm leading-5 text-gray-600 dark:text-gray-300">{card.description}</p>
                <button onClick={() => navigate(card.path)} className="mt-4 inline-flex items-center gap-1.5 self-start text-sm font-semibold text-dourado-700 transition hover:text-dourado-900 dark:text-dourado-300">
                  {card.action}
                  <ArrowRight size={15} />
                </button>
              </article>
            );
          })}
        </section>
      </main>

      <Footer />
    </div>
  );
}

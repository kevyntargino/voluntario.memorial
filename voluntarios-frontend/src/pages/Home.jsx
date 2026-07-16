import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CalendarDays, ClipboardList, LogOut } from 'lucide-react';
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
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.08),_transparent_34%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] text-gray-900">
      <Navbar />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white/80 shadow-[0_30px_100px_rgba(17,24,39,0.12)] backdrop-blur">
          <div className="grid gap-10 px-6 py-8 lg:grid-cols-[1.3fr_0.9fr] lg:px-10 lg:py-12">
            <div>
              <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-gray-700">
                <img src={logo} alt="MCom" className="mr-2 h-5 w-5 object-contain" />
                Portal do voluntário
              </span>

              <h1 className="mt-5 max-w-2xl text-4xl font-bold tracking-tight text-gray-950 sm:text-5xl">
                Bem-vindo, {usuario?.nomeCompleto || 'voluntário'}.
              </h1>

              <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600 sm:text-lg">
                Aqui está um panorama rápido da sua conta. Use este espaço como ponto de partida para ver escalas, avisos e tarefas importantes.
              </p>

            </div>

            <aside className="rounded-[1.75rem] border border-gray-200/70 bg-gradient-to-br from-gray-950 to-gray-800 p-6 text-white shadow-2xl shadow-gray-950/20">
              <p className="text-sm font-medium uppercase tracking-[0.25em] text-gray-300">
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

              <button onClick={handleLogout} className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15">
                <LogOut size={16} />
                Sair da sessão
              </button>
            </aside>
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;

            return (
              <article key={card.title} className="rounded-[1.5rem] border border-white/60 bg-white/90 p-6 shadow-lg shadow-gray-900/5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">{card.title}</p>
                  <Icon className="h-5 w-5 text-gray-500" />
                </div>
                <p className="mt-4 text-4xl font-bold text-gray-950">{card.value}</p>
                <p className="mt-3 text-sm leading-6 text-gray-600">{card.description}</p>
                <button onClick={() => navigate(card.path)} className="mt-5 text-sm font-semibold text-gray-700 transition hover:text-gray-950">
                  {card.action}
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

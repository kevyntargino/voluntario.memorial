import React from 'react';
import { Bell, CalendarDays, ClipboardList, LogOut, ShieldCheck, UserCircle2 } from 'lucide-react';
import Navbar from '../components/Navbar';
import { Footer } from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';

const cards = [
  {
    title: 'Próximas escalas',
    value: '3',
    description: 'Você tem compromissos confirmados para esta semana.',
    icon: CalendarDays,
  },
  {
    title: 'Avisos recentes',
    value: '2',
    description: 'Confira as mensagens da sua equipe antes do próximo culto.',
    icon: Bell,
  },
  {
    title: 'Tarefas pendentes',
    value: '1',
    description: 'Há uma confirmação aguardando sua resposta.',
    icon: ClipboardList,
  },
];

export default function Home() {
  const { usuario, logout } = useAuth();
  const { navigate } = useNavigation();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(212,175,55,0.12),_transparent_34%),linear-gradient(180deg,#faf7f0_0%,#f5efe1_100%)] text-gray-900">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white/80 shadow-[0_30px_100px_rgba(17,24,39,0.12)] backdrop-blur">
          <div className="grid gap-10 px-6 py-8 lg:grid-cols-[1.3fr_0.9fr] lg:px-10 lg:py-12">
            <div>
              <span className="inline-flex items-center rounded-full border border-dourado-200 bg-dourado-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-dourado-700">
                Portal do voluntário
              </span>

              <h1 className="mt-5 max-w-2xl text-4xl font-bold tracking-tight text-gray-950 sm:text-5xl">
                Bem-vindo, {usuario?.nomeCompleto || 'voluntário'}.
              </h1>

              <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600 sm:text-lg">
                Aqui está um panorama rápido da sua conta. Use este espaço como ponto de partida para ver escalas, avisos e tarefas importantes.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <button onClick={() => navigate('/perfil')} className="inline-flex items-center gap-2 rounded-full bg-gray-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800">
                  <ShieldCheck size={16} />
                  Ver meu perfil
                </button>
                <button onClick={() => navigate('/perfil')} className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50">
                  <UserCircle2 size={16} />
                  Atualizar dados
                </button>
              </div>
            </div>

            <aside className="rounded-[1.75rem] border border-gray-200/70 bg-gradient-to-br from-gray-950 to-gray-800 p-6 text-white shadow-2xl shadow-gray-950/20">
              <p className="text-sm font-medium uppercase tracking-[0.25em] text-dourado-200">
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
                  <Icon className="h-5 w-5 text-dourado-600" />
                </div>
                <p className="mt-4 text-4xl font-bold text-gray-950">{card.value}</p>
                <p className="mt-3 text-sm leading-6 text-gray-600">{card.description}</p>
                {card.title === 'Próximas escalas' && (
                  <button onClick={() => navigate('/escalas')} className="mt-5 text-sm font-semibold text-dourado-700 transition hover:text-dourado-800">
                    Ver escalas
                  </button>
                )}
              </article>
            );
          })}
        </section>
      </main>

      <Footer />
    </div>
  );
}

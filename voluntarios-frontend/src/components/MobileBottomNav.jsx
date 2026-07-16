import React from 'react';
import { Bell, BookOpen, CalendarDays, Home, ShieldCheck, UsersRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';

export function MobileBottomNav() {
  const { usuario } = useAuth();
  const { pathname, navigate } = useNavigation();
  const podeGerenciarEquipe = usuario?.permissoes?.some((permissao) => ['LIDER_EQUIPE', 'ADMINISTRADOR'].includes(permissao));
  const isAdmin = usuario?.permissoes?.includes('ADMINISTRADOR');
  const itens = [
    { label: 'Início', path: '/', icon: Home },
    { label: 'Escalas', path: '/escalas', icon: CalendarDays },
    { label: 'Avisos', path: '/avisos', icon: Bell },
    ...(podeGerenciarEquipe ? [{ label: 'Equipe', path: '/minha-equipe', icon: UsersRound }] : []),
    ...(isAdmin ? [{ label: 'Admin', path: '/admin', icon: ShieldCheck }] : [{ label: 'Manuais', path: '/manuais', icon: BookOpen }]),
  ];
  return (
    <>
      <div className="h-24 md:hidden" aria-hidden="true" />
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-2 pb-[calc(0.55rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_50px_rgba(15,23,42,0.12)] backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {itens.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const ativo = item.path === '/' ? pathname === '/' : pathname.startsWith(item.path);

            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-bold transition ${
                  ativo
                    ? 'bg-gray-950 text-white shadow-lg shadow-gray-950/15 dark:bg-white dark:text-gray-950'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-950 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white'
                }`}
              >
                <Icon size={18} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}

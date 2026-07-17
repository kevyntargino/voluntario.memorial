import React from 'react';
import { BookOpen, CalendarDays, Home, ShieldCheck, UsersRound } from 'lucide-react';
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
    ...(podeGerenciarEquipe ? [{ label: 'Equipe', path: '/minha-equipe', icon: UsersRound }] : []),
    { label: 'Manuais', path: '/manuais', icon: BookOpen },
    ...(isAdmin ? [{ label: 'Admin', path: '/admin', icon: ShieldCheck }] : []),
  ];
  return (
    <>
      <div className="h-[calc(4.5rem+env(safe-area-inset-bottom))] md:hidden" aria-hidden="true" />
      <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_12px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/95 md:hidden">
        <div className={`mx-auto grid h-[4.5rem] max-w-md ${itens.length >= 5 ? 'grid-cols-5' : itens.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {itens.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const ativo = item.path === '/' ? pathname === '/' : pathname.startsWith(item.path);

            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                aria-current={ativo ? 'page' : undefined}
                className={`relative flex min-w-0 flex-col items-center justify-center gap-1 px-2 py-2 text-[11px] font-semibold transition-colors ${
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
          })}
        </div>
      </nav>
    </>
  );
}

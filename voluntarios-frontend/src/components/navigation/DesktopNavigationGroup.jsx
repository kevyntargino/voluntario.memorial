import React from 'react';
import { ChevronDown } from 'lucide-react';

export function DesktopNavigationGroup({ grupo, pathname, aberto, onToggle, onNavigate }) {
  const Icon = grupo.icon;
  const ativo = pathname === grupo.path || pathname.startsWith(`${grupo.path}/`);

  const alternarGrupo = () => {
    onToggle();
    onNavigate(grupo.path);
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={alternarGrupo}
        aria-expanded={aberto}
        aria-controls={`submenu-${grupo.id}`}
        className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors ${
          ativo
            ? 'bg-dourado-50 text-dourado-800 dark:bg-gray-800 dark:text-dourado-200'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-white'
        }`}
      >
        <Icon size={19} strokeWidth={ativo ? 2.4 : 1.9} />
        <span>{grupo.label}</span>
        <ChevronDown size={16} className={`ml-auto transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>

      {aberto && (
        <div id={`submenu-${grupo.id}`} className="ml-5 space-y-1 border-l border-gray-200 pl-3 dark:border-gray-700">
          {grupo.itens.map((item) => {
            const ItemIcon = item.icon;
            const itemAtivo = pathname === item.path;

            return (
              <button
                key={item.path}
                type="button"
                onClick={() => onNavigate(item.path)}
                aria-current={itemAtivo ? 'page' : undefined}
                className={`flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-semibold transition-colors ${
                  itemAtivo
                    ? 'bg-gray-100 text-gray-950 dark:bg-gray-800 dark:text-white'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white'
                }`}
              >
                <ItemIcon size={15} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

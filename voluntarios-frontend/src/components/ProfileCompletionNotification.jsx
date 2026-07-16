import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, UserRoundCheck, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { getCamposCadastroPendentes } from '../lib/perfil';

export function ProfileCompletionNotification() {
  const { usuario } = useAuth();
  const { pathname, navigate } = useNavigation();
  const pendencias = useMemo(() => getCamposCadastroPendentes(usuario), [usuario]);
  const assinatura = pendencias.map(({ campo }) => campo).join(':');
  const [dispensada, setDispensada] = useState(false);

  useEffect(() => {
    setDispensada(false);
  }, [assinatura]);

  if (pathname === '/perfil' || pendencias.length === 0 || dispensada) {
    return null;
  }

  const resumo = pendencias.map(({ label }) => label).join(', ');

  return (
    <aside className="fixed inset-x-3 top-[4.75rem] z-40 mx-auto max-w-lg overflow-hidden rounded-lg border border-amber-200 bg-white shadow-xl shadow-gray-950/15 dark:border-amber-900/70 dark:bg-gray-900 dark:shadow-black/40 sm:left-auto sm:right-5 sm:top-20 sm:mx-0 sm:w-[min(28rem,calc(100vw-2.5rem))]">
      <div className="flex items-start gap-3 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <UserRoundCheck size={20} />
        </span>
        <button
          type="button"
          onClick={() => navigate('/perfil?completar=1')}
          className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white"
        >
          <span className="block text-sm font-bold text-gray-950 dark:text-white">Complete seu cadastro</span>
          <span className="mt-1 block text-xs leading-5 text-gray-600 dark:text-gray-300">
            {pendencias.length === 1 ? 'Falta preencher' : 'Faltam preencher'}: {resumo}.
          </span>
          <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-gray-900 dark:text-gray-100">
            Preencher agora <ArrowRight size={14} />
          </span>
        </button>
        <button
          type="button"
          onClick={() => setDispensada(true)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-white"
          aria-label="Fechar aviso de cadastro incompleto"
          title="Fechar"
        >
          <X size={17} />
        </button>
      </div>
    </aside>
  );
}

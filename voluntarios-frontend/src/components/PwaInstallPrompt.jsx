import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import logo from '../assets/ico.png';

const INSTALL_DISMISSED_KEY = 'mcom_install_prompt_dismissed';

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();

      if (isStandalone() || window.localStorage.getItem(INSTALL_DISMISSED_KEY) === 'true') {
        return;
      }

      setInstallEvent(event);
      setVisivel(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  if (!visivel || !installEvent) {
    return null;
  }

  const instalar = async () => {
    installEvent.prompt();
    await installEvent.userChoice.catch(() => null);
    setVisivel(false);
    setInstallEvent(null);
  };

  const dispensar = () => {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, 'true');
    setVisivel(false);
  };

  return (
    <div className="fixed inset-x-3 bottom-24 z-50 rounded-3xl border border-gray-200 bg-white p-4 shadow-2xl shadow-gray-950/20 md:bottom-5 md:left-auto md:right-5 md:max-w-sm">
      <div className="flex items-start gap-3">
        <img src={logo} alt="MCom" className="h-12 w-12 shrink-0 rounded-2xl object-contain" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-950">Adicionar MCom à tela inicial?</p>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            Instale o app para abrir mais rápido, em tela cheia e com experiência mobile otimizada.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={instalar}
              className="inline-flex items-center gap-2 rounded-full bg-gray-950 px-3 py-2 text-xs font-bold text-white transition hover:bg-gray-800"
            >
              <Download size={14} />
              Adicionar
            </button>
            <button
              type="button"
              onClick={dispensar}
              className="rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 transition hover:bg-gray-50"
            >
              Agora não
            </button>
          </div>
        </div>
        <button type="button" onClick={dispensar} className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700" aria-label="Fechar instalação">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import logo from '../assets/ico.png';

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isMobileApple() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [visivel, setVisivel] = useState(false);
  const [iosFallback, setIosFallback] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();

      if (isStandalone()) {
        return;
      }

      setInstallEvent(event);
      setVisivel(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    const timeout = window.setTimeout(() => {
      if (!isStandalone() && isMobileApple()) {
        setIosFallback(true);
      }
    }, 1500);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.clearTimeout(timeout);
    };
  }, []);

  if (!installEvent && !iosFallback) {
    return null;
  }

  const instalar = async () => {
    if (!installEvent) {
      setVisivel(true);
      return;
    }

    installEvent.prompt();
    await installEvent.userChoice.catch(() => null);
    setVisivel(false);
    setInstallEvent(null);
  };

  const dispensar = () => {
    setVisivel(false);
  };

  if (!visivel) {
    return (
      <button
        type="button"
        onClick={() => setVisivel(true)}
        className="fixed bottom-24 right-4 z-50 grid h-14 w-14 place-items-center rounded-2xl border border-gray-200 bg-gray-950 text-white shadow-2xl shadow-gray-950/25 transition hover:scale-105 md:hidden"
        aria-label="Instalar MCom"
        title="Instalar MCom"
      >
        <Download size={22} />
      </button>
    );
  }

  return (
    <div className="fixed inset-x-3 bottom-24 z-50 rounded-3xl border border-gray-200 bg-white p-4 shadow-2xl shadow-gray-950/20 md:bottom-5 md:left-auto md:right-5 md:max-w-sm">
      <div className="flex items-start gap-3">
        <img src={logo} alt="MCom" className="h-12 w-12 shrink-0 rounded-2xl object-contain" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-950">Adicionar MCom à tela inicial?</p>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            {installEvent
              ? 'Instale o app para abrir mais rápido, em tela cheia e com experiência mobile otimizada.'
              : 'No iPhone, toque em Compartilhar no Safari e escolha “Adicionar à Tela de Início”.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={instalar}
              disabled={!installEvent}
              className="inline-flex items-center gap-2 rounded-full bg-gray-950 px-3 py-2 text-xs font-bold text-white transition hover:bg-gray-800"
            >
              <Download size={14} />
              {installEvent ? 'Adicionar' : 'Usar botão compartilhar'}
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

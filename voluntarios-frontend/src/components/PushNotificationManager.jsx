import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, Loader2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { buildApiUrl } from '../lib/api';
import { urlBase64ParaUint8Array } from '../lib/pwa';

const PUSH_DISMISSED_KEY = 'mcom_push_prompt_dismissed';

function pushSuportado() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function PushNotificationManager() {
  const { token } = useAuth();
  const [visivel, setVisivel] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const ativarPush = useCallback(async (mostrarFeedback = true) => {
    setErro('');
    setCarregando(true);

    try {
      const permissao = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();

      if (permissao !== 'granted') {
        window.localStorage.setItem(PUSH_DISMISSED_KEY, 'true');
        setVisivel(false);
        return;
      }

      const respostaChave = await fetch(buildApiUrl('/api/notificacoes/push/public-key'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dadosChave = await respostaChave.json();

      if (!respostaChave.ok || !dadosChave.habilitado || !dadosChave.publicKey) {
        throw new Error('As notificações push ainda não estão configuradas no servidor.');
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ParaUint8Array(dadosChave.publicKey),
        });
      }

      const resposta = await fetch(buildApiUrl('/api/notificacoes/push/subscribe'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subscription }),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(dados.erro || 'Não foi possível ativar as notificações push.');
      }

      if (mostrarFeedback) {
        setVisivel(false);
      }
    } catch (error) {
      setErro(error.message || 'Não foi possível ativar as notificações.');
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token || !pushSuportado() || Notification.permission !== 'default') {
      return;
    }

    if (window.localStorage.getItem(PUSH_DISMISSED_KEY) === 'true') {
      return;
    }

    const timeout = window.setTimeout(() => setVisivel(true), 1200);
    return () => window.clearTimeout(timeout);
  }, [token]);

  useEffect(() => {
    if (!token || !pushSuportado() || Notification.permission !== 'granted') {
      return;
    }

    ativarPush(false).catch(() => {});
  }, [ativarPush, token]);

  if (!visivel) {
    return null;
  }

  const dispensar = () => {
    window.localStorage.setItem(PUSH_DISMISSED_KEY, 'true');
    setVisivel(false);
  };

  return (
    <div className="fixed inset-x-3 bottom-24 z-50 rounded-3xl border border-gray-200 bg-gray-950 p-4 text-white shadow-2xl shadow-gray-950/25 md:bottom-5 md:left-5 md:right-auto md:max-w-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-white/10 p-3">
          <BellRing size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Receber notificações do MCom?</p>
          <p className="mt-1 text-xs leading-5 text-white/70">
            Avisos, lembretes de escalas, substituições e alertas importantes aparecerão como push no celular.
          </p>
          {erro && <p className="mt-2 text-xs font-semibold text-red-200">{erro}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={carregando}
              onClick={() => ativarPush()}
              className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-bold text-gray-950 transition hover:bg-gray-100 disabled:opacity-60"
            >
              {carregando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing size={14} />}
              Ativar
            </button>
            <button
              type="button"
              onClick={dispensar}
              className="rounded-full border border-white/15 px-3 py-2 text-xs font-bold text-white/80 transition hover:bg-white/10"
            >
              Depois
            </button>
          </div>
        </div>
        <button type="button" onClick={dispensar} className="rounded-full p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white" aria-label="Fechar notificações push">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

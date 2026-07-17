import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, Loader2, Moon, Settings, Smartphone, Sun, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { buildApiUrl } from '../lib/api';
import { urlBase64ParaUint8Array } from '../lib/pwa';

const THEME_KEY = 'mcom_tema';
const PUSH_DISMISSED_KEY = 'mcom_push_prompt_dismissed';

function getTemaInicial() {
  if (typeof window === 'undefined') return 'claro';
  const temaSalvo = window.localStorage.getItem(THEME_KEY);

  if (['claro', 'escuro'].includes(temaSalvo)) {
    return temaSalvo;
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

function pushSuportado() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function aplicarTema(tema) {
  document.documentElement.classList.toggle('dark', tema === 'escuro');
  window.localStorage.setItem(THEME_KEY, tema);
  window.dispatchEvent(new CustomEvent('mcom-theme-change', { detail: { tema } }));
}

export function AppSettings() {
  const { token } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [tema, setTema] = useState(getTemaInicial);
  const [pushAtivo, setPushAtivo] = useState(false);
  const [permissaoPush, setPermissaoPush] = useState(() => (pushSuportado() ? Notification.permission : 'unsupported'));
  const [carregandoPush, setCarregandoPush] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const atualizarStatusPush = useCallback(async () => {
    if (!pushSuportado()) {
      setPermissaoPush('unsupported');
      setPushAtivo(false);
      return;
    }

    setPermissaoPush(Notification.permission);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setPushAtivo(Boolean(subscription));
    } catch {
      setPushAtivo(false);
    }
  }, []);

  useEffect(() => {
    const abrir = () => {
      setAberto(true);
      setErro('');
      setSucesso('');
      atualizarStatusPush();
    };

    window.addEventListener('mcom-open-settings', abrir);
    return () => window.removeEventListener('mcom-open-settings', abrir);
  }, [atualizarStatusPush]);

  useEffect(() => {
    const sincronizarTema = (event) => {
      const proximoTema = event.detail?.tema || getTemaInicial();
      setTema(proximoTema);
    };

    window.addEventListener('mcom-theme-change', sincronizarTema);
    return () => window.removeEventListener('mcom-theme-change', sincronizarTema);
  }, []);

  useEffect(() => {
    if (!aberto) {
      return undefined;
    }

    const fecharComEsc = (event) => {
      if (event.key === 'Escape') {
        setAberto(false);
      }
    };

    window.addEventListener('keydown', fecharComEsc);
    return () => window.removeEventListener('keydown', fecharComEsc);
  }, [aberto]);

  const alterarTema = (proximoTema) => {
    setTema(proximoTema);
    aplicarTema(proximoTema);
  };

  const ativarPush = async () => {
    setErro('');
    setSucesso('');
    setCarregandoPush(true);

    try {
      const permissao = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();

      setPermissaoPush(permissao);

      if (permissao !== 'granted') {
        throw new Error('Permissão de notificações não foi liberada neste aparelho.');
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

      window.localStorage.removeItem(PUSH_DISMISSED_KEY);
      setPushAtivo(true);
      setSucesso(dados.mensagem || 'Notificações ativadas neste aparelho.');
    } catch (error) {
      setErro(error.message || 'Não foi possível ativar as notificações.');
    } finally {
      setCarregandoPush(false);
    }
  };

  const desativarPush = async () => {
    setErro('');
    setSucesso('');
    setCarregandoPush(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        setPushAtivo(false);
        setSucesso('Notificações já estavam desativadas neste aparelho.');
        return;
      }

      await fetch(buildApiUrl('/api/notificacoes/push/subscribe'), {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subscription }),
      });

      await subscription.unsubscribe();
      window.localStorage.setItem(PUSH_DISMISSED_KEY, 'true');
      setPushAtivo(false);
      setSucesso('Notificações desativadas neste aparelho.');
    } catch (error) {
      setErro(error.message || 'Não foi possível desativar as notificações.');
    } finally {
      setCarregandoPush(false);
    }
  };

  if (!aberto) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] bg-gray-950/50 pt-14 backdrop-blur-sm md:hidden"
      onClick={() => setAberto(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Configurações do app"
        onClick={(event) => event.stopPropagation()}
        className="mx-auto flex h-full max-w-md flex-col overflow-hidden rounded-t-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-5 dark:border-gray-800">
          <div>
            <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase text-dourado-700 dark:text-dourado-300">
              <Settings size={13} />
              App MCom
            </span>
            <h2 className="mt-3 text-xl font-bold text-gray-950 dark:text-white">Configurações</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Ajuste a aparência e as notificações deste aparelho.</p>
          </div>
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="rounded-full border border-gray-200 bg-white p-2 text-gray-500 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            aria-label="Fechar configurações"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <section className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-white text-gray-900 dark:bg-gray-950 dark:text-white">
                {tema === 'escuro' ? <Moon size={20} /> : <Sun size={20} />}
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-950 dark:text-white">Aparência</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Escolha o modo visual do app.</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-md bg-white p-1 dark:bg-gray-950">
              {[
                { value: 'claro', label: 'Claro' },
                { value: 'escuro', label: 'Escuro' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => alterarTema(option.value)}
                  className={`rounded px-3 py-2 text-sm font-semibold transition ${
                    tema === option.value
                      ? 'border border-gray-300 bg-gray-950 text-white dark:border-gray-600 dark:bg-gray-900 dark:text-white'
                      : 'border border-transparent text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-white text-gray-900 dark:bg-gray-950 dark:text-white">
                <BellRing size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-950 dark:text-white">Notificações</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {pushAtivo ? 'Push ativo neste aparelho.' : 'Receba avisos e lembretes de escala.'}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-md border border-gray-200 bg-white p-3 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
              <div className="flex items-center gap-2">
                <Smartphone size={15} />
                <span className="font-semibold">
                  Permissão: {permissaoPush === 'granted' ? 'liberada' : permissaoPush === 'denied' ? 'bloqueada' : permissaoPush === 'unsupported' ? 'indisponível' : 'pendente'}
                </span>
              </div>
            </div>

            {erro && <p role="alert" aria-live="assertive" className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">{erro}</p>}
            {sucesso && <p role="status" aria-live="polite" className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">{sucesso}</p>}

            <button
              type="button"
              disabled={carregandoPush || permissaoPush === 'unsupported'}
              onClick={pushAtivo ? desativarPush : ativarPush}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-dourado-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-dourado-800 disabled:opacity-60"
            >
              {carregandoPush ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing size={16} />}
              {pushAtivo ? 'Desativar notificações neste aparelho' : 'Ativar notificações'}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

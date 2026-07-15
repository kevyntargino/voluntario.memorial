import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Bell, CheckCheck, Eye, Loader2 } from 'lucide-react';
import Navbar from '../components/Navbar';
import { Footer } from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { buildApiUrl } from '../lib/api';

function formatarData(data) {
  if (!data) {
    return 'Sem data';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(data));
}

export default function Avisos() {
  const { token, logout } = useAuth();
  const { navigate } = useNavigation();
  const [avisos, setAvisos] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [mostrarAntigos, setMostrarAntigos] = useState(false);
  const [salvandoId, setSalvandoId] = useState(null);
  const [totalNaoVisualizados, setTotalNaoVisualizados] = useState(0);

  const carregarAvisos = useCallback(async () => {
    setErro('');
    setCarregando(true);

    try {
      const query = mostrarAntigos ? '?visualizados=todos' : '';
      const resposta = await fetch(buildApiUrl(`/api/avisos${query}`), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        if (resposta.status === 401) {
          logout();
          navigate('/login', { replace: true });
          return;
        }

        throw new Error(dados.erro || 'Não foi possível carregar os avisos.');
      }

      setAvisos(dados.avisos || []);
      setTotalNaoVisualizados(dados.totalNaoVisualizados ?? 0);
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar os avisos.');
    } finally {
      setCarregando(false);
    }
  }, [logout, mostrarAntigos, navigate, token]);

  useEffect(() => {
    carregarAvisos();
  }, [carregarAvisos]);

  const marcarComoVisualizado = async (avisoId) => {
    setErro('');
    setSalvandoId(avisoId);

    try {
      const resposta = await fetch(buildApiUrl(`/api/avisos/${avisoId}/visualizar`), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        if (resposta.status === 401) {
          logout();
          navigate('/login', { replace: true });
          return;
        }

        throw new Error(dados.erro || 'Não foi possível marcar o aviso como visualizado.');
      }

      setTotalNaoVisualizados((atual) => Math.max(0, atual - 1));
      setAvisos((atuais) => (
        mostrarAntigos
          ? atuais.map((aviso) => (
              aviso.id === avisoId
                ? { ...aviso, visualizado: true, visualizadoEm: new Date().toISOString() }
                : aviso
            ))
          : atuais.filter((aviso) => aviso.id !== avisoId)
      ));
    } catch (error) {
      setErro(error.message || 'Não foi possível marcar o aviso como visualizado.');
    } finally {
      setSalvandoId(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f4ed] text-gray-900">
      <Navbar />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3">
            <div className="rounded-md bg-dourado-50 p-3 text-dourado-700">
              <Bell className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-dourado-700">Comunicados</p>
              <h1 className="mt-2 text-3xl font-bold text-gray-950">Avisos</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                Acompanhe os comunicados enviados para você, sua equipe ou todos do MCom.
              </p>
            </div>
            </div>
            <button
              type="button"
              onClick={() => setMostrarAntigos((atual) => !atual)}
              className="inline-flex w-fit items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-100"
            >
              <Eye size={16} />
              {mostrarAntigos ? 'Ver somente não visualizados' : `Ver avisos antigos (${totalNaoVisualizados} pendente${totalNaoVisualizados === 1 ? '' : 's'})`}
            </button>
          </div>
        </section>

        {erro && (
          <div className="mt-5 flex items-center gap-2 rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            <AlertCircle size={16} />
            {erro}
          </div>
        )}

        {carregando ? (
          <div className="mt-5 flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-6 py-12 text-gray-500 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando avisos...
          </div>
        ) : avisos.length === 0 ? (
          <div className="mt-5 rounded-lg border border-gray-200 bg-white px-6 py-12 text-gray-500 shadow-sm">
            {mostrarAntigos
              ? 'Nenhum aviso disponível para você no momento.'
              : 'Você não tem avisos não visualizados no momento.'}
          </div>
        ) : (
          <section className="mt-5 space-y-3">
            {avisos.map((aviso) => (
              <article key={aviso.id} className={`rounded-lg border bg-white p-5 shadow-sm ${aviso.visualizado ? 'border-gray-200 opacity-85' : 'border-gray-300'}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold text-gray-950">{aviso.titulo}</h2>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${
                        aviso.visualizado ? 'bg-gray-100 text-gray-500' : 'bg-gray-950 text-white'
                      }`}>
                        {aviso.visualizado ? 'Visualizado' : 'Novo'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-dourado-700">{formatarData(aviso.dataAviso)}</p>
                  </div>
                  <span className="inline-flex w-fit rounded border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.14em] text-gray-500">
                    {aviso.tipo === 'GLOBAL' ? 'Todos' : aviso.equipe?.nome || 'Direcionado'}
                  </span>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-700">{aviso.mensagem}</p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {aviso.criador?.nomeCompleto ? (
                    <p className="text-xs font-semibold text-gray-400">Enviado por {aviso.criador.nomeCompleto}</p>
                  ) : <span />}
                  {!aviso.visualizado && (
                    <button
                      type="button"
                      disabled={salvandoId === aviso.id}
                      onClick={() => marcarComoVisualizado(aviso.id)}
                      className="inline-flex w-fit items-center gap-2 rounded-md bg-gray-950 px-3 py-2 text-sm font-bold text-white transition hover:bg-gray-800 disabled:opacity-60"
                    >
                      {salvandoId === aviso.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck size={16} />}
                      Marcar como visualizado
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}

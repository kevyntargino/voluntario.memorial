import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Download, FileText, Loader2, Search } from 'lucide-react';
import Navbar from '../components/Navbar';
import { Footer } from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { buildApiUrl } from '../lib/api';

function formatarData(data) {
  if (!data) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(data));
}

export default function Manuais() {
  const { token, logout } = useAuth();
  const { navigate } = useNavigation();
  const [manuais, setManuais] = useState([]);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [abrindoId, setAbrindoId] = useState(null);

  const carregarManuais = useCallback(async () => {
    setErro('');
    setCarregando(true);

    try {
      const resposta = await fetch(buildApiUrl('/api/manuais'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        if (resposta.status === 401) {
          logout();
          navigate('/login', { replace: true });
          return;
        }

        throw new Error(dados.erro || 'Não foi possível carregar os manuais.');
      }

      setManuais(dados.manuais || []);
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar os manuais.');
    } finally {
      setCarregando(false);
    }
  }, [logout, navigate, token]);

  useEffect(() => {
    carregarManuais();
  }, [carregarManuais]);

  const manuaisFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    if (!termo) {
      return manuais;
    }

    return manuais.filter((manual) => [
      manual.titulo,
      manual.descricao,
      manual.versao,
      manual.dataManual ? formatarData(manual.dataManual) : '',
    ].filter(Boolean).join(' ').toLowerCase().includes(termo));
  }, [busca, manuais]);

  const abrirManual = async (manual) => {
    setErro('');
    setAbrindoId(manual.id);

    try {
      const resposta = await fetch(buildApiUrl(`/api/manuais/${manual.id}/arquivo`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => ({}));

        if (resposta.status === 401) {
          logout();
          navigate('/login', { replace: true });
          return;
        }

        throw new Error(dados.erro || 'Não foi possível abrir o manual.');
      }

      const blob = await resposta.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) {
      setErro(error.message || 'Não foi possível abrir o manual.');
    } finally {
      setAbrindoId(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f4ed] text-gray-900">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-8 sm:px-6 md:pb-10 lg:px-8">
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 bg-gradient-to-br from-white to-gray-50 p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-gray-100 p-3 text-gray-700">
                  <BookOpen className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">MCom</p>
                  <h1 className="mt-2 text-3xl font-bold text-gray-950">Manuais</h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                    Consulte os documentos oficiais, versões atualizadas e instruções para as equipes.
                  </p>
                </div>
              </div>
              <label className="relative block w-full lg:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  aria-label="Pesquisar manuais"
                  className="block w-full rounded-md border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                  placeholder="Pesquisar manuais"
                />
              </label>
            </div>
          </div>

          {erro && (
            <div role="alert" aria-live="assertive" className="mx-6 mt-5 rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {erro}
            </div>
          )}

          {carregando ? (
            <div className="flex items-center gap-3 px-6 py-12 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando manuais...
            </div>
          ) : (
            <div className="grid gap-4 p-6 md:grid-cols-2">
              {manuaisFiltrados.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-5 py-10 text-center text-sm text-gray-500 md:col-span-2">
                  Nenhum manual disponível no momento.
                </div>
              ) : manuaisFiltrados.map((manual) => (
                <article key={manual.id} className="flex min-h-full flex-col rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-700">
                      <FileText size={22} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="break-words text-lg font-bold text-gray-950">{manual.titulo}</h2>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-600">
                          v{manual.versao || '1.0'}
                        </span>
                        <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-600">
                          {formatarData(manual.dataManual)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {manual.descricao && (
                    <p className="mt-4 flex-1 text-sm leading-6 text-gray-600">{manual.descricao}</p>
                  )}
                  <button
                    type="button"
                    disabled={abrindoId === manual.id}
                    onClick={() => abrirManual(manual)}
                    className="mt-5 inline-flex items-center justify-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
                  >
                    {abrindoId === manual.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download size={16} />}
                    Abrir PDF
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}

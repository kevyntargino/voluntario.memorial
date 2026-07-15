import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Bell, Loader2 } from 'lucide-react';
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

  const carregarAvisos = useCallback(async () => {
    setErro('');
    setCarregando(true);

    try {
      const resposta = await fetch(buildApiUrl('/api/avisos'), {
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
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar os avisos.');
    } finally {
      setCarregando(false);
    }
  }, [logout, navigate, token]);

  useEffect(() => {
    carregarAvisos();
  }, [carregarAvisos]);

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f4ed] text-gray-900">
      <Navbar />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
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
            Nenhum aviso disponível para você no momento.
          </div>
        ) : (
          <section className="mt-5 space-y-3">
            {avisos.map((aviso) => (
              <article key={aviso.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-gray-950">{aviso.titulo}</h2>
                    <p className="mt-1 text-sm font-semibold text-dourado-700">{formatarData(aviso.dataAviso)}</p>
                  </div>
                  <span className="inline-flex w-fit rounded border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.14em] text-gray-500">
                    {aviso.tipo === 'GLOBAL' ? 'Todos' : aviso.equipe?.nome || 'Direcionado'}
                  </span>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-700">{aviso.mensagem}</p>
                {aviso.criador?.nomeCompleto && (
                  <p className="mt-4 text-xs font-semibold text-gray-400">Enviado por {aviso.criador.nomeCompleto}</p>
                )}
              </article>
            ))}
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}

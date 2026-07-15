import React, { useEffect, useState } from 'react';
import { ArrowLeft, BadgeCheck, Camera, Loader2, Mail, Save, UserRound } from 'lucide-react';
import Navbar from '../components/Navbar';
import { Footer } from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { buildApiUrl } from '../lib/api';
import { uploadFotoUsuario } from '../lib/uploadFoto';

const sexoOptions = [
  { value: '', label: 'Não informado' },
  { value: 'MASCULINO', label: 'Masculino' },
  { value: 'FEMININO', label: 'Feminino' },
  { value: 'OUTRO', label: 'Outro' },
  { value: 'PREFIRO_NAO_INFORMAR', label: 'Prefiro não informar' },
];

function createFormState(usuario) {
  return {
    nomeCompleto: usuario?.nomeCompleto || '',
    telefone: usuario?.telefone || '',
    dataNascimento: usuario?.dataNascimento || '',
    sexo: usuario?.sexo || '',
    urlFoto: usuario?.urlFoto || '',
  };
}

export default function Perfil() {
  const { token, usuario, atualizarUsuario, logout } = useAuth();
  const { navigate } = useNavigation();
  const [form, setForm] = useState(() => createFormState(usuario));
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);

  useEffect(() => {
    let ativo = true;

    async function carregarPerfil() {
      setErro('');

      try {
        const resposta = await fetch(buildApiUrl('/api/auth/me'), {
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

          throw new Error(dados.erro || 'Não foi possível carregar seu perfil.');
        }

        if (ativo) {
          atualizarUsuario(dados.usuario);
          setForm(createFormState(dados.usuario));
        }
      } catch (error) {
        if (ativo) {
          setErro(error.message || 'Não foi possível carregar seu perfil.');
        }
      } finally {
        if (ativo) {
          setCarregando(false);
        }
      }
    }

    carregarPerfil();

    return () => {
      ativo = false;
    };
  }, [atualizarUsuario, logout, navigate, token]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErro('');
    setSucesso('');

    if (form.nomeCompleto.trim().length < 3) {
      setErro('Informe seu nome completo.');
      return;
    }

    setSalvando(true);

    try {
      const resposta = await fetch(buildApiUrl('/api/auth/me'), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        if (resposta.status === 401) {
          logout();
          navigate('/login', { replace: true });
          return;
        }

        throw new Error(dados.erro || 'Não foi possível atualizar seu perfil.');
      }

      atualizarUsuario(dados.usuario);
      setForm(createFormState(dados.usuario));
      setSucesso(dados.mensagem || 'Perfil atualizado com sucesso.');
    } catch (error) {
      setErro(error.message || 'Não foi possível atualizar seu perfil.');
    } finally {
      setSalvando(false);
    }
  };

  const handleFoto = async (file) => {
    setErro('');
    setSucesso('');
    setEnviandoFoto(true);

    try {
      const publicUrl = await uploadFotoUsuario({ token, file });
      const proximoForm = {
        ...form,
        urlFoto: publicUrl,
      };
      const resposta = await fetch(buildApiUrl('/api/auth/me'), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(proximoForm),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        if (resposta.status === 401) {
          logout();
          navigate('/login', { replace: true });
          return;
        }

        throw new Error(dados.erro || 'Foto enviada, mas não foi possível salvar no perfil.');
      }

      atualizarUsuario(dados.usuario);
      setForm(createFormState(dados.usuario));
      setSucesso('Foto atualizada com sucesso.');
    } catch (error) {
      setErro(error.message || 'Não foi possível enviar a foto.');
    } finally {
      setEnviandoFoto(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f4ed] text-gray-900">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-gray-600 transition hover:text-gray-950"
        >
          <ArrowLeft size={16} />
          Voltar
        </button>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="h-fit rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-lg bg-gray-950 text-white">
                {form.urlFoto ? (
                  <img src={form.urlFoto} alt={form.nomeCompleto} className="h-full w-full object-cover" />
                ) : (
                  <UserRound size={34} />
                )}
              </div>

              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-gray-950">{usuario?.nomeCompleto || 'Usuário'}</p>
                <p className="mt-1 flex items-center gap-2 truncate text-sm text-gray-500">
                  <Mail size={14} />
                  {usuario?.email}
                </p>
              </div>
            </div>

            <div className="mt-6 border-t border-gray-100 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Permissões</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(usuario?.permissoes || []).map((permissao) => (
                  <span key={permissao} className="inline-flex items-center gap-1 rounded-md bg-dourado-50 px-2.5 py-1 text-xs font-semibold text-dourado-700">
                    <BadgeCheck size={13} />
                    {permissao.replaceAll('_', ' ')}
                  </span>
                ))}
              </div>
            </div>
          </aside>

          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-5">
              <h1 className="text-2xl font-bold text-gray-950">Perfil</h1>
              <p className="mt-1 text-sm text-gray-500">Visualize e atualize seus dados pessoais no MCom.</p>
            </div>

            {carregando ? (
              <div className="flex items-center gap-3 px-6 py-10 text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Carregando perfil...
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6 px-6 py-6">
                {erro && (
                  <div className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {erro}
                  </div>
                )}

                {sucesso && (
                  <div className="rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                    {sucesso}
                  </div>
                )}

                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-semibold text-gray-700">Nome completo</span>
                    <input
                      name="nomeCompleto"
                      value={form.nomeCompleto}
                      onChange={handleChange}
                      className="mt-2 block w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                      placeholder="Seu nome"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-semibold text-gray-700">E-mail</span>
                    <input
                      value={usuario?.email || ''}
                      disabled
                      className="mt-2 block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500 outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-semibold text-gray-700">Telefone</span>
                    <input
                      name="telefone"
                      value={form.telefone}
                      onChange={handleChange}
                      className="mt-2 block w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                      placeholder="(00) 00000-0000"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-semibold text-gray-700">Data de nascimento</span>
                    <input
                      type="date"
                      name="dataNascimento"
                      value={form.dataNascimento}
                      onChange={handleChange}
                      className="mt-2 block w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-semibold text-gray-700">Sexo</span>
                    <select
                      name="sexo"
                      value={form.sexo}
                      onChange={handleChange}
                      className="mt-2 block w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                    >
                      {sexoOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-sm font-semibold text-gray-700">Foto do usuário</span>
                    <div className="relative mt-2">
                      <Camera className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) handleFoto(file);
                          event.target.value = '';
                        }}
                        className="block w-full rounded-md border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                      />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {enviandoFoto ? 'Enviando foto...' : 'JPG, PNG, WEBP ou GIF até 5MB.'}
                    </p>
                  </label>
                </div>

                <div className="flex justify-end border-t border-gray-100 pt-5">
                  <button
                    type="submit"
                    disabled={salvando}
                    className="inline-flex items-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
                    Salvar alterações
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}

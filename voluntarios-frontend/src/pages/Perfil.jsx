import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, BadgeCheck, Loader2, Mail, Pencil, Save, Trash2, UserRound } from 'lucide-react';
import Navbar from '../components/Navbar';
import { Footer } from '../components/Footer';
import { PhoneInput } from '../components/PhoneInput';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { buildApiUrl } from '../lib/api';
import { getCamposCadastroPendentes } from '../lib/perfil';
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
  const { navigate, search } = useNavigation();
  const [form, setForm] = useState(() => createFormState(usuario));
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const fotoInputRef = useRef(null);
  const focoCadastroAplicadoRef = useRef(false);
  const completarCadastro = new URLSearchParams(search || '').get('completar') === '1';
  const camposPendentes = useMemo(() => getCamposCadastroPendentes(form), [form]);
  const camposPendentesSet = useMemo(() => new Set(camposPendentes.map(({ campo }) => campo)), [camposPendentes]);

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

  useEffect(() => {
    if (carregando || !completarCadastro || camposPendentes.length === 0 || focoCadastroAplicadoRef.current) return;

    focoCadastroAplicadoRef.current = true;

    const timeout = window.setTimeout(() => {
      const primeiroCampo = camposPendentes[0].campo;
      const elemento = document.querySelector(`[data-cadastro-campo="${primeiroCampo}"]`);
      elemento?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      elemento?.focus({ preventScroll: true });
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [camposPendentes, carregando, completarCadastro]);

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

  const removerFoto = async () => {
    setErro('');
    setSucesso('');
    setEnviandoFoto(true);

    try {
      const resposta = await fetch(buildApiUrl('/api/auth/me'), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...form, urlFoto: '' }),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        if (resposta.status === 401) {
          logout();
          navigate('/login', { replace: true });
          return;
        }

        throw new Error(dados.erro || 'Não foi possível remover a foto.');
      }

      atualizarUsuario(dados.usuario);
      setForm(createFormState(dados.usuario));
      setSucesso('Foto removida com sucesso.');
    } catch (error) {
      setErro(error.message || 'Não foi possível remover a foto.');
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
              <input
                ref={fotoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleFoto(file);
                  event.target.value = '';
                }}
              />
              <button
                type="button"
                data-cadastro-campo="urlFoto"
                disabled={enviandoFoto}
                onClick={() => fotoInputRef.current?.click()}
                className={`group relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-gray-950 text-white disabled:cursor-wait ${camposPendentesSet.has('urlFoto') && completarCadastro ? 'ring-2 ring-amber-400 ring-offset-2' : ''}`}
                aria-label="Alterar foto de perfil"
              >
                {form.urlFoto ? (
                  <img src={form.urlFoto} alt={form.nomeCompleto} className="h-full w-full object-cover" />
                ) : (
                  <UserRound size={34} />
                )}
                <span className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-white text-gray-800 shadow ring-1 ring-black/10 transition group-hover:scale-105">
                  {enviandoFoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil size={14} />}
                </span>
              </button>

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

            <button
              type="button"
              disabled={enviandoFoto || !form.urlFoto}
              onClick={removerFoto}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md border border-red-100 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviandoFoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 size={15} />}
              Remover foto
            </button>
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
                {camposPendentes.length > 0 && (
                  <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <p className="text-sm font-bold">Complete as informações pendentes</p>
                      <p className="mt-1 text-xs leading-5">
                        {camposPendentes.map(({ label }) => label).join(', ')}.
                      </p>
                    </div>
                  </div>
                )}
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

                  <PhoneInput
                    value={form.telefone}
                    onChange={(telefone) => setForm((atual) => ({ ...atual, telefone }))}
                    highlighted={camposPendentesSet.has('telefone') && completarCadastro}
                    dataCadastroCampo="telefone"
                  />

                  <label className="block">
                    <span className="text-sm font-semibold text-gray-700">Data de nascimento</span>
                    <input
                      type="date"
                      name="dataNascimento"
                      data-cadastro-campo="dataNascimento"
                      value={form.dataNascimento}
                      onChange={handleChange}
                      className={`mt-2 block w-full rounded-md border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 ${camposPendentesSet.has('dataNascimento') && completarCadastro ? 'border-amber-400 ring-2 ring-amber-200/70' : 'border-gray-200'}`}
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-semibold text-gray-700">Sexo</span>
                    <select
                      name="sexo"
                      data-cadastro-campo="sexo"
                      value={form.sexo}
                      onChange={handleChange}
                      className={`mt-2 block w-full rounded-md border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 ${camposPendentesSet.has('sexo') && completarCadastro ? 'border-amber-400 ring-2 ring-amber-200/70' : 'border-gray-200'}`}
                    >
                      {sexoOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
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

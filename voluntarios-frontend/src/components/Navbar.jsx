import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BadgeCheck, Bell, CheckCheck, Loader2, LogOut, Pencil, Save, Trash2, User, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { buildApiUrl } from '../lib/api';
import { uploadFotoUsuario } from '../lib/uploadFoto';
import logo from '../assets/ico.png';

const sexoOptions = [
  { value: '', label: 'Não informado' },
  { value: 'MASCULINO', label: 'Masculino' },
  { value: 'FEMININO', label: 'Feminino' },
  { value: 'OUTRO', label: 'Outro' },
  { value: 'PREFIRO_NAO_INFORMAR', label: 'Prefiro não informar' },
];

function criarFormUsuario(usuario) {
  return {
    nomeCompleto: usuario?.nomeCompleto || '',
    telefone: usuario?.telefone || '',
    dataNascimento: usuario?.dataNascimento || '',
    sexo: usuario?.sexo || '',
    urlFoto: usuario?.urlFoto || '',
  };
}

const senhaInicial = {
  senhaAtual: '',
  novaSenha: '',
  confirmarNovaSenha: '',
};
const THEME_KEY = 'mcom_tema';

function getTemaInicial() {
  if (typeof window === 'undefined') return 'claro';
  const temaSalvo = window.localStorage.getItem(THEME_KEY);

  if (['claro', 'escuro'].includes(temaSalvo)) {
    return temaSalvo;
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

function formatarDataNotificacao(data) {
  if (!data) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(data));
}

export default function Navbar() {
  const [notificacoesAberto, setNotificacoesAberto] = useState(false);
  const [notificacoes, setNotificacoes] = useState([]);
  const [naoVisualizadas, setNaoVisualizadas] = useState(0);
  const [carregandoNotificacoes, setCarregandoNotificacoes] = useState(false);
  const [tema, setTema] = useState(getTemaInicial);
  const [perfilAberto, setPerfilAberto] = useState(false);
  const [editandoPerfil, setEditandoPerfil] = useState(false);
  const [formPerfil, setFormPerfil] = useState(() => criarFormUsuario(null));
  const [formSenha, setFormSenha] = useState(senhaInicial);
  const [erroPerfil, setErroPerfil] = useState('');
  const [sucessoPerfil, setSucessoPerfil] = useState('');
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const fotoInputRef = useRef(null);
  const { token, usuario, atualizarUsuario, logout } = useAuth();
  const { navigate } = useNavigation();
  const podeGerenciarEquipe = usuario?.permissoes?.some((permissao) => ['LIDER_EQUIPE', 'ADMINISTRADOR'].includes(permissao));
  const isAdmin = usuario?.permissoes?.includes('ADMINISTRADOR');

  useEffect(() => {
    setFormPerfil(criarFormUsuario(usuario));
  }, [usuario]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'escuro');
    window.localStorage.setItem(THEME_KEY, tema);
  }, [tema]);

  const carregarNotificacoes = useCallback(async () => {
    if (!token) return;

    setCarregandoNotificacoes(true);

    try {
      const resposta = await fetch(buildApiUrl('/api/notificacoes'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await resposta.json();

      if (resposta.ok) {
        setNotificacoes(dados.notificacoes || []);
        setNaoVisualizadas(dados.naoVisualizadas || 0);
      }
    } catch {
      // Notificações não devem bloquear a navegação.
    } finally {
      setCarregandoNotificacoes(false);
    }
  }, [token]);

  useEffect(() => {
    carregarNotificacoes();
    const interval = window.setInterval(carregarNotificacoes, 5 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, [carregarNotificacoes]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const irPara = (rota) => {
    navigate(rota);
  };

  const abrirPerfil = () => {
    setPerfilAberto((atual) => !atual);
    setNotificacoesAberto(false);
    setEditandoPerfil(false);
    setErroPerfil('');
    setSucessoPerfil('');
    setFormSenha(senhaInicial);
    setFormPerfil(criarFormUsuario(usuario));
  };

  const abrirNotificacoes = () => {
    setNotificacoesAberto((atual) => !atual);
    setPerfilAberto(false);
    carregarNotificacoes();
  };

  const visualizarNotificacao = async (notificacao) => {
    if (!notificacao.visualizada) {
      setNotificacoes((atuais) => atuais.map((item) => (
        item.id === notificacao.id ? { ...item, visualizada: true, lidaEm: new Date().toISOString() } : item
      )));
      setNaoVisualizadas((total) => Math.max(0, total - 1));

      fetch(buildApiUrl(`/api/notificacoes/${notificacao.id}/visualizar`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }

    if (notificacao.link) {
      navigate(notificacao.link);
      setNotificacoesAberto(false);
    }
  };

  const visualizarTodas = async () => {
    setNotificacoes((atuais) => atuais.map((item) => ({ ...item, visualizada: true, lidaEm: item.lidaEm || new Date().toISOString() })));
    setNaoVisualizadas(0);

    try {
      await fetch(buildApiUrl('/api/notificacoes/visualizar-todas'), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      carregarNotificacoes();
    }
  };

  const salvarPerfil = async (event) => {
    event.preventDefault();
    setErroPerfil('');
    setSucessoPerfil('');

    if (formPerfil.nomeCompleto.trim().length < 3) {
      setErroPerfil('Informe seu nome completo.');
      return;
    }

    setSalvandoPerfil(true);

    try {
      const resposta = await fetch(buildApiUrl('/api/auth/me'), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formPerfil),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        if (resposta.status === 401) {
          handleLogout();
          return;
        }

        throw new Error(dados.erro || 'Não foi possível atualizar seus dados.');
      }

      atualizarUsuario(dados.usuario);
      setFormPerfil(criarFormUsuario(dados.usuario));
      setEditandoPerfil(false);
      setSucessoPerfil(dados.mensagem || 'Dados atualizados com sucesso.');
    } catch (error) {
      setErroPerfil(error.message || 'Não foi possível atualizar seus dados.');
    } finally {
      setSalvandoPerfil(false);
    }
  };

  const alterarSenha = async (event) => {
    event.preventDefault();
    setErroPerfil('');
    setSucessoPerfil('');

    if (!formSenha.senhaAtual || !formSenha.novaSenha || !formSenha.confirmarNovaSenha) {
      setErroPerfil('Preencha a senha antiga, a nova senha e a confirmação.');
      return;
    }

    if (formSenha.novaSenha.length < 6) {
      setErroPerfil('A nova senha deve ter no mínimo 6 dígitos.');
      return;
    }

    if (formSenha.novaSenha !== formSenha.confirmarNovaSenha) {
      setErroPerfil('A nova senha e a confirmação precisam ser iguais.');
      return;
    }

    setSalvandoSenha(true);

    try {
      const resposta = await fetch(buildApiUrl('/api/auth/me/senha'), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formSenha),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        if (resposta.status === 401) {
          handleLogout();
          return;
        }

        throw new Error(dados.erro || 'Não foi possível alterar sua senha.');
      }

      setFormSenha(senhaInicial);
      setSucessoPerfil(dados.mensagem || 'Senha alterada com sucesso.');
    } catch (error) {
      setErroPerfil(error.message || 'Não foi possível alterar sua senha.');
    } finally {
      setSalvandoSenha(false);
    }
  };

  const enviarFoto = async (file) => {
    setErroPerfil('');
    setSucessoPerfil('');
    setEnviandoFoto(true);

    try {
      const publicUrl = await uploadFotoUsuario({ token, file });
      const proximoForm = {
        ...formPerfil,
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
          handleLogout();
          return;
        }

        throw new Error(dados.erro || 'Foto enviada, mas não foi possível salvar no perfil.');
      }

      atualizarUsuario(dados.usuario);
      setFormPerfil(criarFormUsuario(dados.usuario));
      setSucessoPerfil('Foto atualizada com sucesso.');
    } catch (error) {
      setErroPerfil(error.message || 'Não foi possível enviar a foto.');
    } finally {
      setEnviandoFoto(false);
    }
  };

  const removerFoto = async () => {
    setErroPerfil('');
    setSucessoPerfil('');
    setEnviandoFoto(true);

    try {
      const resposta = await fetch(buildApiUrl('/api/auth/me'), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...formPerfil, urlFoto: '' }),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        if (resposta.status === 401) {
          handleLogout();
          return;
        }

        throw new Error(dados.erro || 'Não foi possível remover a foto.');
      }

      atualizarUsuario(dados.usuario);
      setFormPerfil(criarFormUsuario(dados.usuario));
      setSucessoPerfil('Foto removida com sucesso.');
    } catch (error) {
      setErroPerfil(error.message || 'Não foi possível remover a foto.');
    } finally {
      setEnviandoFoto(false);
    }
  };

  return (
    <nav className="sticky top-0 z-30 border-b border-white/60 bg-white/85 shadow-sm backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          
          {/* Logo / Título */}
          <div className="flex items-center">
            <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2">
              <img src={logo} alt="MCom" className="h-10 w-10 rounded-xl object-contain" />
              <span className="font-serif text-2xl font-bold text-gray-950">MCom</span>
            </button>
          </div>

          {/* Links de Navegação - Desktop */}
          <div className="hidden md:flex md:items-center md:space-x-8">
            <button type="button" onClick={() => irPara('/')} className="font-sans text-gray-600 hover:text-gray-950 transition-colors font-medium">
              Início
            </button>
            <button type="button" onClick={() => irPara('/escalas')} className="font-sans text-gray-600 hover:text-gray-950 transition-colors font-medium">
              Escalas
            </button>
            <button type="button" onClick={() => irPara('/avisos')} className="font-sans text-gray-600 hover:text-gray-950 transition-colors font-medium">
              Avisos
            </button>
            <button type="button" onClick={() => irPara('/manuais')} className="font-sans text-gray-600 hover:text-gray-950 transition-colors font-medium">
              Manuais
            </button>
            {podeGerenciarEquipe && (
              <button type="button" onClick={() => irPara('/minha-equipe')} className="font-sans text-gray-600 hover:text-gray-950 transition-colors font-medium">
                Equipe
              </button>
            )}
            {isAdmin && (
              <button type="button" onClick={() => irPara('/admin')} className="font-sans text-gray-600 hover:text-gray-950 transition-colors font-medium">
                Admin
              </button>
            )}
            
          </div>

          {/* Ações do Usuário - Desktop */}
          <div className="hidden md:flex items-center space-x-4">
            <button
              type="button"
              onClick={abrirNotificacoes}
              className="relative grid h-10 w-10 place-items-center rounded-full border border-gray-200 bg-white text-gray-600 transition hover:border-gray-400 hover:text-gray-950"
              aria-label="Abrir notificações"
            >
              <Bell size={18} />
              {naoVisualizadas > 0 && (
                <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-gray-950 px-1 text-[10px] font-bold text-white">
                  {naoVisualizadas > 9 ? '9+' : naoVisualizadas}
                </span>
              )}
            </button>
            <button type="button" onClick={abrirPerfil} className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-950 focus:outline-none focus:ring-2 focus:ring-gray-900">
              <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-gray-100 text-gray-500">
                {usuario?.urlFoto ? (
                  <img src={usuario.urlFoto} alt="" className="h-full w-full object-cover" />
                ) : (
                  <User size={18} />
                )}
              </span>
              <span className="max-w-36 truncate">{usuario?.nomeCompleto || 'Perfil'}</span>
            </button>
            <select
              value={tema}
              onChange={(event) => setTema(event.target.value)}
              className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none transition hover:border-gray-400 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 dark:bg-gray-800 dark:text-gray-100"
              aria-label="Selecionar tema"
            >
              <option value="claro">Modo claro</option>
              <option value="escuro">Modo escuro</option>
            </select>
          </div>

          {/* Ações Mobile */}
          <div className="flex items-center md:hidden">
            <button
              type="button"
              onClick={abrirNotificacoes}
              className="relative mr-1 grid h-10 w-10 place-items-center rounded-full border border-gray-200 bg-white text-gray-500"
              aria-label="Abrir notificações"
            >
              <Bell size={18} />
              {naoVisualizadas > 0 && (
                <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-gray-950 px-1 text-[10px] font-bold text-white">
                  {naoVisualizadas > 9 ? '9+' : naoVisualizadas}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={abrirPerfil}
              className="grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-gray-200 bg-white text-gray-500"
              aria-label="Abrir perfil"
            >
              {usuario?.urlFoto ? (
                <img src={usuario.urlFoto} alt="" className="h-full w-full object-cover" />
              ) : (
                <User size={19} />
              )}
            </button>
          </div>
        </div>
      </div>

      {notificacoesAberto && (
        <div className="absolute right-4 top-[4.5rem] z-50 w-[calc(100vw-2rem)] max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl md:right-8">
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="text-base font-bold text-gray-950">Notificações</h2>
              <p className="mt-1 text-xs text-gray-500">
                {naoVisualizadas > 0 ? `${naoVisualizadas} não visualizada(s)` : 'Tudo visualizado por aqui.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={visualizarTodas}
                disabled={naoVisualizadas === 0}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                <CheckCheck size={14} />
                Marcar todas
              </button>
              <button type="button" onClick={() => setNotificacoesAberto(false)} className="rounded-full border border-gray-200 bg-white p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900" aria-label="Fechar notificações">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {carregandoNotificacoes && notificacoes.length === 0 ? (
              <div className="flex items-center gap-2 px-5 py-8 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando notificações...
              </div>
            ) : notificacoes.length === 0 ? (
              <div className="px-5 py-8 text-sm text-gray-500">
                Nenhuma notificação por enquanto.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notificacoes.map((notificacao) => (
                  <button
                    key={notificacao.id}
                    type="button"
                    onClick={() => visualizarNotificacao(notificacao)}
                    className={`block w-full px-5 py-4 text-left transition hover:bg-gray-50 ${
                      notificacao.visualizada ? 'bg-white' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${notificacao.visualizada ? 'bg-gray-300' : 'bg-gray-950'}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-950">{notificacao.titulo}</p>
                        <p className="mt-1 text-sm leading-5 text-gray-600">{notificacao.mensagem}</p>
                        <p className="mt-2 text-xs font-semibold text-gray-400">{formatarDataNotificacao(notificacao.criadoEm)}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {perfilAberto && (
        <div className="absolute right-4 top-[4.5rem] z-50 w-[calc(100vw-2rem)] max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl md:right-8">
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                disabled={!editandoPerfil || enviandoFoto}
                onClick={() => {
                  if (editandoPerfil) fotoInputRef.current?.click();
                }}
                className="group relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gray-950 text-white disabled:cursor-default"
                aria-label={editandoPerfil ? 'Alterar foto de perfil' : 'Foto de perfil'}
              >
                {formPerfil.urlFoto ? (
                  <img src={formPerfil.urlFoto} alt="" className="h-full w-full object-cover" />
                ) : (
                  <User size={26} />
                )}
                {editandoPerfil && (
                  <span className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-white text-gray-800 shadow ring-1 ring-black/10 transition group-hover:scale-105">
                    {enviandoFoto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil size={13} />}
                  </span>
                )}
              </button>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-gray-950">{usuario?.nomeCompleto || 'Usuário'}</p>
                <p className="truncate text-sm text-gray-500">{usuario?.email || '-'}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(usuario?.permissoes || []).map((permissao) => (
                    <span key={permissao} className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-700">
                      <BadgeCheck size={11} />
                      {permissao.replaceAll('_', ' ')}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <button type="button" onClick={() => setPerfilAberto(false)} className="rounded-full border border-gray-200 bg-white p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900" aria-label="Fechar perfil">
              <X size={17} />
            </button>
          </div>

          <div className="max-h-[calc(100vh-7rem)] overflow-y-auto px-5 py-4">
            {erroPerfil && (
              <div className="mb-4 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {erroPerfil}
              </div>
            )}
            {sucessoPerfil && (
              <div className="mb-4 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                {sucessoPerfil}
              </div>
            )}

            <form onSubmit={salvarPerfil} className="space-y-4">
              <input
                ref={fotoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) enviarFoto(file);
                  event.target.value = '';
                }}
              />
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-gray-950">Minhas informações</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    Clique em editar para habilitar alterações. A foto é alterada clicando no avatar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditandoPerfil((atual) => !atual);
                    setFormPerfil(criarFormUsuario(usuario));
                    setErroPerfil('');
                    setSucessoPerfil('');
                  }}
                  className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  {editandoPerfil ? 'Cancelar edição' : 'Editar'}
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <CampoPerfil label="Nome completo" disabled={!editandoPerfil} value={formPerfil.nomeCompleto} onChange={(value) => setFormPerfil((atual) => ({ ...atual, nomeCompleto: value }))} />
                <CampoPerfil label="E-mail" disabled value={usuario?.email || ''} onChange={() => {}} />
                <CampoPerfil label="Telefone" disabled={!editandoPerfil} value={formPerfil.telefone} onChange={(value) => setFormPerfil((atual) => ({ ...atual, telefone: value }))} />
                <CampoPerfil label="Data de nascimento" type="date" disabled={!editandoPerfil} value={formPerfil.dataNascimento} onChange={(value) => setFormPerfil((atual) => ({ ...atual, dataNascimento: value }))} />
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">Sexo</span>
                  <select
                    value={formPerfil.sexo}
                    disabled={!editandoPerfil}
                    onChange={(event) => setFormPerfil((atual) => ({ ...atual, sexo: event.target.value }))}
                    className="mt-2 block w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition disabled:bg-gray-50 disabled:text-gray-500 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                  >
                    {sexoOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              {editandoPerfil && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="submit"
                    disabled={salvandoPerfil}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
                  >
                    {salvandoPerfil ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
                    Salvar dados
                  </button>
                  <button
                    type="button"
                    disabled={enviandoFoto || !formPerfil.urlFoto}
                    onClick={removerFoto}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-red-100 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {enviandoFoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 size={16} />}
                    Remover foto
                  </button>
                </div>
              )}
            </form>

            {editandoPerfil && (
              <form onSubmit={alterarSenha} className="mt-5 space-y-3 border-t border-gray-100 pt-5">
                <div>
                  <h3 className="text-base font-bold text-gray-950">Alterar senha</h3>
                  <p className="mt-1 text-xs text-gray-500">A nova senha precisa ter no mínimo 6 dígitos.</p>
                </div>
                <CampoPerfil label="Senha antiga" type="password" value={formSenha.senhaAtual} onChange={(value) => setFormSenha((atual) => ({ ...atual, senhaAtual: value }))} />
                <CampoPerfil label="Nova senha" type="password" value={formSenha.novaSenha} onChange={(value) => setFormSenha((atual) => ({ ...atual, novaSenha: value }))} />
                <CampoPerfil label="Confirmar nova senha" type="password" value={formSenha.confirmarNovaSenha} onChange={(value) => setFormSenha((atual) => ({ ...atual, confirmarNovaSenha: value }))} />
                <button
                  type="submit"
                  disabled={salvandoSenha}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 disabled:opacity-60"
                >
                  {salvandoSenha ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
                  Alterar senha
                </button>
              </form>
            )}

            <div className="mt-5 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-red-100 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:bg-gray-800"
              >
                <LogOut size={16} />
                Sair da conta
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

function CampoPerfil({ label, value, onChange, type = 'text', disabled = false }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 block w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition disabled:bg-gray-50 disabled:text-gray-500 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
      />
    </label>
  );
}

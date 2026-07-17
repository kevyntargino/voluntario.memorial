import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, Bell, Camera, CheckCheck, Image as ImageIcon, Loader2, LogOut, Pencil, Save, Settings, Trash2, User, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { buildApiUrl } from '../lib/api';
import { uploadFotoUsuario } from '../lib/uploadFoto';
import { formatarTelefoneExibicao } from '../lib/telefone';
import { PhoneInput } from './PhoneInput';
import logo from '../assets/ico.png';

const sexoOptions = [
  { value: '', label: 'Não informado' },
  { value: 'MASCULINO', label: 'Masculino' },
  { value: 'FEMININO', label: 'Feminino' },
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

function extrairAvisoId(link) {
  const match = String(link || '').match(/(?:^|[?&])aviso=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export default function Navbar() {
  const [notificacoesAberto, setNotificacoesAberto] = useState(false);
  const [notificacoes, setNotificacoes] = useState([]);
  const [avisos, setAvisos] = useState([]);
  const [naoVisualizadas, setNaoVisualizadas] = useState(0);
  const [avisosNaoVisualizados, setAvisosNaoVisualizados] = useState(0);
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
  const cameraInputRef = useRef(null);
  const { token, usuario, atualizarUsuario, logout } = useAuth();
  const { navigate } = useNavigation();
  const usuarioAvatarUrl = usuario?.urlFoto || formPerfil.urlFoto || '';
  const podeGerenciarEquipe = usuario?.permissoes?.some((permissao) => ['LIDER_EQUIPE', 'ADMINISTRADOR'].includes(permissao));
  const isAdmin = usuario?.permissoes?.includes('ADMINISTRADOR');
  const avisosRepresentadosPorNotificacao = useMemo(() => new Set(
    notificacoes
      .filter((notificacao) => notificacao.tipo === 'AVISO')
      .map((notificacao) => extrairAvisoId(notificacao.link))
      .filter(Boolean)
  ), [notificacoes]);
  const avisosRepresentadosPorNotificacaoPendente = useMemo(() => new Set(
    notificacoes
      .filter((notificacao) => notificacao.tipo === 'AVISO' && !notificacao.visualizada)
      .map((notificacao) => extrairAvisoId(notificacao.link))
      .filter(Boolean)
  ), [notificacoes]);
  const avisosDuplicadosNaoVisualizados = avisos.filter((aviso) => (
    !aviso.visualizado && avisosRepresentadosPorNotificacaoPendente.has(aviso.id)
  )).length;
  const totalNaoVisualizados = naoVisualizadas + Math.max(0, avisosNaoVisualizados - avisosDuplicadosNaoVisualizados);
  const itensCentralNotificacoes = useMemo(() => {
    const itensNotificacoes = notificacoes.map((notificacao) => ({
      ...notificacao,
      origem: 'notificacao',
      chave: `notificacao-${notificacao.id}`,
      visualizada: Boolean(notificacao.visualizada),
      dataOrdenacao: notificacao.criadoEm,
    }));
    const itensAvisos = avisos
      .filter((aviso) => {
        const temNotificacao = avisosRepresentadosPorNotificacao.has(aviso.id);
        const temNotificacaoPendente = avisosRepresentadosPorNotificacaoPendente.has(aviso.id);
        return !(temNotificacao && (aviso.visualizado || temNotificacaoPendente));
      })
      .map((aviso) => ({
        id: aviso.id,
        origem: 'aviso',
        chave: `aviso-${aviso.id}`,
        titulo: aviso.titulo,
        mensagem: aviso.mensagem,
        link: `/avisos?aviso=${aviso.id}`,
        visualizada: Boolean(aviso.visualizado),
        lidaEm: aviso.visualizadoEm,
        criadoEm: aviso.dataAviso || aviso.criadoEm,
        dataOrdenacao: aviso.dataAviso || aviso.criadoEm,
      }));

    return [...itensNotificacoes, ...itensAvisos].sort((a, b) => (
      new Date(b.dataOrdenacao || 0).getTime() - new Date(a.dataOrdenacao || 0).getTime()
    ));
  }, [avisos, avisosRepresentadosPorNotificacao, avisosRepresentadosPorNotificacaoPendente, notificacoes]);

  useEffect(() => {
    setFormPerfil(criarFormUsuario(usuario));
  }, [usuario]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'escuro');
    window.localStorage.setItem(THEME_KEY, tema);
  }, [tema]);

  useEffect(() => {
    const sincronizarTema = (event) => {
      const proximoTema = event.detail?.tema;
      if (['claro', 'escuro'].includes(proximoTema)) {
        setTema(proximoTema);
      }
    };

    window.addEventListener('mcom-theme-change', sincronizarTema);
    return () => window.removeEventListener('mcom-theme-change', sincronizarTema);
  }, []);

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

  const carregarAvisos = useCallback(async () => {
    if (!token) return;

    try {
      const resposta = await fetch(buildApiUrl('/api/avisos?visualizados=todos'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await resposta.json();

      if (resposta.ok) {
        setAvisos(dados.avisos || []);
        setAvisosNaoVisualizados(dados.totalNaoVisualizados || 0);
      }
    } catch {
      // Avisos também não devem bloquear a navegação.
    }
  }, [token]);

  useEffect(() => {
    carregarNotificacoes();
    carregarAvisos();
    const interval = window.setInterval(() => {
      carregarNotificacoes();
      carregarAvisos();
    }, 60 * 1000);

    return () => window.clearInterval(interval);
  }, [carregarAvisos, carregarNotificacoes]);

  useEffect(() => {
    if (!token || typeof EventSource === 'undefined') {
      return undefined;
    }

    const streamUrl = buildApiUrl(`/api/notificacoes/stream?token=${encodeURIComponent(token)}`);
    const source = new EventSource(streamUrl);

    source.addEventListener('notificacoes', (event) => {
      try {
        const dados = JSON.parse(event.data);
        setNotificacoes(dados.notificacoes || []);
        setNaoVisualizadas(dados.naoVisualizadas || 0);
        carregarAvisos();
        setCarregandoNotificacoes(false);
      } catch {
        carregarNotificacoes();
      }
    });

    source.addEventListener('erro', () => {
      carregarNotificacoes();
    });

    source.onerror = () => {
      source.close();
      window.setTimeout(carregarNotificacoes, 1500);
    };

    return () => source.close();
  }, [carregarAvisos, carregarNotificacoes, token]);

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
    carregarAvisos();
  };

  const visualizarItemCentral = async (itemCentral) => {
    if (!itemCentral.visualizada) {
      const agora = new Date().toISOString();

      if (itemCentral.origem === 'aviso') {
        setAvisos((atuais) => atuais.map((item) => (
          item.id === itemCentral.id ? { ...item, visualizado: true, visualizadoEm: agora } : item
        )));
        setAvisosNaoVisualizados((total) => Math.max(0, total - 1));

        fetch(buildApiUrl(`/api/avisos/${itemCentral.id}/visualizar`), {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => carregarAvisos());
      } else {
        setNotificacoes((atuais) => atuais.map((item) => (
          item.id === itemCentral.id ? { ...item, visualizada: true, lidaEm: agora } : item
        )));
        setNaoVisualizadas((total) => Math.max(0, total - 1));

        fetch(buildApiUrl(`/api/notificacoes/${itemCentral.id}/visualizar`), {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});

        if (itemCentral.tipo === 'AVISO') {
          const avisoId = extrairAvisoId(itemCentral.link);

          if (avisoId) {
            setAvisos((atuais) => atuais.map((item) => (
              item.id === avisoId ? { ...item, visualizado: true, visualizadoEm: agora } : item
            )));
            setAvisosNaoVisualizados((total) => Math.max(0, total - 1));

            fetch(buildApiUrl(`/api/avisos/${avisoId}/visualizar`), {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${token}` },
            }).catch(() => carregarAvisos());
          }
        }
      }
    }

    if (itemCentral.link) {
      navigate(itemCentral.link);
      setNotificacoesAberto(false);
    }
  };

  const visualizarTodas = async () => {
    const agora = new Date().toISOString();
    const avisosPendentes = avisos.filter((aviso) => !aviso.visualizado);

    setNotificacoes((atuais) => atuais.map((item) => ({ ...item, visualizada: true, lidaEm: item.lidaEm || agora })));
    setAvisos((atuais) => atuais.map((item) => ({ ...item, visualizado: true, visualizadoEm: item.visualizadoEm || agora })));
    setNaoVisualizadas(0);
    setAvisosNaoVisualizados(0);

    try {
      await Promise.all([
        fetch(buildApiUrl('/api/notificacoes/visualizar-todas'), {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        }),
        ...avisosPendentes.map((aviso) => fetch(buildApiUrl(`/api/avisos/${aviso.id}/visualizar`), {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        })),
      ]);
    } catch {
      carregarNotificacoes();
      carregarAvisos();
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
    <>
      <nav className="sticky top-0 z-[60] border-b border-gray-200 bg-white/95 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 justify-between md:h-16">
          
          {/* Logo / Título */}
          <div className="flex items-center">
            <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2">
              <img src={logo} alt="MCom" className="h-8 w-8 object-contain md:h-9 md:w-9" />
              <span className="text-lg font-bold text-gray-950 dark:text-white md:text-xl">MCom</span>
            </button>
          </div>

          {/* Links de Navegação - Desktop */}
          <div className="hidden md:flex md:items-center md:gap-7">
            <button type="button" onClick={() => irPara('/')} className="font-sans text-gray-600 hover:text-gray-950 transition-colors font-medium dark:text-gray-300 dark:hover:text-white">
              Início
            </button>
            <button type="button" onClick={() => irPara('/escalas')} className="font-sans text-gray-600 hover:text-gray-950 transition-colors font-medium dark:text-gray-300 dark:hover:text-white">
              Escalas
            </button>
            <button type="button" onClick={() => irPara('/manuais')} className="font-sans text-gray-600 hover:text-gray-950 transition-colors font-medium dark:text-gray-300 dark:hover:text-white">
              Manuais
            </button>
            {podeGerenciarEquipe && (
              <button type="button" onClick={() => irPara('/minha-equipe')} className="font-sans text-gray-600 hover:text-gray-950 transition-colors font-medium dark:text-gray-300 dark:hover:text-white">
                Equipe
              </button>
            )}
            {isAdmin && (
              <button type="button" onClick={() => irPara('/admin')} className="font-sans text-gray-600 hover:text-gray-950 transition-colors font-medium dark:text-gray-300 dark:hover:text-white">
                Admin
              </button>
            )}
            
          </div>

          {/* Ações do Usuário - Desktop */}
          <div className="hidden md:flex items-center space-x-4">
            <button
              type="button"
              onClick={abrirNotificacoes}
              className="relative grid h-10 w-10 place-items-center rounded-full border border-gray-200 bg-white text-gray-600 transition hover:border-gray-400 hover:text-gray-950 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:text-white"
              aria-label="Abrir notificações"
            >
              <Bell size={18} />
              {totalNaoVisualizados > 0 && (
                <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-gray-950 px-1 text-[10px] font-bold text-white">
                  {totalNaoVisualizados > 99 ? '99+' : totalNaoVisualizados}
                </span>
              )}
            </button>
            <button type="button" onClick={abrirPerfil} className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-950 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:text-white">
              <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-200">
                {usuarioAvatarUrl ? (
                  <img src={usuarioAvatarUrl} alt="" className="h-full w-full object-cover" />
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
              className="relative mr-1 grid h-10 w-10 place-items-center rounded-full border border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              aria-label="Abrir notificações"
            >
              <Bell size={18} />
              {totalNaoVisualizados > 0 && (
                <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-gray-950 px-1 text-[10px] font-bold text-white">
                  {totalNaoVisualizados > 99 ? '99+' : totalNaoVisualizados}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={abrirPerfil}
              className="grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              aria-label="Abrir perfil"
            >
              {usuarioAvatarUrl ? (
                <img src={usuarioAvatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <User size={19} />
              )}
            </button>
          </div>
          </div>
        </div>
      </nav>

      {notificacoesAberto && (
        <div className="fixed inset-x-0 bottom-0 top-14 z-[70] overflow-hidden rounded-t-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950 md:absolute md:inset-x-auto md:bottom-auto md:right-8 md:top-[4.5rem] md:max-h-[calc(100vh-6rem)] md:w-[calc(100vw-2rem)] md:max-w-md md:rounded-lg">
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
            <div>
              <h2 className="text-base font-bold text-gray-950 dark:text-white">Notificações</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {totalNaoVisualizados > 0 ? `${totalNaoVisualizados} não visualizada(s)` : 'Tudo visualizado por aqui.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={visualizarTodas}
                disabled={totalNaoVisualizados === 0}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <CheckCheck size={14} />
                Marcar todas
              </button>
              <button type="button" onClick={() => setNotificacoesAberto(false)} className="rounded-full border border-gray-200 bg-white p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white" aria-label="Fechar notificações">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="max-h-[calc(100vh-8rem)] overflow-y-auto md:max-h-[70vh]">
            {carregandoNotificacoes && notificacoes.length === 0 ? (
              <div className="flex items-center gap-2 px-5 py-8 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando notificações...
              </div>
            ) : itensCentralNotificacoes.length === 0 ? (
              <div className="px-5 py-8 text-sm text-gray-500 dark:text-gray-400">
                Nenhum aviso ou notificação por enquanto.
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {itensCentralNotificacoes.map((itemCentral) => (
                  <button
                    key={itemCentral.chave}
                    type="button"
                    onClick={() => visualizarItemCentral(itemCentral)}
                    className={`block w-full px-5 py-4 text-left transition hover:bg-gray-50 dark:hover:bg-gray-900 ${
                      itemCentral.visualizada ? 'bg-white dark:bg-gray-950' : 'bg-gray-50 dark:bg-gray-900/80'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${itemCentral.visualizada ? 'bg-gray-300 dark:bg-gray-600' : 'bg-gray-950 dark:bg-white'}`} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold text-gray-950 dark:text-white">{itemCentral.titulo}</p>
                          <span className="rounded-full border border-gray-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 dark:border-gray-700 dark:text-gray-400">
                            {itemCentral.origem === 'aviso' ? 'Aviso' : 'Notificação'}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-5 text-gray-600 dark:text-gray-300">{itemCentral.mensagem}</p>
                        <p className="mt-2 text-xs font-semibold text-gray-400 dark:text-gray-500">{formatarDataNotificacao(itemCentral.criadoEm)}</p>
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
        <div className="fixed inset-x-0 bottom-0 top-14 z-[70] overflow-hidden rounded-t-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950 md:absolute md:inset-x-auto md:bottom-auto md:right-8 md:top-[4.5rem] md:w-[calc(100vw-2rem)] md:max-w-xl md:rounded-lg">
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                disabled={!editandoPerfil || enviandoFoto}
                onClick={() => {
                  if (editandoPerfil) fotoInputRef.current?.click();
                }}
                className="group relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gray-950 text-white disabled:cursor-default dark:bg-gray-800"
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
                <p className="truncate text-lg font-bold text-gray-950 dark:text-white">{usuario?.nomeCompleto || 'Usuário'}</p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">{usuario?.email || '-'}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(usuario?.permissoes || []).map((permissao) => (
                    <span key={permissao} className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                      <BadgeCheck size={11} />
                      {permissao.replaceAll('_', ' ')}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('mcom-open-settings'))}
                className="grid h-9 w-9 place-items-center rounded-full border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
                aria-label="Abrir configurações do app"
              >
                <Settings size={16} />
              </button>
              <button type="button" onClick={() => setPerfilAberto(false)} className="rounded-full border border-gray-200 bg-white p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white" aria-label="Fechar perfil">
                <X size={17} />
              </button>
            </div>
          </div>

          <div className="max-h-[calc(100vh-7rem)] overflow-y-auto px-5 py-4">
            {erroPerfil && (
              <div className="mb-4 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                {erroPerfil}
              </div>
            )}
            {sucessoPerfil && (
              <div className="mb-4 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
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
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) enviarFoto(file);
                  event.target.value = '';
                }}
              />
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-gray-950 dark:text-white">Minhas informações</h2>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {editandoPerfil ? 'Edite seus dados, foto e senha.' : 'Resumo rápido da sua conta.'}
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
                  className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  {editandoPerfil ? 'Cancelar edição' : 'Editar'}
                </button>
              </div>

              {!editandoPerfil ? (
                <div className="grid gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500 dark:text-gray-400">Telefone</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{formatarTelefoneExibicao(usuario?.telefone) || 'Não informado'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500 dark:text-gray-400">Nascimento</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{usuario?.dataNascimento || 'Não informado'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500 dark:text-gray-400">Sexo</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {sexoOptions.find((option) => option.value === usuario?.sexo)?.label || 'Não informado'}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={enviandoFoto}
                      onClick={() => fotoInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-bold text-gray-800 shadow-sm transition hover:bg-gray-100 disabled:opacity-60 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-800"
                    >
                      {enviandoFoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon size={16} />}
                      Escolher da galeria
                    </button>
                    <button
                      type="button"
                      disabled={enviandoFoto}
                      onClick={() => cameraInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-bold text-gray-800 shadow-sm transition hover:bg-gray-100 disabled:opacity-60 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-800"
                    >
                      {enviandoFoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera size={16} />}
                      Tirar foto
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <CampoPerfil label="Nome completo" value={formPerfil.nomeCompleto} onChange={(value) => setFormPerfil((atual) => ({ ...atual, nomeCompleto: value }))} />
                    <CampoPerfil label="E-mail" disabled value={usuario?.email || ''} onChange={() => {}} />
                    <PhoneInput value={formPerfil.telefone} onChange={(telefone) => setFormPerfil((atual) => ({ ...atual, telefone }))} />
                    <CampoPerfil label="Data de nascimento" type="date" value={formPerfil.dataNascimento} onChange={(value) => setFormPerfil((atual) => ({ ...atual, dataNascimento: value }))} />
                    <label className="block">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Sexo</span>
                      <select
                        value={formPerfil.sexo}
                        onChange={(event) => setFormPerfil((atual) => ({ ...atual, sexo: event.target.value }))}
                        className="mt-2 block w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition disabled:bg-gray-50 disabled:text-gray-500 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                      >
                        {sexoOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </>
              )}

              {editandoPerfil && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="submit"
                    disabled={salvandoPerfil}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                  >
                    {salvandoPerfil ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
                    Salvar dados
                  </button>
                  <button
                    type="button"
                    disabled={enviandoFoto || !formPerfil.urlFoto}
                    onClick={removerFoto}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-red-100 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:bg-gray-900 dark:text-red-200 dark:hover:bg-red-950/30"
                  >
                    {enviandoFoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 size={16} />}
                    Remover foto
                  </button>
                </div>
              )}
            </form>

            {editandoPerfil && (
              <form onSubmit={alterarSenha} className="mt-5 space-y-3 border-t border-gray-100 pt-5 dark:border-gray-800">
                <div>
                  <h3 className="text-base font-bold text-gray-950 dark:text-white">Alterar senha</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">A nova senha precisa ter no mínimo 6 dígitos.</p>
                </div>
                <CampoPerfil label="Senha antiga" type="password" value={formSenha.senhaAtual} onChange={(value) => setFormSenha((atual) => ({ ...atual, senhaAtual: value }))} />
                <CampoPerfil label="Nova senha" type="password" value={formSenha.novaSenha} onChange={(value) => setFormSenha((atual) => ({ ...atual, novaSenha: value }))} />
                <CampoPerfil label="Confirmar nova senha" type="password" value={formSenha.confirmarNovaSenha} onChange={(value) => setFormSenha((atual) => ({ ...atual, confirmarNovaSenha: value }))} />
                <button
                  type="submit"
                  disabled={salvandoSenha}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                >
                  {salvandoSenha ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
                  Alterar senha
                </button>
              </form>
            )}

            <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-red-100 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-900/60 dark:bg-gray-900 dark:text-red-200 dark:hover:bg-red-950/30"
              >
                <LogOut size={16} />
                Sair da conta
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CampoPerfil({ label, value, onChange, type = 'text', disabled = false }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 block w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition disabled:bg-gray-50 disabled:text-gray-500 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800 dark:disabled:text-gray-500"
      />
    </label>
  );
}

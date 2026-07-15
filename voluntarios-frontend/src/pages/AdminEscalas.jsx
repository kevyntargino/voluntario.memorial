import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Loader2,
  Megaphone,
  ArrowDownUp,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserCog,
  UsersRound,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import { Footer } from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { buildApiUrl } from '../lib/api';

const dias = [
  { value: 0, label: 'Domingo' },
  { value: 6, label: 'Sábado' },
];
const semanas = [1, 2, 3, 4];
const permissoesDisponiveis = ['VOLUNTARIO', 'ADMINISTRADOR'];

const statusConfig = {
  PENDENTE: { label: 'Pendente', className: 'border-amber-200 bg-amber-50 text-amber-700', icon: Clock3 },
  CONFIRMADA: { label: 'Confirmada', className: 'border-emerald-200 bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  PEDIU_SUBSTITUICAO: { label: 'Substituição', className: 'border-sky-200 bg-sky-50 text-sky-700', icon: RefreshCcw },
  AUSENTE: { label: 'Ausente', className: 'border-red-200 bg-red-50 text-red-700', icon: AlertCircle },
};

const formEsporadicaInicial = { titulo: '', data: '', horarios: ['09:00'], local: '', descricao: '', equipeIds: [] };
const formAvisoInicial = { titulo: '', mensagem: '', dataAviso: '', publico: 'TODOS', equipeIds: [], usuarioIds: [] };
const formEquipeInicial = { nome: '' };
const filtrosTipoEscala = [
  { value: 'TODAS', label: 'Todas' },
  { value: 'RECORRENTE', label: 'Recorrentes' },
  { value: 'ESPORADICA', label: 'Esporádicas' },
];
const filtrosRecorrentes = [0, 6].flatMap((diaSemana) => (
  semanas.map((semanaMes) => ({
    value: `${diaSemana}-${semanaMes}`,
    diaSemana,
    semanaMes,
    label: `${semanaMes}º ${diaSemana === 0 ? 'Domingo' : 'Sábado'}`,
  }))
));

function formatarData(dataHora) {
  if (!dataHora) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(dataHora));
}

function toTime(dataHora) {
  if (!dataHora) return '18:00';
  return new Date(dataHora).toISOString().slice(11, 16);
}

function criarFormUsuario(usuario) {
  return {
    nomeCompleto: usuario.nomeCompleto || '',
    telefone: usuario.telefone || '',
    permissoes: usuario.permissoes || ['VOLUNTARIO'],
    equipeIds: usuario.equipes?.map((equipe) => equipe.id) || [],
    liderEquipeIds: usuario.equipesLideradas?.map((equipe) => equipe.id) || [],
  };
}

export default function AdminEscalas() {
  const { token, usuario, logout } = useAuth();
  const { navigate, pathname } = useNavigation();
  const [dashboard, setDashboard] = useState(null);
  const [equipes, setEquipes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [recorrentes, setRecorrentes] = useState([]);
  const [esporadicas, setEsporadicas] = useState([]);
  const [formsUsuarios, setFormsUsuarios] = useState({});
  const [formRecorrentes, setFormRecorrentes] = useState({});
  const [formEsporadica, setFormEsporadica] = useState(formEsporadicaInicial);
  const [formAviso, setFormAviso] = useState(formAvisoInicial);
  const getPainelPelaRota = useCallback(() => {
    if (pathname === '/admin/voluntarios') return 'voluntarios';
    if (pathname === '/admin/lideres') return 'lideres';
    if (pathname === '/admin/equipes') return 'equipes';
    if (pathname === '/admin/notificacoes') return 'notificacao';
    if (pathname === '/admin/escalas') return 'escalas';
    return 'visao';
  }, [pathname]);
  const [painelAberto, setPainelAberto] = useState(() => getPainelPelaRota());
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [editandoUsuarioId, setEditandoUsuarioId] = useState(null);
  const [equipeSelecionadaId, setEquipeSelecionadaId] = useState(null);
  const [formEquipe, setFormEquipe] = useState(formEquipeInicial);
  const [tipoEscalas, setTipoEscalas] = useState('TODAS');
  const [filtroRecorrenciaAdmin, setFiltroRecorrenciaAdmin] = useState('TODAS');
  const [buscaEscalas, setBuscaEscalas] = useState('');
  const [ordemEscalas, setOrdemEscalas] = useState('proximas');
  const [escalaEditandoId, setEscalaEditandoId] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState(null);
  const isAdmin = usuario?.permissoes?.includes('ADMINISTRADOR');

  const carregarDados = useCallback(async () => {
    setErro('');
    setCarregando(true);

    try {
      const [respostaDashboard, respostaEscalas] = await Promise.all([
        fetch(buildApiUrl('/api/admin/dashboard'), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(buildApiUrl('/api/escalas/admin'), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const dadosDashboard = await respostaDashboard.json();
      const dadosEscalas = await respostaEscalas.json();

      if (!respostaDashboard.ok || !respostaEscalas.ok) {
        if (respostaDashboard.status === 401 || respostaEscalas.status === 401) {
          logout();
          navigate('/login', { replace: true });
          return;
        }

        throw new Error(dadosDashboard.erro || dadosEscalas.erro || 'Não foi possível carregar o painel administrativo.');
      }

      setDashboard(dadosDashboard);
      setEquipes(dadosDashboard.equipes || []);
      setUsuarios(dadosDashboard.usuarios || []);
      setRecorrentes(dadosEscalas.recorrentes || []);
      setEsporadicas(dadosEscalas.esporadicas || []);
      setFormsUsuarios(Object.fromEntries((dadosDashboard.usuarios || []).map((item) => [item.id, criarFormUsuario(item)])));
      setFormRecorrentes(Object.fromEntries((dadosEscalas.recorrentes || []).map((escala) => [
        escala.id,
        {
          titulo: escala.titulo || '',
          diaSemana: escala.diaSemana ?? 0,
          semanaMes: escala.semanaMes || 1,
          horario: toTime(escala.dataHora),
        },
      ])));
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar o painel administrativo.');
    } finally {
      setCarregando(false);
    }
  }, [logout, navigate, token]);

  useEffect(() => {
    if (isAdmin) carregarDados();
  }, [carregarDados, isAdmin]);

  useEffect(() => {
    setPainelAberto(getPainelPelaRota());
  }, [getPainelPelaRota]);

  const abrirPainel = (painel, rota) => {
    setPainelAberto(painel);
    navigate(rota);
  };

  const lideres = useMemo(() => usuarios.filter((item) => item.permissoes?.includes('LIDER_EQUIPE') || item.equipesLideradas?.length > 0), [usuarios]);
  const usuariosDoPainel = painelAberto === 'lideres' ? lideres : usuarios;
  const equipeSelecionada = useMemo(
    () => equipes.find((equipe) => equipe.id === equipeSelecionadaId) || null,
    [equipeSelecionadaId, equipes],
  );

  const eventosEscalas = useMemo(() => {
    const termo = buscaEscalas.trim().toLowerCase();
    const todasEscalas = [...recorrentes, ...esporadicas];
    const filtradas = todasEscalas.filter((escala) => (
      (tipoEscalas === 'TODAS' || escala.tipo === tipoEscalas)
      && (tipoEscalas !== 'RECORRENTE' || filtroRecorrenciaAdmin === 'TODAS' || (() => {
        const filtro = filtrosRecorrentes.find((item) => item.value === filtroRecorrenciaAdmin);
        return !filtro || (escala.diaSemana === filtro.diaSemana && escala.semanaMes === filtro.semanaMes);
      })())
      && (!termo || [
        escala.titulo,
        escala.equipe?.nome,
        escala.local,
        escala.descricao,
        escala.voluntarios?.map((item) => item.usuario?.nomeCompleto).join(' '),
      ].filter(Boolean).join(' ').toLowerCase().includes(termo))
    ));
    const eventos = new Map();

    for (const escala of filtradas) {
      const data = escala.dataHora ? new Date(escala.dataHora).toISOString() : 'sem-data';
      const chave = escala.tipo === 'ESPORADICA'
        ? `ESPORADICA:${escala.grupoEsporadicoId || escala.id}`
        : `RECORRENTE:${escala.diaSemana}:${escala.semanaMes}:${data}:${escala.titulo || ''}`;
      const evento = eventos.get(chave) || {
        id: chave,
        titulo: escala.titulo || 'Escala sem título',
        tipo: escala.tipo,
        dataHora: escala.dataHora,
        local: escala.local,
        descricao: escala.descricao,
        diaSemana: escala.diaSemana,
        semanaMes: escala.semanaMes,
        areas: [],
      };

      evento.areas.push(escala);
      eventos.set(chave, evento);
    }

    return Array.from(eventos.values()).sort((a, b) => (
      ordemEscalas === 'distantes'
        ? new Date(b.dataHora || 0).getTime() - new Date(a.dataHora || 0).getTime()
        : new Date(a.dataHora || 0).getTime() - new Date(b.dataHora || 0).getTime()
    ));
  }, [buscaEscalas, esporadicas, filtroRecorrenciaAdmin, ordemEscalas, recorrentes, tipoEscalas]);

  const alterarFormUsuario = (usuarioId, campo, valor) => {
    setFormsUsuarios((atuais) => ({
      ...atuais,
      [usuarioId]: { ...(atuais[usuarioId] || {}), [campo]: valor },
    }));
  };

  const alternarPermissao = (usuarioId, permissao) => {
    setFormsUsuarios((atuais) => {
      const atual = atuais[usuarioId] || {};
      const permissoes = atual.permissoes || [];
      const proximas = permissoes.includes(permissao)
        ? permissoes.filter((item) => item !== permissao)
        : [...permissoes, permissao];
      return {
        ...atuais,
        [usuarioId]: {
          ...atual,
          permissoes: proximas,
          liderEquipeIds: proximas.includes('LIDER_EQUIPE') ? atual.liderEquipeIds || [] : [],
        },
      };
    });
  };

  const alternarEquipeUsuario = (usuarioId, equipeId) => {
    setFormsUsuarios((atuais) => {
      const atual = atuais[usuarioId] || {};
      const equipeIds = atual.equipeIds || [];
      const proximas = equipeIds.includes(equipeId)
        ? equipeIds.filter((id) => id !== equipeId)
        : [...equipeIds, equipeId];
      return { ...atuais, [usuarioId]: { ...atual, equipeIds: proximas } };
    });
  };

  const alternarLiderEquipeUsuario = (usuarioId, equipeId) => {
    setFormsUsuarios((atuais) => {
      const atual = atuais[usuarioId] || {};
      const liderEquipeIds = atual.liderEquipeIds || [];
      const proximas = liderEquipeIds.includes(equipeId)
        ? liderEquipeIds.filter((id) => id !== equipeId)
        : [...liderEquipeIds, equipeId];
      const permissoes = (atual.permissoes || []).filter((permissao) => permissao !== 'LIDER_EQUIPE');

      return {
        ...atuais,
        [usuarioId]: {
          ...atual,
          liderEquipeIds: proximas,
          permissoes: proximas.length > 0
            ? [...permissoes, 'LIDER_EQUIPE']
            : permissoes,
        },
      };
    });
  };

  const salvarUsuario = async (usuarioId) => {
    setErro('');
    setSucesso('');
    setSalvandoId(usuarioId);
    try {
      const resposta = await fetch(buildApiUrl(`/api/admin/usuarios/${usuarioId}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(formsUsuarios[usuarioId]),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível salvar o usuário.');
      setSucesso(dados.mensagem || 'Usuário atualizado.');
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível salvar o usuário.');
    } finally {
      setSalvandoId(null);
    }
  };

  const excluirUsuario = async (usuarioId) => {
    setErro('');
    setSucesso('');
    setSalvandoId(usuarioId);
    try {
      const resposta = await fetch(buildApiUrl(`/api/admin/usuarios/${usuarioId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível excluir o usuário.');
      setSucesso(dados.mensagem || 'Usuário excluído.');
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível excluir o usuário.');
    } finally {
      setSalvandoId(null);
    }
  };

  const criarEquipe = async (event) => {
    event.preventDefault();
    setErro('');
    setSucesso('');
    setSalvandoId('equipe');

    try {
      const resposta = await fetch(buildApiUrl('/api/admin/equipes'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(formEquipe),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível criar a equipe.');
      setSucesso(dados.mensagem || 'Equipe criada.');
      setFormEquipe(formEquipeInicial);
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível criar a equipe.');
    } finally {
      setSalvandoId(null);
    }
  };

  const excluirEquipe = async (equipeId) => {
    setErro('');
    setSucesso('');
    setSalvandoId(equipeId);

    try {
      const resposta = await fetch(buildApiUrl(`/api/admin/equipes/${equipeId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível excluir a equipe.');
      setSucesso(dados.mensagem || 'Equipe excluída.');
      setEquipeSelecionadaId(null);
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível excluir a equipe.');
    } finally {
      setSalvandoId(null);
    }
  };

  const alterarRecorrente = (escalaId, campo, valor) => {
    setFormRecorrentes((atuais) => ({ ...atuais, [escalaId]: { ...(atuais[escalaId] || {}), [campo]: valor } }));
  };

  const salvarRecorrente = async (escalaId) => {
    setErro('');
    setSucesso('');
    setSalvandoId(escalaId);
    try {
      const resposta = await fetch(buildApiUrl(`/api/escalas/admin/recorrentes/${escalaId}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(formRecorrentes[escalaId]),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível salvar a escala recorrente.');
      setSucesso(dados.mensagem || 'Escala recorrente atualizada.');
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível salvar a escala recorrente.');
    } finally {
      setSalvandoId(null);
    }
  };

  const alternarEquipe = (campo, equipeId) => {
    const setter = campo === 'aviso' ? setFormAviso : setFormEsporadica;
    setter((atual) => ({
      ...atual,
      equipeIds: atual.equipeIds.includes(equipeId)
        ? atual.equipeIds.filter((id) => id !== equipeId)
        : [...atual.equipeIds, equipeId],
    }));
  };

  const alternarUsuarioAviso = (usuarioId) => {
    setFormAviso((atual) => ({
      ...atual,
      usuarioIds: atual.usuarioIds.includes(usuarioId)
        ? atual.usuarioIds.filter((id) => id !== usuarioId)
        : [...atual.usuarioIds, usuarioId],
    }));
  };

  const criarAviso = async (event) => {
    event.preventDefault();
    setErro('');
    setSucesso('');
    setSalvandoId('aviso');
    try {
      const resposta = await fetch(buildApiUrl('/api/avisos/admin'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(formAviso),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível enviar a notificação.');
      setSucesso(dados.mensagem || 'Notificação enviada.');
      setFormAviso(formAvisoInicial);
    } catch (error) {
      setErro(error.message || 'Não foi possível enviar a notificação.');
    } finally {
      setSalvandoId(null);
    }
  };

  const criarEsporadica = async (event) => {
    event.preventDefault();
    setErro('');
    setSucesso('');
    setSalvandoId('esporadica');

    const dataHoras = (formEsporadica.horarios || [])
      .filter((horario) => horario)
      .map((horario) => `${formEsporadica.data}T${horario}`);

    try {
      const resposta = await fetch(buildApiUrl('/api/escalas/admin/esporadicas'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formEsporadica,
          dataHoras,
        }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível criar a escala esporádica.');
      setSucesso(dados.mensagem || 'Escala esporádica enviada aos líderes.');
      setFormEsporadica(formEsporadicaInicial);
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível criar a escala esporádica.');
    } finally {
      setSalvandoId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#f7f4ed] text-gray-900">
        <Navbar />
        <main className="mx-auto max-w-4xl px-4 py-10">
          <div className="rounded-lg border border-red-100 bg-red-50 p-5 text-red-700">Acesso restrito a administradores.</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f4ed] text-gray-900">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-dourado-700">Administração MCom</p>
              <h1 className="mt-2 text-3xl font-bold text-gray-950">Dashboard administrativo</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
                Acompanhe equipes, voluntários, ausências e gerencie acessos, escalas e notificações.
              </p>
            </div>
            <button onClick={() => abrirPainel('notificacao', '/admin/notificacoes')} className="inline-flex items-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800">
              <Bell size={16} />
              Enviar notificação
            </button>
          </div>
        </section>

        {erro && <Feedback tipo="erro" mensagem={erro} />}
        {sucesso && <Feedback tipo="sucesso" mensagem={sucesso} />}

        {carregando ? (
          <div className="mt-5 flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-6 py-12 text-gray-500 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando dashboard...
          </div>
        ) : (
          <>
            <section className="mt-5 grid gap-4 md:grid-cols-3">
              <Metrica titulo="Total de voluntários" valor={dashboard?.metricas?.totalVoluntarios || 0} icon={UsersRound} />
              <Metrica titulo="Total de equipes" valor={dashboard?.metricas?.totalEquipes || 0} icon={ShieldCheck} />
              <Metrica titulo="Ausências nas últimas 4 escalas" valor={dashboard?.metricas?.ausenciasUltimas4 || 0} icon={AlertCircle} destaque />
            </section>

            <section className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <ProximaEscala escala={dashboard?.proximaEscala} />

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-gray-950">Ações rápidas</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <BotaoPainel ativo={painelAberto === 'voluntarios'} icon={UsersRound} label="Ver voluntários" onClick={() => abrirPainel('voluntarios', '/admin/voluntarios')} />
                  <BotaoPainel ativo={painelAberto === 'lideres'} icon={UserCog} label="Ver líderes de equipe" onClick={() => abrirPainel('lideres', '/admin/lideres')} />
                  <BotaoPainel ativo={painelAberto === 'equipes'} icon={ShieldCheck} label="Ver equipes" onClick={() => abrirPainel('equipes', '/admin/equipes')} />
                  <BotaoPainel ativo={painelAberto === 'notificacao'} icon={Megaphone} label="Enviar notificação" onClick={() => abrirPainel('notificacao', '/admin/notificacoes')} />
                  <BotaoPainel ativo={painelAberto === 'escalas'} icon={CalendarClock} label="Gerenciar escalas" onClick={() => abrirPainel('escalas', '/admin/escalas')} />
                </div>
              </div>
            </section>

            {['voluntarios', 'lideres'].includes(painelAberto) && (
              <PainelUsuarios
                titulo={painelAberto === 'lideres' ? 'Líderes de equipe' : 'Voluntários e usuários'}
                usuarios={usuariosDoPainel}
                equipes={equipes}
                formsUsuarios={formsUsuarios}
                salvandoId={salvandoId}
                onAlterar={alterarFormUsuario}
                onAlternarPermissao={alternarPermissao}
                onAlternarEquipe={alternarEquipeUsuario}
                onAlternarLiderEquipe={alternarLiderEquipeUsuario}
                onSalvar={salvarUsuario}
                onExcluir={excluirUsuario}
                editandoUsuarioId={editandoUsuarioId}
                onEditar={setEditandoUsuarioId}
              />
            )}

            {painelAberto === 'equipes' && (
              <PainelEquipes
                equipes={equipes}
                equipeSelecionada={equipeSelecionada}
                formEquipe={formEquipe}
                salvandoId={salvandoId}
                onChangeEquipe={setFormEquipe}
                onCriarEquipe={criarEquipe}
                onExcluirEquipe={excluirEquipe}
                onSelecionarEquipe={setEquipeSelecionadaId}
              />
            )}

            {painelAberto === 'notificacao' && (
              <PainelNotificacao
                equipes={equipes}
                usuarios={usuarios}
                formAviso={formAviso}
                salvandoId={salvandoId}
                onSubmit={criarAviso}
                onChange={setFormAviso}
                onAlternarEquipe={(equipeId) => alternarEquipe('aviso', equipeId)}
                onAlternarUsuario={alternarUsuarioAviso}
              />
            )}

            {painelAberto === 'escalas' && (
              <PainelEscalas
                equipes={equipes}
                eventos={eventosEscalas}
                tipoEscalas={tipoEscalas}
                filtroRecorrencia={filtroRecorrenciaAdmin}
                buscaEscalas={buscaEscalas}
                ordemEscalas={ordemEscalas}
                escalaEditandoId={escalaEditandoId}
                esporadicas={esporadicas}
                formRecorrentes={formRecorrentes}
                formEsporadica={formEsporadica}
                salvandoId={salvandoId}
                onAlterarRecorrente={alterarRecorrente}
                onSalvarRecorrente={salvarRecorrente}
                onTipoEscalas={setTipoEscalas}
                onFiltroRecorrencia={setFiltroRecorrenciaAdmin}
                onBuscaEscalas={setBuscaEscalas}
                onOrdemEscalas={setOrdemEscalas}
                onEditarEscala={setEscalaEditandoId}
                onChangeEsporadica={setFormEsporadica}
                onAlternarEquipe={(equipeId) => alternarEquipe('esporadica', equipeId)}
                onCriarEsporadica={criarEsporadica}
              />
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

function Metrica({ titulo, valor, icon: Icon, destaque = false }) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${destaque ? 'border-red-100 bg-red-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">{titulo}</p>
        <Icon className={`h-5 w-5 ${destaque ? 'text-red-600' : 'text-dourado-600'}`} />
      </div>
      <p className="mt-4 text-4xl font-bold text-gray-950">{valor}</p>
    </div>
  );
}

function BotaoPainel({ ativo, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm font-bold transition ${
        ativo ? 'border-gray-950 bg-gray-950 text-white' : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300'
      }`}
    >
      <Icon size={18} />
      {label}
    </button>
  );
}

function ProximaEscala({ escala }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-gray-950">Próxima escala da semana</h2>
      {!escala ? (
        <p className="mt-3 text-sm text-gray-500">Nenhuma escala futura encontrada.</p>
      ) : (
        <div className="mt-4">
          <p className="text-sm font-bold text-gray-950">{escala.titulo || 'Escala sem título'}</p>
          <p className="mt-1 text-sm text-gray-500">{escala.equipe?.nome} - {formatarData(escala.dataHora)}</p>
          {escala.local && <p className="mt-1 text-xs text-gray-500">Local: {escala.local}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {(escala.voluntarios || []).map((item) => {
              const config = statusConfig[item.status] || statusConfig.PENDENTE;
              const Icon = config.icon;
              return (
                <div key={item.id} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <p className="text-sm font-semibold text-gray-800">{item.usuario.nomeCompleto}</p>
                    {item.usuario.telefone && (
                      <span className="text-[11px] font-medium text-gray-400">{item.usuario.telefone}</span>
                    )}
                  </div>
                  <span className={`mt-1 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${config.className}`}>
                    <Icon size={11} />
                    {config.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function PainelUsuarios({ titulo, usuarios, equipes, formsUsuarios, salvandoId, editandoUsuarioId, onEditar, onAlterar, onAlternarPermissao, onAlternarEquipe, onAlternarLiderEquipe, onSalvar, onExcluir }) {
  return (
    <section className="mt-5 rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-lg font-bold text-gray-950">{titulo}</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {usuarios.map((usuario) => {
          const form = formsUsuarios[usuario.id] || criarFormUsuario(usuario);
          const editando = editandoUsuarioId === usuario.id;

          return (
            <div key={usuario.id} className="px-5 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <p className="text-base font-bold text-gray-950">{usuario.nomeCompleto}</p>
                    {usuario.telefone && (
                      <span className="text-xs font-medium text-gray-400">{usuario.telefone}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-500">{usuario.email}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(usuario.permissoes || []).map((permissao) => (
                      <span key={permissao} className="rounded border border-dourado-200 bg-dourado-50 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-dourado-700">
                        {permissao.replaceAll('_', ' ')}
                      </span>
                    ))}
                    {(usuario.equipes || []).map((equipe) => (
                      <span key={equipe.id} className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-600">
                        Voluntário: {equipe.nome}
                      </span>
                    ))}
                    {(usuario.equipesLideradas || []).map((equipe) => (
                      <span key={equipe.id} className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-700">
                        Líder: {equipe.nome}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onEditar(editando ? null : usuario.id)} className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    {editando ? 'Fechar edição' : 'Editar'}
                  </button>
                  <button type="button" disabled={salvandoId === usuario.id} onClick={() => onExcluir(usuario.id)} className="inline-flex items-center justify-center gap-2 rounded-md border border-red-100 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">
                    <Trash2 size={15} />
                    Excluir
                  </button>
                </div>
              </div>

              {editando && (
                <div className="mt-4 grid gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 xl:grid-cols-[1fr_1fr_auto]">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo label="Nome" value={form.nomeCompleto} onChange={(value) => onAlterar(usuario.id, 'nomeCompleto', value)} />
                    <Campo label="Telefone" value={form.telefone} onChange={(value) => onAlterar(usuario.id, 'telefone', value)} />
                  </div>
                  <div className="grid gap-3">
                    <GrupoChecks titulo="Acessos">
                      {permissoesDisponiveis.map((permissao) => (
                        <label key={permissao} className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                          <input type="checkbox" checked={form.permissoes.includes(permissao)} onChange={() => onAlternarPermissao(usuario.id, permissao)} />
                          {permissao.replaceAll('_', ' ')}
                        </label>
                      ))}
                    </GrupoChecks>
                    <GrupoChecks titulo="Participa como voluntário">
                      {equipes.map((equipe) => (
                        <label key={equipe.id} className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                          <input type="checkbox" checked={form.equipeIds.includes(equipe.id)} onChange={() => onAlternarEquipe(usuario.id, equipe.id)} />
                          {equipe.nome}
                        </label>
                      ))}
                    </GrupoChecks>
                    <GrupoChecks titulo="Lidera equipe">
                      {equipes.map((equipe) => (
                        <label key={equipe.id} className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                          <input
                            type="checkbox"
                            checked={(form.liderEquipeIds || []).includes(equipe.id)}
                            onChange={() => onAlternarLiderEquipe(usuario.id, equipe.id)}
                          />
                          {equipe.nome}
                        </label>
                      ))}
                      <p className="sm:col-span-2 text-xs leading-5 text-gray-500">
                        O acesso de líder é aplicado automaticamente apenas para as equipes marcadas aqui.
                      </p>
                    </GrupoChecks>
                  </div>
                  <div className="flex items-end">
                    <button type="button" disabled={salvandoId === usuario.id} onClick={() => onSalvar(usuario.id)} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gray-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                      {salvandoId === usuario.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={15} />}
                      Salvar edição
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PainelEquipes({ equipes, equipeSelecionada, formEquipe, salvandoId, onChangeEquipe, onCriarEquipe, onExcluirEquipe, onSelecionarEquipe }) {
  return (
    <section className="mt-5 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-bold text-gray-950">Equipes cadastradas</h2>
        </div>
        <form onSubmit={onCriarEquipe} className="flex gap-2 border-b border-gray-100 p-5">
          <input
            value={formEquipe.nome}
            onChange={(event) => onChangeEquipe((atual) => ({ ...atual, nome: event.target.value }))}
            className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
            placeholder="Nome da nova equipe"
          />
          <button disabled={salvandoId === 'equipe'} className="inline-flex items-center gap-2 rounded-md bg-gray-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {salvandoId === 'equipe' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus size={15} />}
            Criar
          </button>
        </form>
        <div className="divide-y divide-gray-100">
          {equipes.map((equipe) => (
            <div key={equipe.id} className="flex items-center justify-between gap-3 px-5 py-4">
              <button type="button" onClick={() => onSelecionarEquipe(equipe.id)} className="min-w-0 text-left">
                <p className="truncate text-sm font-bold text-gray-950">{equipe.nome}</p>
                <p className="mt-1 text-xs text-gray-500">{equipe.voluntarios?.length || 0} voluntário(s)</p>
              </button>
              <button type="button" disabled={salvandoId === equipe.id} onClick={() => onExcluirEquipe(equipe.id)} className="rounded-md border border-red-100 bg-white p-2 text-red-600 hover:bg-red-50 disabled:opacity-60" title="Excluir equipe">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        {!equipeSelecionada ? (
          <div className="p-8 text-sm text-gray-500">
            Clique em uma equipe para ver o líder e os voluntários cadastrados.
          </div>
        ) : (
          <>
            <div className="border-b border-gray-100 px-5 py-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-dourado-700">Equipe</p>
              <h2 className="mt-1 text-2xl font-bold text-gray-950">{equipeSelecionada.nome}</h2>
            </div>
            <div className="grid gap-5 p-5 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-gray-500">Liderança</h3>
                <div className="mt-3 space-y-2">
                  {(equipeSelecionada.lideres || []).length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhum líder cadastrado nesta equipe.</p>
                  ) : equipeSelecionada.lideres.map((lider) => (
                    <Contato key={lider.id} pessoa={lider} />
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-gray-500">Voluntários</h3>
                <div className="mt-3 space-y-2">
                  {(equipeSelecionada.voluntarios || []).length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhum voluntário cadastrado nesta equipe.</p>
                  ) : equipeSelecionada.voluntarios.map((voluntario) => (
                    <Contato key={voluntario.id} pessoa={voluntario} />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Contato({ pessoa }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-sm font-bold text-gray-950">{pessoa.nomeCompleto}</p>
        {pessoa.telefone && (
          <span className="text-[11px] font-medium text-gray-400">{pessoa.telefone}</span>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500">{pessoa.email}</p>
    </div>
  );
}

function PainelNotificacao({ equipes, usuarios, formAviso, salvandoId, onSubmit, onChange, onAlternarEquipe, onAlternarUsuario }) {
  return (
    <section className="mt-5 rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-lg font-bold text-gray-950">Enviar notificação</h2>
      </div>
      <form onSubmit={onSubmit} className="grid gap-4 p-5 lg:grid-cols-2">
        <Campo label="Título" value={formAviso.titulo} onChange={(value) => onChange((atual) => ({ ...atual, titulo: value }))} />
        <Campo label="Data" type="datetime-local" value={formAviso.dataAviso} onChange={(value) => onChange((atual) => ({ ...atual, dataAviso: value }))} />
        <div className="lg:col-span-2">
          <CampoTexto label="Descrição" value={formAviso.mensagem} onChange={(value) => onChange((atual) => ({ ...atual, mensagem: value }))} />
        </div>
        <Select
          label="Público"
          value={formAviso.publico}
          options={[
            { value: 'TODOS', label: 'Todos os usuários' },
            { value: 'LIDERES', label: 'Todos os líderes' },
            { value: 'VOLUNTARIOS', label: 'Todos os voluntários' },
            { value: 'EQUIPES', label: 'Voluntários de equipes específicas' },
            { value: 'USUARIOS', label: 'Usuários específicos' },
          ]}
          onChange={(value) => onChange((atual) => ({ ...atual, publico: value, equipeIds: [], usuarioIds: [] }))}
        />
        {formAviso.publico === 'EQUIPES' && (
          <GrupoChecks titulo="Equipes">
            {equipes.map((equipe) => (
              <label key={equipe.id} className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input type="checkbox" checked={formAviso.equipeIds.includes(equipe.id)} onChange={() => onAlternarEquipe(equipe.id)} />
                {equipe.nome}
              </label>
            ))}
          </GrupoChecks>
        )}
        {formAviso.publico === 'USUARIOS' && (
          <GrupoChecks titulo="Usuários">
            {usuarios.map((user) => (
              <label key={user.id} className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input type="checkbox" checked={formAviso.usuarioIds.includes(user.id)} onChange={() => onAlternarUsuario(user.id)} />
                {user.nomeCompleto}
              </label>
            ))}
          </GrupoChecks>
        )}
        <div className="lg:col-span-2">
          <button disabled={salvandoId === 'aviso'} className="inline-flex items-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {salvandoId === 'aviso' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone size={16} />}
            Enviar notificação
          </button>
        </div>
      </form>
    </section>
  );
}

function PainelEscalas({
  equipes,
  eventos,
  tipoEscalas,
  filtroRecorrencia,
  buscaEscalas,
  ordemEscalas,
  escalaEditandoId,
  esporadicas,
  formRecorrentes,
  formEsporadica,
  salvandoId,
  onAlterarRecorrente,
  onSalvarRecorrente,
  onTipoEscalas,
  onFiltroRecorrencia,
  onBuscaEscalas,
  onOrdemEscalas,
  onEditarEscala,
  onChangeEsporadica,
  onAlternarEquipe,
  onCriarEsporadica,
}) {
  return (
    <section className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-950">Gerenciar escalas</h2>
              <p className="mt-1 text-sm text-gray-500">
                Veja cada escala como um evento e acompanhe as pessoas escaladas por função/equipe.
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
              {filtrosTipoEscala.map((filtro) => (
                <button
                  key={filtro.value}
                  type="button"
                  onClick={() => {
                    onTipoEscalas(filtro.value);
                    if (filtro.value !== 'RECORRENTE') {
                      onFiltroRecorrencia('TODAS');
                    }
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                    tipoEscalas === filtro.value ? 'bg-gray-950 text-white' : 'text-gray-600 hover:bg-white'
                  }`}
                >
                  {filtro.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {tipoEscalas === 'RECORRENTE' && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Filtrar recorrentes</p>
              <div className="space-y-2">
                {[0, 6].map((diaSemana) => (
                  <div key={diaSemana} className="flex flex-wrap gap-2">
                    {filtrosRecorrentes
                      .filter((filtro) => filtro.diaSemana === diaSemana)
                      .map((filtro) => (
                        <button
                          key={filtro.value}
                          type="button"
                          onClick={() => onFiltroRecorrencia(filtro.value)}
                          className={`rounded-md border px-3 py-2 text-sm font-bold transition ${
                            filtroRecorrencia === filtro.value
                              ? 'border-gray-950 bg-gray-950 text-white'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          {filtro.label}
                        </button>
                      ))}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => onFiltroRecorrencia('TODAS')}
                  className={`rounded-md border px-3 py-2 text-sm font-bold transition ${
                    filtroRecorrencia === 'TODAS'
                      ? 'border-dourado-700 bg-dourado-700 text-white'
                      : 'border-dourado-200 bg-dourado-50 text-dourado-800 hover:border-dourado-300'
                  }`}
                >
                  Todas recorrentes
                </button>
              </div>
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={buscaEscalas}
                onChange={(event) => onBuscaEscalas(event.target.value)}
                className="block w-full rounded-md border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                placeholder="Pesquisar por equipe, título ou voluntário"
              />
            </label>
            <button
              type="button"
              onClick={() => onOrdemEscalas(ordemEscalas === 'proximas' ? 'distantes' : 'proximas')}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
              title="Alternar ordenação"
            >
              <ArrowDownUp size={16} />
              {ordemEscalas === 'proximas' ? 'Mais próximas' : 'Mais distantes'}
            </button>
            <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-600">
              {eventos.length} evento(s)
            </span>
          </div>

          <div className="space-y-4">
            {eventos.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
                Nenhuma escala encontrada para esse filtro.
              </div>
            ) : eventos.map((evento) => {
              return (
                <div key={evento.id} className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-5 shadow-sm">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-dourado-200 bg-dourado-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-dourado-700">
                          {evento.areas.length} área(s)
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${
                          evento.tipo === 'ESPORADICA'
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-gray-200 bg-white text-gray-500'
                        }`}
                        >
                          {evento.tipo === 'ESPORADICA' ? 'Esporádica' : 'Recorrente'}
                        </span>
                      </div>
                      <h3 className="mt-3 text-xl font-bold text-gray-950">{evento.titulo}</h3>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                        <span>{formatarData(evento.dataHora)}</span>
                        {evento.local && <span>Local: {evento.local}</span>}
                        {evento.tipo === 'RECORRENTE' && (
                          <span>{evento.semanaMes}º {evento.diaSemana === 0 ? 'domingo' : 'sábado'}</span>
                        )}
                      </div>
                      {evento.descricao && (
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">{evento.descricao}</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {evento.areas.map((area) => {
                      const form = formRecorrentes[area.id] || {};
                      const editando = escalaEditandoId === area.id;

                      return (
                        <div key={area.id} className="rounded-xl border border-gray-200 bg-white p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Área</p>
                              <p className="mt-1 text-sm font-bold text-gray-950">{area.equipe?.nome || 'Sem equipe'}</p>
                            </div>
                            {area.tipo === 'RECORRENTE' && (
                              <button
                                type="button"
                                onClick={() => onEditarEscala(editando ? null : area.id)}
                                className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
                              >
                                {editando ? 'Fechar edição' : 'Editar recorrência'}
                              </button>
                            )}
                          </div>

                          <div className="mt-4 grid gap-2 md:grid-cols-2">
                            {(area.voluntarios || []).length === 0 ? (
                              <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500 md:col-span-2">
                                Nenhum voluntário atribuído para esta área.
                              </div>
                            ) : area.voluntarios.map((item) => {
                              const config = statusConfig[item.status] || statusConfig.PENDENTE;
                              const Icon = config.icon;

                              return (
                                <div key={item.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                    <p className="text-sm font-bold text-gray-900">{item.usuario?.nomeCompleto || 'Voluntário'}</p>
                                    {item.usuario?.telefone && (
                                      <span className="text-[11px] font-medium text-gray-400">{item.usuario.telefone}</span>
                                    )}
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${config.className}`}>
                                      <Icon size={11} />
                                      {config.label}
                                    </span>
                                    {item.substituto && (
                                      <span className="inline-flex rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700">
                                        Substituto
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {editando && area.tipo === 'RECORRENTE' && (
                            <div className="mt-4 grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 lg:grid-cols-[1.3fr_0.8fr_0.8fr_0.7fr_auto] lg:items-end">
                              <Campo label="Título" value={form.titulo || ''} onChange={(value) => onAlterarRecorrente(area.id, 'titulo', value)} />
                              <Select label="Dia" value={form.diaSemana ?? 0} options={dias} onChange={(value) => onAlterarRecorrente(area.id, 'diaSemana', Number(value))} />
                              <Select label="Fim de semana" value={form.semanaMes || 1} options={semanas.map((semana) => ({ value: semana, label: `${semana}º` }))} onChange={(value) => onAlterarRecorrente(area.id, 'semanaMes', Number(value))} />
                              <Campo label="Horário" type="time" value={form.horario || '18:00'} onChange={(value) => onAlterarRecorrente(area.id, 'horario', value)} />
                              <button type="button" disabled={salvandoId === area.id} onClick={() => onSalvarRecorrente(area.id)} className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-950 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                                {salvandoId === area.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
                                Salvar
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <form onSubmit={onCriarEsporadica} className="space-y-4 p-5">
            <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-950">Nova escala esporádica</h2>
                <p className="mt-1 text-sm text-gray-500">Crie um evento pontual e envie para os líderes atribuírem voluntários.</p>
              </div>
              <button
                disabled={salvandoId === 'esporadica'}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-dourado-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {salvandoId === 'esporadica' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
                Salvar escala esporádica
              </button>
            </div>
            <Campo label="Título" value={formEsporadica.titulo} onChange={(value) => onChangeEsporadica((atual) => ({ ...atual, titulo: value }))} />
            <Campo label="Data" type="date" value={formEsporadica.data} onChange={(value) => onChangeEsporadica((atual) => ({ ...atual, data: value }))} />
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-700">Horários</span>
                <button
                  type="button"
                  onClick={() => onChangeEsporadica((atual) => ({ ...atual, horarios: [...(atual.horarios || []), ''] }))}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
                >
                  <Plus size={13} />
                  Adicionar horário
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(formEsporadica.horarios || []).map((horario, index) => (
                  <div key={`${index}-${horario}`} className="flex gap-2">
                    <input
                      type="time"
                      value={horario}
                      onChange={(event) => onChangeEsporadica((atual) => ({
                        ...atual,
                        horarios: (atual.horarios || []).map((item, itemIndex) => (itemIndex === index ? event.target.value : item)),
                      }))}
                      className="block min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                    />
                    {(formEsporadica.horarios || []).length > 1 && (
                      <button
                        type="button"
                        onClick={() => onChangeEsporadica((atual) => ({
                          ...atual,
                          horarios: (atual.horarios || []).filter((_, itemIndex) => itemIndex !== index),
                        }))}
                        className="rounded-md border border-red-100 bg-white px-2.5 text-red-600 transition hover:bg-red-50"
                        title="Remover horário"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">Exemplo: adicione 09:00, 10:00, 17:00 e 19:00 para criar quatro escalas no mesmo dia.</p>
            </div>
            <Campo label="Local" value={formEsporadica.local} onChange={(value) => onChangeEsporadica((atual) => ({ ...atual, local: value }))} />
            <CampoTexto label="Descrição" value={formEsporadica.descricao} onChange={(value) => onChangeEsporadica((atual) => ({ ...atual, descricao: value }))} />
            <GrupoChecks titulo="Equipes solicitadas">
              {equipes.map((equipe) => (
                <label key={equipe.id} className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <input type="checkbox" checked={formEsporadica.equipeIds.includes(equipe.id)} onChange={() => onAlternarEquipe(equipe.id)} />
                  {equipe.nome}
                </label>
              ))}
            </GrupoChecks>
            <button disabled={salvandoId === 'esporadica'} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {salvandoId === 'esporadica' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={16} />}
              Salvar escala esporádica e enviar para líderes
            </button>
          </form>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-gray-950">Esporádicas futuras</h2>
          <div className="mt-3 space-y-2">
            {esporadicas.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma escala esporádica futura.</p>
            ) : esporadicas.map((escala) => (
              <div key={escala.id} className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2">
                <p className="text-sm font-bold text-gray-950">{escala.titulo}</p>
                <p className="mt-1 text-xs text-amber-700">{escala.equipe?.nome} - {formatarData(escala.dataHora)}</p>
                <p className="mt-1 text-xs text-gray-600">{escala.voluntarios?.length || 0} voluntário(s) atribuído(s)</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function GrupoChecks({ titulo, children }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">{titulo}</p>
      <div className="grid max-h-56 gap-2 overflow-auto rounded-md border border-gray-200 bg-gray-50 p-3 sm:grid-cols-2">
        {children}
      </div>
    </div>
  );
}

function Campo({ label, value, onChange, type = 'text' }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 block w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10" />
    </label>
  );
}

function CampoTexto({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <textarea value={value} rows={4} onChange={(event) => onChange(event.target.value)} className="mt-2 block w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10" />
    </label>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 block w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function Feedback({ tipo, mensagem }) {
  const isErro = tipo === 'erro';
  return (
    <div className={`mt-5 flex items-center gap-2 rounded-md border px-4 py-3 text-sm font-medium ${isErro ? 'border-red-100 bg-red-50 text-red-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}`}>
      {isErro ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
      {mensagem}
    </div>
  );
}

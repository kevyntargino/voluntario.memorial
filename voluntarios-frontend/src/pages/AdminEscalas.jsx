import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Loader2,
  Megaphone,
  RefreshCcw,
  Save,
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
const permissoesDisponiveis = ['VOLUNTARIO', 'LIDER_EQUIPE', 'ADMINISTRADOR'];

const statusConfig = {
  PENDENTE: { label: 'Pendente', className: 'border-amber-200 bg-amber-50 text-amber-700', icon: Clock3 },
  CONFIRMADA: { label: 'Confirmada', className: 'border-emerald-200 bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  PEDIU_SUBSTITUICAO: { label: 'Substituição', className: 'border-sky-200 bg-sky-50 text-sky-700', icon: RefreshCcw },
  AUSENTE: { label: 'Ausente', className: 'border-red-200 bg-red-50 text-red-700', icon: AlertCircle },
};

const formEsporadicaInicial = { titulo: '', dataHora: '', local: '', descricao: '', equipeIds: [] };
const formAvisoInicial = { titulo: '', mensagem: '', dataAviso: '', publico: 'TODOS', equipeIds: [], usuarioIds: [] };

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
  };
}

export default function AdminEscalas() {
  const { token, usuario, logout } = useAuth();
  const { navigate } = useNavigation();
  const [dashboard, setDashboard] = useState(null);
  const [equipes, setEquipes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [recorrentes, setRecorrentes] = useState([]);
  const [esporadicas, setEsporadicas] = useState([]);
  const [formsUsuarios, setFormsUsuarios] = useState({});
  const [formRecorrentes, setFormRecorrentes] = useState({});
  const [formEsporadica, setFormEsporadica] = useState(formEsporadicaInicial);
  const [formAviso, setFormAviso] = useState(formAvisoInicial);
  const [painelAberto, setPainelAberto] = useState('visao');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
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

  const lideres = useMemo(() => usuarios.filter((item) => item.permissoes?.includes('LIDER_EQUIPE')), [usuarios]);
  const usuariosDoPainel = painelAberto === 'lideres' ? lideres : usuarios;

  const recorrentesPorEquipe = useMemo(() => {
    const mapa = new Map();
    for (const escala of recorrentes) {
      const nome = escala.equipe?.nome || 'Sem equipe';
      mapa.set(nome, [...(mapa.get(nome) || []), escala]);
    }
    return Array.from(mapa.entries()).map(([equipe, itens]) => ({ equipe, itens }));
  }, [recorrentes]);

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
      return { ...atuais, [usuarioId]: { ...atual, permissoes: proximas } };
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
    try {
      const resposta = await fetch(buildApiUrl('/api/escalas/admin/esporadicas'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(formEsporadica),
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
            <button onClick={() => setPainelAberto('notificacao')} className="inline-flex items-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800">
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
                  <BotaoPainel ativo={painelAberto === 'voluntarios'} icon={UsersRound} label="Ver voluntários" onClick={() => setPainelAberto('voluntarios')} />
                  <BotaoPainel ativo={painelAberto === 'lideres'} icon={UserCog} label="Ver líderes de equipe" onClick={() => setPainelAberto('lideres')} />
                  <BotaoPainel ativo={painelAberto === 'notificacao'} icon={Megaphone} label="Enviar notificação" onClick={() => setPainelAberto('notificacao')} />
                  <BotaoPainel ativo={painelAberto === 'escalas'} icon={CalendarClock} label="Gerenciar escalas" onClick={() => setPainelAberto('escalas')} />
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
                onSalvar={salvarUsuario}
                onExcluir={excluirUsuario}
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
                recorrentesPorEquipe={recorrentesPorEquipe}
                esporadicas={esporadicas}
                formRecorrentes={formRecorrentes}
                formEsporadica={formEsporadica}
                salvandoId={salvandoId}
                onAlterarRecorrente={alterarRecorrente}
                onSalvarRecorrente={salvarRecorrente}
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
                  <p className="text-sm font-semibold text-gray-800">{item.usuario.nomeCompleto}</p>
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

function PainelUsuarios({ titulo, usuarios, equipes, formsUsuarios, salvandoId, onAlterar, onAlternarPermissao, onAlternarEquipe, onSalvar, onExcluir }) {
  return (
    <section className="mt-5 rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-lg font-bold text-gray-950">{titulo}</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {usuarios.map((usuario) => {
          const form = formsUsuarios[usuario.id] || criarFormUsuario(usuario);
          return (
            <div key={usuario.id} className="grid gap-4 px-5 py-4 xl:grid-cols-[1fr_1fr_auto]">
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Nome" value={form.nomeCompleto} onChange={(value) => onAlterar(usuario.id, 'nomeCompleto', value)} />
                <Campo label="Telefone" value={form.telefone} onChange={(value) => onAlterar(usuario.id, 'telefone', value)} />
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">{usuario.email}</p>
                </div>
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
                <GrupoChecks titulo="Equipes">
                  {equipes.map((equipe) => (
                    <label key={equipe.id} className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <input type="checkbox" checked={form.equipeIds.includes(equipe.id)} onChange={() => onAlternarEquipe(usuario.id, equipe.id)} />
                      {equipe.nome}
                    </label>
                  ))}
                </GrupoChecks>
              </div>
              <div className="flex gap-2 xl:flex-col xl:justify-center">
                <button type="button" disabled={salvandoId === usuario.id} onClick={() => onSalvar(usuario.id)} className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {salvandoId === usuario.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={15} />}
                  Salvar
                </button>
                <button type="button" disabled={salvandoId === usuario.id} onClick={() => onExcluir(usuario.id)} className="inline-flex items-center justify-center gap-2 rounded-md border border-red-100 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">
                  <Trash2 size={15} />
                  Excluir
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
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

function PainelEscalas({ equipes, recorrentesPorEquipe, esporadicas, formRecorrentes, formEsporadica, salvandoId, onAlterarRecorrente, onSalvarRecorrente, onChangeEsporadica, onAlternarEquipe, onCriarEsporadica }) {
  return (
    <section className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-bold text-gray-950">Escalas recorrentes</h2>
        </div>
        <div className="space-y-5 p-5">
          {recorrentesPorEquipe.map(({ equipe, itens }) => (
            <div key={equipe}>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-gray-500">{equipe}</h3>
              <div className="space-y-2">
                {itens.map((escala) => {
                  const form = formRecorrentes[escala.id] || {};
                  return (
                    <div key={escala.id} className="grid gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.7fr_auto] lg:items-end">
                      <Campo label="Título" value={form.titulo || ''} onChange={(value) => onAlterarRecorrente(escala.id, 'titulo', value)} />
                      <Select label="Dia" value={form.diaSemana ?? 0} options={dias} onChange={(value) => onAlterarRecorrente(escala.id, 'diaSemana', Number(value))} />
                      <Select label="Fim de semana" value={form.semanaMes || 1} options={semanas.map((semana) => ({ value: semana, label: `${semana}º` }))} onChange={(value) => onAlterarRecorrente(escala.id, 'semanaMes', Number(value))} />
                      <Campo label="Horário" type="time" value={form.horario || '18:00'} onChange={(value) => onAlterarRecorrente(escala.id, 'horario', value)} />
                      <button type="button" disabled={salvandoId === escala.id} onClick={() => onSalvarRecorrente(escala.id)} className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-950 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                        {salvandoId === escala.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
                        Salvar
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-5">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-lg font-bold text-gray-950">Nova escala esporádica</h2>
          </div>
          <form onSubmit={onCriarEsporadica} className="space-y-4 p-5">
            <Campo label="Título" value={formEsporadica.titulo} onChange={(value) => onChangeEsporadica((atual) => ({ ...atual, titulo: value }))} />
            <Campo label="Data e horário" type="datetime-local" value={formEsporadica.dataHora} onChange={(value) => onChangeEsporadica((atual) => ({ ...atual, dataHora: value }))} />
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
            <button disabled={salvandoId === 'esporadica'} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-dourado-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {salvandoId === 'esporadica' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={16} />}
              Enviar para líderes
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

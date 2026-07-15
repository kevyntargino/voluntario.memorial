import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Megaphone,
  Loader2,
  Save,
  Send,
  ShieldCheck,
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

const formEsporadicaInicial = {
  titulo: '',
  dataHora: '',
  local: '',
  descricao: '',
  equipeIds: [],
};

const formAvisoInicial = {
  titulo: '',
  mensagem: '',
  dataAviso: '',
  publico: 'TODOS',
  equipeIds: [],
  usuarioIds: [],
};

function toTime(dataHora) {
  if (!dataHora) {
    return '18:00';
  }

  const data = new Date(dataHora);
  return data.toISOString().slice(11, 16);
}

export default function AdminEscalas() {
  const { token, usuario, logout } = useAuth();
  const { navigate } = useNavigation();
  const [equipes, setEquipes] = useState([]);
  const [recorrentes, setRecorrentes] = useState([]);
  const [esporadicas, setEsporadicas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [avisosRecentes, setAvisosRecentes] = useState([]);
  const [formRecorrentes, setFormRecorrentes] = useState({});
  const [formEsporadica, setFormEsporadica] = useState(formEsporadicaInicial);
  const [formAviso, setFormAviso] = useState(formAvisoInicial);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState(null);
  const isAdmin = usuario?.permissoes?.includes('ADMINISTRADOR');

  const carregarDados = useCallback(async () => {
    setErro('');
    setCarregando(true);

    try {
      const [resposta, respostaAvisos] = await Promise.all([
        fetch(buildApiUrl('/api/escalas/admin'), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
        fetch(buildApiUrl('/api/avisos/admin/opcoes'), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
      ]);
      const dados = await resposta.json();
      const dadosAvisos = await respostaAvisos.json();

      if (!resposta.ok || !respostaAvisos.ok) {
        if (resposta.status === 401 || respostaAvisos.status === 401) {
          logout();
          navigate('/login', { replace: true });
          return;
        }

        throw new Error(dados.erro || dadosAvisos.erro || 'Não foi possível carregar o painel administrativo.');
      }

      setEquipes(dados.equipes || []);
      setRecorrentes(dados.recorrentes || []);
      setEsporadicas(dados.esporadicas || []);
      setUsuarios(dadosAvisos.usuarios || []);
      setAvisosRecentes(dadosAvisos.avisos || []);
      setFormRecorrentes(Object.fromEntries((dados.recorrentes || []).map((escala) => [
        escala.id,
        {
          titulo: escala.titulo || '',
          diaSemana: escala.diaSemana ?? 0,
          semanaMes: escala.semanaMes || 1,
          horario: toTime(escala.dataHora),
        },
      ])));
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar as escalas administrativas.');
    } finally {
      setCarregando(false);
    }
  }, [logout, navigate, token]);

  useEffect(() => {
    if (isAdmin) {
      carregarDados();
    }
  }, [carregarDados, isAdmin]);

  const recorrentesPorEquipe = useMemo(() => {
    const mapa = new Map();

    for (const escala of recorrentes) {
      const nome = escala.equipe?.nome || 'Sem equipe';
      mapa.set(nome, [...(mapa.get(nome) || []), escala]);
    }

    return Array.from(mapa.entries()).map(([equipe, itens]) => ({ equipe, itens }));
  }, [recorrentes]);

  const alterarRecorrente = (escalaId, campo, valor) => {
    setFormRecorrentes((atuais) => ({
      ...atuais,
      [escalaId]: {
        ...(atuais[escalaId] || {}),
        [campo]: valor,
      },
    }));
  };

  const salvarRecorrente = async (escalaId) => {
    setErro('');
    setSucesso('');
    setSalvandoId(escalaId);

    try {
      const resposta = await fetch(buildApiUrl(`/api/escalas/admin/recorrentes/${escalaId}`), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formRecorrentes[escalaId]),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(dados.erro || 'Não foi possível salvar a escala recorrente.');
      }

      setSucesso(dados.mensagem || 'Escala recorrente atualizada.');
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível salvar a escala recorrente.');
    } finally {
      setSalvandoId(null);
    }
  };

  const alternarEquipe = (equipeId) => {
    setFormEsporadica((atual) => ({
      ...atual,
      equipeIds: atual.equipeIds.includes(equipeId)
        ? atual.equipeIds.filter((id) => id !== equipeId)
        : [...atual.equipeIds, equipeId],
    }));
  };

  const alternarEquipeAviso = (equipeId) => {
    setFormAviso((atual) => ({
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

  const criarEsporadica = async (event) => {
    event.preventDefault();
    setErro('');
    setSucesso('');
    setSalvandoId('esporadica');

    try {
      const resposta = await fetch(buildApiUrl('/api/escalas/admin/esporadicas'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formEsporadica),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(dados.erro || 'Não foi possível criar a escala esporádica.');
      }

      setSucesso(dados.mensagem || 'Escala esporádica enviada aos líderes.');
      setFormEsporadica(formEsporadicaInicial);
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível criar a escala esporádica.');
    } finally {
      setSalvandoId(null);
    }
  };

  const criarAviso = async (event) => {
    event.preventDefault();
    setErro('');
    setSucesso('');
    setSalvandoId('aviso');

    try {
      const resposta = await fetch(buildApiUrl('/api/avisos/admin'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formAviso),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(dados.erro || 'Não foi possível enviar o aviso.');
      }

      setSucesso(dados.mensagem || 'Aviso enviado com sucesso.');
      setFormAviso(formAvisoInicial);
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível enviar o aviso.');
    } finally {
      setSalvandoId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#f7f4ed] text-gray-900">
        <Navbar />
        <main className="mx-auto max-w-4xl px-4 py-10">
          <div className="rounded-lg border border-red-100 bg-red-50 p-5 text-red-700">
            Acesso restrito a administradores.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f4ed] text-gray-900">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-dourado-50 p-3 text-dourado-700">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-dourado-700">Administração</p>
              <h1 className="mt-2 text-3xl font-bold text-gray-950">Gestão de escalas</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
                Edite escalas recorrentes do MCom e crie escalas esporádicas para equipes específicas.
              </p>
            </div>
          </div>
        </section>

        {erro && <Feedback tipo="erro" mensagem={erro} />}
        {sucesso && <Feedback tipo="sucesso" mensagem={sucesso} />}

        {carregando ? (
          <div className="mt-5 flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-6 py-12 text-gray-500 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando escalas...
          </div>
        ) : (
          <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-4">
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-5 w-5 text-dourado-600" />
                  <h2 className="text-lg font-bold text-gray-950">Escalas recorrentes</h2>
                </div>
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
                            <Campo label="Título" value={form.titulo || ''} onChange={(value) => alterarRecorrente(escala.id, 'titulo', value)} />
                            <Select label="Dia" value={form.diaSemana ?? 0} options={dias} onChange={(value) => alterarRecorrente(escala.id, 'diaSemana', Number(value))} />
                            <Select label="Fim de semana" value={form.semanaMes || 1} options={semanas.map((semana) => ({ value: semana, label: `${semana}º` }))} onChange={(value) => alterarRecorrente(escala.id, 'semanaMes', Number(value))} />
                            <Campo label="Horário" type="time" value={form.horario || '18:00'} onChange={(value) => alterarRecorrente(escala.id, 'horario', value)} />
                            <button
                              type="button"
                              disabled={salvandoId === escala.id}
                              onClick={() => salvarRecorrente(escala.id)}
                              className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-950 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
                            >
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
            </section>

            <section className="space-y-5">
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Megaphone className="h-5 w-5 text-dourado-600" />
                    <h2 className="text-lg font-bold text-gray-950">Enviar aviso</h2>
                  </div>
                </div>
                <form onSubmit={criarAviso} className="space-y-4 p-5">
                  <Campo label="Título" value={formAviso.titulo} onChange={(value) => setFormAviso((atual) => ({ ...atual, titulo: value }))} />
                  <Campo label="Data" type="datetime-local" value={formAviso.dataAviso} onChange={(value) => setFormAviso((atual) => ({ ...atual, dataAviso: value }))} />
                  <CampoTexto label="Descrição" value={formAviso.mensagem} onChange={(value) => setFormAviso((atual) => ({ ...atual, mensagem: value }))} />
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
                    onChange={(value) => setFormAviso((atual) => ({ ...atual, publico: value, equipeIds: [], usuarioIds: [] }))}
                  />

                  {formAviso.publico === 'EQUIPES' && (
                    <div>
                      <p className="mb-2 text-sm font-semibold text-gray-700">Equipes</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {equipes.map((equipe) => (
                          <label key={equipe.id} className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">
                            <input
                              type="checkbox"
                              checked={formAviso.equipeIds.includes(equipe.id)}
                              onChange={() => alternarEquipeAviso(equipe.id)}
                            />
                            {equipe.nome}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {formAviso.publico === 'USUARIOS' && (
                    <div>
                      <p className="mb-2 text-sm font-semibold text-gray-700">Usuários</p>
                      <div className="max-h-64 space-y-2 overflow-auto rounded-md border border-gray-200 bg-gray-50 p-2">
                        {usuarios.map((user) => (
                          <label key={user.id} className="flex items-start gap-2 rounded bg-white px-3 py-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={formAviso.usuarioIds.includes(user.id)}
                              onChange={() => alternarUsuarioAviso(user.id)}
                              className="mt-1"
                            />
                            <span>
                              <span className="block font-semibold text-gray-900">{user.nomeCompleto}</span>
                              <span className="block text-xs text-gray-500">{user.email}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <button disabled={salvandoId === 'aviso'} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60">
                    {salvandoId === 'aviso' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone size={16} />}
                    Enviar aviso
                  </button>
                </form>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Send className="h-5 w-5 text-dourado-600" />
                    <h2 className="text-lg font-bold text-gray-950">Nova escala esporádica</h2>
                  </div>
                </div>
                <form onSubmit={criarEsporadica} className="space-y-4 p-5">
                  <Campo label="Título" value={formEsporadica.titulo} onChange={(value) => setFormEsporadica((atual) => ({ ...atual, titulo: value }))} />
                  <Campo label="Data e horário" type="datetime-local" value={formEsporadica.dataHora} onChange={(value) => setFormEsporadica((atual) => ({ ...atual, dataHora: value }))} />
                  <Campo label="Local" value={formEsporadica.local} onChange={(value) => setFormEsporadica((atual) => ({ ...atual, local: value }))} />
                  <CampoTexto label="Descrição" value={formEsporadica.descricao} onChange={(value) => setFormEsporadica((atual) => ({ ...atual, descricao: value }))} />

                  <div>
                    <p className="mb-2 text-sm font-semibold text-gray-700">Equipes solicitadas</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {equipes.map((equipe) => (
                        <label key={equipe.id} className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">
                          <input
                            type="checkbox"
                            checked={formEsporadica.equipeIds.includes(equipe.id)}
                            onChange={() => alternarEquipe(equipe.id)}
                          />
                          {equipe.nome}
                        </label>
                      ))}
                    </div>
                  </div>

                  <button disabled={salvandoId === 'esporadica'} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-dourado-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-dourado-800 disabled:opacity-60">
                    {salvandoId === 'esporadica' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={16} />}
                    Enviar para líderes
                  </button>
                </form>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-gray-950">Esporádicas futuras</h2>
                <div className="mt-3 space-y-2">
                  {esporadicas.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhuma escala esporádica futura.</p>
                  ) : esporadicas.map((escala) => (
                    <div key={escala.id} className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2">
                      <p className="text-sm font-bold text-gray-950">{escala.titulo}</p>
                      <p className="mt-1 text-xs text-amber-700">{escala.equipe?.nome} - {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(escala.dataHora))}</p>
                      <p className="mt-1 text-xs text-gray-600">{escala.voluntarios?.length || 0} voluntário(s) atribuído(s)</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-gray-950">Avisos recentes</h2>
                <div className="mt-3 space-y-2">
                  {avisosRecentes.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhum aviso enviado ainda.</p>
                  ) : avisosRecentes.map((aviso) => (
                    <div key={aviso.id} className="rounded-md border border-sky-100 bg-sky-50 px-3 py-2">
                      <p className="text-sm font-bold text-gray-950">{aviso.titulo}</p>
                      <p className="mt-1 text-xs text-sky-700">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(aviso.dataAviso))}</p>
                      <p className="mt-1 text-xs text-gray-600">
                        {aviso.tipo === 'GLOBAL' ? 'Todos os usuários' : `${aviso.destinatarios?.length || 0} destinatário(s)`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

function Campo({ label, value, onChange, type = 'text' }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 block w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
      />
    </label>
  );
}

function CampoTexto({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <textarea
        value={value}
        rows={4}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 block w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
      />
    </label>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 block w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Feedback({ tipo, mensagem }) {
  const isErro = tipo === 'erro';

  return (
    <div className={`mt-5 flex items-center gap-2 rounded-md border px-4 py-3 text-sm font-medium ${
      isErro ? 'border-red-100 bg-red-50 text-red-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'
    }`}>
      {isErro ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
      {mensagem}
    </div>
  );
}

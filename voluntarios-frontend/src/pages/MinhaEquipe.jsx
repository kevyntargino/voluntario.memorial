import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  Loader2,
  Plus,
  Save,
  Trash2,
  UserPlus,
  UsersRound,
  RefreshCcw,
  Bell,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import { Footer } from '../components/Footer';
import { UsuarioInfoButton, UsuarioModal } from '../components/UsuarioModal';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { buildApiUrl } from '../lib/api';

const formVoluntarioInicial = {
  nomeCompleto: '',
  email: '',
  telefone: '',
  senha: '',
};

const formEscalaInicial = {
  id: null,
  titulo: '',
  voluntarioIds: [],
  substitutoIds: [],
};

const filtrosRecorrentes = [0, 6].flatMap((diaSemana) => (
  [1, 2, 3, 4].map((semanaMes) => ({
    chave: `RECORRENTE:${diaSemana}:${semanaMes}`,
    diaSemana,
    semanaMes,
    label: `${semanaMes}º ${diaSemana === 0 ? 'domingo' : 'sábado'}`,
  }))
));

const statusConfig = {
  PENDENTE: { label: 'Pendente', className: 'border-amber-200 bg-amber-50 text-amber-700', icon: Clock3 },
  CONFIRMADA: { label: 'Confirmado', className: 'border-emerald-200 bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  PEDIU_SUBSTITUICAO: { label: 'Substituição', className: 'border-sky-200 bg-sky-50 text-sky-700', icon: RefreshCcw },
  AUSENTE: { label: 'Ausente', className: 'border-red-200 bg-red-50 text-red-700', icon: AlertCircle },
};

function formatarData(dataHora) {
  if (!dataHora) {
    return 'Sem data';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(dataHora));
}

export default function MinhaEquipe() {
  const { token, usuario, logout } = useAuth();
  const { navigate } = useNavigation();
  const [equipes, setEquipes] = useState([]);
  const [equipeId, setEquipeId] = useState('');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [formVoluntario, setFormVoluntario] = useState(formVoluntarioInicial);
  const [formEscala, setFormEscala] = useState(formEscalaInicial);
  const [substitutosSelecionados, setSubstitutosSelecionados] = useState({});
  const [filtroEscala, setFiltroEscala] = useState(filtrosRecorrentes[0].chave);
  const [usuarioModal, setUsuarioModal] = useState(null);
  const [mostrarCadastroVoluntario, setMostrarCadastroVoluntario] = useState(false);
  const [mostrarAtribuirVoluntarios, setMostrarAtribuirVoluntarios] = useState(false);

  const carregarEquipes = useCallback(async () => {
    setErro('');
    setCarregando(true);

    try {
      const resposta = await fetch(buildApiUrl('/api/equipes/minhas'), {
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

        throw new Error(dados.erro || 'Não foi possível carregar sua equipe.');
      }

      setEquipes(dados.equipes || []);
      setEquipeId((atual) => atual || dados.equipes?.[0]?.id || '');
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar sua equipe.');
    } finally {
      setCarregando(false);
    }
  }, [logout, navigate, token]);

  useEffect(() => {
    carregarEquipes();
  }, [carregarEquipes]);

  const equipeSelecionada = useMemo(
    () => equipes.find((equipe) => equipe.id === equipeId) || null,
    [equipeId, equipes],
  );

  const escalasEsporadicas = useMemo(() => (
    (equipeSelecionada?.escalas || [])
      .filter((escala) => escala.tipo === 'ESPORADICA')
      .sort((a, b) => new Date(a.dataHora || 0).getTime() - new Date(b.dataHora || 0).getTime())
  ), [equipeSelecionada]);

  const escalasFiltradas = useMemo(() => {
    if (!equipeSelecionada) {
      return [];
    }

    if (filtroEscala.startsWith('ESPORADICA:')) {
      const escalaId = filtroEscala.replace('ESPORADICA:', '');
      return equipeSelecionada.escalas.filter((escala) => escala.id === escalaId);
    }

    const filtro = filtrosRecorrentes.find((item) => item.chave === filtroEscala) || filtrosRecorrentes[0];

    return equipeSelecionada.escalas.filter((escala) => (
      escala.tipo === 'RECORRENTE'
      && escala.diaSemana === filtro.diaSemana
      && escala.semanaMes === filtro.semanaMes
    ));
  }, [equipeSelecionada, filtroEscala]);

  useEffect(() => {
    if (!equipeSelecionada) {
      return;
    }

    if (filtroEscala.startsWith('ESPORADICA:')) {
      const escalaId = filtroEscala.replace('ESPORADICA:', '');
      const escalaAindaExiste = equipeSelecionada.escalas.some((escala) => escala.id === escalaId);

      if (!escalaAindaExiste) {
        setFiltroEscala(filtrosRecorrentes[0].chave);
      }
    }
  }, [equipeSelecionada, filtroEscala]);

  const atualizarEquipe = (equipeAtualizada) => {
    setEquipes((atuais) => atuais.map((equipe) => (
      equipe.id === equipeAtualizada.id ? equipeAtualizada : equipe
    )));
  };

  const requestEquipe = async (path, options = {}) => {
    const resposta = await fetch(buildApiUrl(path), {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      throw new Error(dados.erro || 'Não foi possível concluir a operação.');
    }

    if (dados.equipe) {
      atualizarEquipe(dados.equipe);
    }

    setSucesso(dados.mensagem || 'Alteração salva com sucesso.');
    return dados;
  };

  const cadastrarVoluntario = async (event) => {
    event.preventDefault();
    setErro('');
    setSucesso('');
    setSalvando(true);

    try {
      await requestEquipe(`/api/equipes/${equipeId}/voluntarios`, {
        method: 'POST',
        body: JSON.stringify(formVoluntario),
      });
      setFormVoluntario(formVoluntarioInicial);
      setMostrarCadastroVoluntario(false);
    } catch (error) {
      setErro(error.message);
    } finally {
      setSalvando(false);
    }
  };

  const removerVoluntario = async (voluntarioId) => {
    setErro('');
    setSucesso('');
    setSalvando(true);

    try {
      await requestEquipe(`/api/equipes/${equipeId}/voluntarios/${voluntarioId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      setErro(error.message);
    } finally {
      setSalvando(false);
    }
  };

  const salvarEscala = async (event) => {
    event.preventDefault();

    if (!formEscala.id) {
      setErro('Selecione uma escala para atribuir voluntários.');
      return;
    }

    setErro('');
    setSucesso('');
    setSalvando(true);

    try {
      await requestEquipe(`/api/equipes/${equipeId}/escalas/${formEscala.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          voluntarioIds: formEscala.voluntarioIds,
          substitutoIds: formEscala.substitutoIds,
        }),
      });

      setFormEscala(formEscalaInicial);
      setMostrarAtribuirVoluntarios(false);
    } catch (error) {
      setErro(error.message);
    } finally {
      setSalvando(false);
    }
  };

  const editarEscala = (escala) => {
    setFormEscala({
      id: escala.id,
      titulo: escala.titulo || '',
      voluntarioIds: escala.voluntarios.map((item) => item.usuario.id),
      substitutoIds: escala.voluntarios.filter((item) => item.substituto).map((item) => item.usuario.id),
    });
    setMostrarAtribuirVoluntarios(true);
  };

  const atribuirSubstituto = async (pedidoId) => {
    const substitutoId = substitutosSelecionados[pedidoId];

    if (!substitutoId) {
      setErro('Selecione um voluntário para substituir.');
      return;
    }

    setErro('');
    setSucesso('');
    setSalvando(true);

    try {
      await requestEquipe(`/api/equipes/${equipeId}/substituicoes/${pedidoId}/atribuir`, {
        method: 'POST',
        body: JSON.stringify({ substitutoId }),
      });
      setSubstitutosSelecionados((atuais) => {
        const proximos = { ...atuais };
        delete proximos[pedidoId];
        return proximos;
      });
    } catch (error) {
      setErro(error.message);
    } finally {
      setSalvando(false);
    }
  };

  const alternarVoluntarioNaEscala = (voluntarioId) => {
    setFormEscala((atual) => ({
      ...atual,
      voluntarioIds: atual.voluntarioIds.includes(voluntarioId)
        ? atual.voluntarioIds.filter((id) => id !== voluntarioId)
        : [...atual.voluntarioIds, voluntarioId],
      substitutoIds: atual.voluntarioIds.includes(voluntarioId)
        ? atual.substitutoIds.filter((id) => id !== voluntarioId)
        : atual.substitutoIds,
    }));
  };

  const alternarSubstituto = (voluntarioId) => {
    setFormEscala((atual) => ({
      ...atual,
      voluntarioIds: atual.voluntarioIds.includes(voluntarioId)
        ? atual.voluntarioIds
        : [...atual.voluntarioIds, voluntarioId],
      substitutoIds: atual.substitutoIds.includes(voluntarioId)
        ? atual.substitutoIds.filter((id) => id !== voluntarioId)
        : [...atual.substitutoIds, voluntarioId],
    }));
  };

  const pedidosSubstituicao = useMemo(() => {
    if (!equipeSelecionada) {
      return [];
    }

    return equipeSelecionada.escalas.flatMap((escala) => (
      escala.voluntarios
        .filter((item) => item.status === 'PEDIU_SUBSTITUICAO')
        .map((item) => ({ ...item, escala }))
    ));
  }, [equipeSelecionada]);

  const pedidosEscalasEsporadicas = useMemo(() => {
    if (!equipeSelecionada) {
      return [];
    }

    return equipeSelecionada.escalas.filter((escala) => (
      escala.tipo === 'ESPORADICA'
      && escala.solicitadaPeloAdmin
      && escala.voluntarios.length === 0
    ));
  }, [equipeSelecionada]);

  const podeAcessar = usuario?.permissoes?.some((permissao) => ['LIDER_EQUIPE', 'ADMINISTRADOR'].includes(permissao));

  if (!podeAcessar) {
    return (
      <div className="min-h-screen bg-[#f7f4ed] text-gray-900">
        <Navbar />
        <main className="mx-auto max-w-4xl px-4 py-10">
          <div className="rounded-lg border border-red-100 bg-red-50 p-5 text-red-700">
            Acesso restrito a líderes de equipe.
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
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-dourado-700">Liderança</p>
              <h1 className="mt-2 text-3xl font-bold text-gray-950">Minha equipe</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                Gerencie voluntários e escalas das equipes em que você atua como líder.
              </p>
            </div>

            <select
              value={equipeId}
              onChange={(event) => {
                setEquipeId(event.target.value);
                setFormEscala(formEscalaInicial);
                setFiltroEscala(filtrosRecorrentes[0].chave);
                setMostrarAtribuirVoluntarios(false);
                setMostrarCadastroVoluntario(false);
              }}
              className="rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
            >
              {equipes.map((equipe) => (
                <option key={equipe.id} value={equipe.id}>
                  {equipe.nome}
                </option>
              ))}
            </select>
          </div>
        </section>

        {erro && <Feedback tipo="erro" mensagem={erro} />}
        {sucesso && <Feedback tipo="sucesso" mensagem={sucesso} />}

        {carregando ? (
          <div className="mt-5 flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-6 py-12 text-gray-500 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando equipe...
          </div>
        ) : equipeSelecionada ? (
          <div className="mt-5 grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
            <section className="space-y-5">
              <Painel
                titulo="Solicitações de substituição"
                icone={Bell}
                badge={pedidosSubstituicao.length}
              >
                {pedidosSubstituicao.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhum pedido de substituição pendente.</p>
                ) : (
                  <div className="space-y-3">
                    {pedidosSubstituicao.map((pedido) => (
                      <div key={pedido.id} className="rounded-md border border-sky-100 bg-sky-50 p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex items-start gap-2">
                              <UsuarioInfoButton usuario={pedido.usuario} onClick={setUsuarioModal} />
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-950">{pedido.usuario.nomeCompleto}</p>
                                <p className="mt-1 text-xs font-semibold text-sky-700">{pedido.escala.titulo || 'Escala sem título'} - {formatarData(pedido.escala.dataHora)}</p>
                              </div>
                            </div>
                          </div>
                          <div className="inline-flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 text-xs font-bold text-sky-700">
                            <RefreshCcw size={14} />
                            Pedido aberto
                          </div>
                        </div>
                        <p className="mt-3 rounded-md bg-white px-3 py-2 text-sm text-gray-700">
                          {pedido.justificativaSubstituicao || 'Sem justificativa informada.'}
                        </p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                          <select
                            value={substitutosSelecionados[pedido.id] || ''}
                            onChange={(event) => setSubstitutosSelecionados((atuais) => ({
                              ...atuais,
                              [pedido.id]: event.target.value,
                            }))}
                            className="rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10"
                          >
                            <option value="">Selecionar substituto</option>
                            {equipeSelecionada.voluntarios
                              .filter((voluntario) => voluntario.id !== pedido.usuario.id)
                              .map((voluntario) => (
                                <option key={voluntario.id} value={voluntario.id}>
                                  {voluntario.telefone ? `${voluntario.nomeCompleto} - ${voluntario.telefone}` : voluntario.nomeCompleto}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            disabled={salvando}
                            onClick={() => atribuirSubstituto(pedido.id)}
                            className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:opacity-60"
                          >
                            <UserPlus size={15} />
                            Atribuir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Painel>

              <Painel
                titulo="Escalas esporádicas solicitadas"
                icone={CalendarPlus}
                badge={pedidosEscalasEsporadicas.length}
              >
                {pedidosEscalasEsporadicas.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhuma escala esporádica aguardando atribuição.</p>
                ) : (
                  <div className="space-y-3">
                    {pedidosEscalasEsporadicas.map((escala) => (
                      <div key={escala.id} className="rounded-md border border-amber-100 bg-amber-50 p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-bold text-gray-950">{escala.titulo || 'Escala esporádica'}</p>
                            <p className="mt-1 text-xs font-semibold text-amber-700">{formatarData(escala.dataHora)}</p>
                            {escala.local && <p className="mt-1 text-xs text-gray-600">Local: {escala.local}</p>}
                            {escala.descricao && <p className="mt-2 text-sm text-gray-700">{escala.descricao}</p>}
                          </div>
                          <button
                            type="button"
                            onClick={() => editarEscala(escala)}
                            className="inline-flex items-center justify-center gap-2 rounded-md bg-amber-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-800"
                          >
                            <UserPlus size={15} />
                            Atribuir voluntários
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Painel>

              <Painel titulo="Voluntários" icone={UsersRound}>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">{equipeSelecionada.voluntarios.length} voluntário(s) cadastrado(s)</p>
                    <p className="mt-1 text-xs text-gray-500">Cadastre ou consulte os dados dos voluntários da equipe.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMostrarCadastroVoluntario((atual) => !atual)}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
                  >
                    <UserPlus size={15} />
                    {mostrarCadastroVoluntario ? 'Fechar cadastro' : 'Cadastrar voluntário'}
                  </button>
                </div>
                <div className="space-y-2">
                  {equipeSelecionada.voluntarios.map((voluntario) => (
                    <div key={voluntario.id} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <UsuarioInfoButton usuario={voluntario} onClick={setUsuarioModal} />
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                            <p className="truncate text-sm font-bold text-gray-950">{voluntario.nomeCompleto}</p>
                            {voluntario.telefone && (
                              <span className="text-[11px] font-medium text-gray-400">{voluntario.telefone}</span>
                            )}
                          </div>
                          <p className="truncate text-xs text-gray-500">{voluntario.email}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={salvando}
                        onClick={() => removerVoluntario(voluntario.id)}
                        className="rounded-md border border-red-100 bg-white p-2 text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                        title="Remover da equipe"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </Painel>

              {mostrarCadastroVoluntario && (
                <Painel titulo="Cadastrar voluntário" icone={UserPlus}>
                  <form onSubmit={cadastrarVoluntario} className="space-y-3">
                    <Campo label="Nome completo" value={formVoluntario.nomeCompleto} onChange={(value) => setFormVoluntario((atual) => ({ ...atual, nomeCompleto: value }))} />
                    <Campo label="E-mail" type="email" value={formVoluntario.email} onChange={(value) => setFormVoluntario((atual) => ({ ...atual, email: value }))} />
                    <Campo label="Telefone" value={formVoluntario.telefone} onChange={(value) => setFormVoluntario((atual) => ({ ...atual, telefone: value }))} />
                    <Campo label="Senha temporária" value={formVoluntario.senha} placeholder="Mcom@123" onChange={(value) => setFormVoluntario((atual) => ({ ...atual, senha: value }))} />
                    <div className="flex flex-wrap gap-2">
                      <button disabled={salvando} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60">
                        <Plus size={16} />
                        Adicionar à equipe
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMostrarCadastroVoluntario(false);
                          setFormVoluntario(formVoluntarioInicial);
                        }}
                        className="rounded-md border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                </Painel>
              )}
            </section>

            <section className="space-y-5">
              {mostrarAtribuirVoluntarios && (
              <Painel titulo="Atribuir voluntários" icone={CalendarPlus}>
                <form onSubmit={salvarEscala} className="space-y-4">
                  {formEscala.id ? (
                    <div className="rounded-md border border-dourado-100 bg-dourado-50 px-3 py-3">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-dourado-700">Escala selecionada</p>
                      <p className="mt-1 text-sm font-bold text-gray-950">{formEscala.titulo || 'Escala sem título'}</p>
                      <p className="mt-1 text-xs text-gray-600">
                        Altere somente os voluntários atribuídos a esta escala. O evento é criado e editado pelo administrador.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
                      Selecione uma escala na listagem abaixo para atribuir voluntários.
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-sm font-semibold text-gray-700">Voluntários escalados</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {equipeSelecionada.voluntarios.map((voluntario) => (
                        <label key={voluntario.id} className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">
                          <input
                            type="checkbox"
                            checked={formEscala.voluntarioIds.includes(voluntario.id)}
                            onChange={() => alternarVoluntarioNaEscala(voluntario.id)}
                          />
                          <UsuarioInfoButton usuario={voluntario} onClick={setUsuarioModal} className="h-7 w-7" />
                          <span className="min-w-0">
                            <span className="block truncate">{voluntario.nomeCompleto}</span>
                            {voluntario.telefone && (
                              <span className="block text-[11px] font-medium text-gray-400">{voluntario.telefone}</span>
                            )}
                          </span>
                          {formEscala.substitutoIds.includes(voluntario.id) && (
                            <span className="ml-auto rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700">
                              Substituto
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-semibold text-gray-700">Marcar como substituto</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {equipeSelecionada.voluntarios.map((voluntario) => (
                        <label key={voluntario.id} className="flex items-center gap-2 rounded-md border border-violet-100 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800">
                          <input
                            type="checkbox"
                            checked={formEscala.substitutoIds.includes(voluntario.id)}
                            onChange={() => alternarSubstituto(voluntario.id)}
                          />
                          <UsuarioInfoButton usuario={voluntario} onClick={setUsuarioModal} className="h-7 w-7" />
                          <span className="min-w-0">
                            <span className="block truncate">{voluntario.nomeCompleto}</span>
                            {voluntario.telefone && (
                              <span className="block text-[11px] font-medium text-violet-500/70">{voluntario.telefone}</span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button disabled={salvando || !formEscala.id} className="inline-flex items-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60">
                      <Save size={16} />
                      Salvar atribuições
                    </button>
                    {formEscala.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormEscala(formEscalaInicial);
                          setMostrarAtribuirVoluntarios(false);
                        }}
                        className="rounded-md border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </form>
              </Painel>
              )}

              <Painel titulo="Escalas da equipe" icone={CalendarPlus}>
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Escalas fixas</p>
                    <div className="flex flex-wrap gap-2">
                      {filtrosRecorrentes.map((filtro) => (
                        <button
                          key={filtro.chave}
                          type="button"
                          onClick={() => setFiltroEscala(filtro.chave)}
                          className={`rounded-md border px-3 py-2 text-sm font-bold transition ${
                            filtroEscala === filtro.chave
                              ? 'border-gray-950 bg-gray-950 text-white'
                              : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          {filtro.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {escalasEsporadicas.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Escalas esporádicas</p>
                      <div className="flex flex-wrap gap-2">
                        {escalasEsporadicas.map((escala) => {
                          const chave = `ESPORADICA:${escala.id}`;

                          return (
                            <button
                              key={escala.id}
                              type="button"
                              onClick={() => setFiltroEscala(chave)}
                              className={`rounded-md border px-3 py-2 text-sm font-bold transition ${
                                filtroEscala === chave
                                  ? 'border-amber-700 bg-amber-700 text-white'
                                  : 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300'
                              }`}
                            >
                              {escala.titulo || 'Escala esporádica'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {equipeSelecionada.escalas.length === 0 ? (
                      <p className="text-sm text-gray-500">Nenhuma escala cadastrada para esta equipe.</p>
                    ) : escalasFiltradas.length === 0 ? (
                      <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                        Nenhuma escala encontrada nesse período.
                      </div>
                    ) : escalasFiltradas.map((escala) => (
                      <div key={escala.id} className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-5 shadow-sm">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-dourado-200 bg-dourado-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-dourado-700">
                                {equipeSelecionada.nome}
                              </span>
                              <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${
                                escala.tipo === 'ESPORADICA'
                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                  : 'border-gray-200 bg-white text-gray-500'
                              }`}
                              >
                                {escala.tipo === 'ESPORADICA' ? 'Esporádica' : 'Recorrente'}
                              </span>
                            </div>
                            <p className="mt-3 text-xl font-bold text-gray-950">{escala.titulo || 'Escala sem título'}</p>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                              <span>{formatarData(escala.dataHora)}</span>
                              {escala.local && <span>Local: {escala.local}</span>}
                              {escala.tipo === 'RECORRENTE' && (
                                <span>{escala.semanaMes}º {escala.diaSemana === 0 ? 'domingo' : 'sábado'}</span>
                              )}
                            </div>
                            {escala.descricao && (
                              <p className="mt-3 text-sm leading-6 text-gray-600">{escala.descricao}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => editarEscala(escala)}
                            className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
                          >
                            <UserPlus size={15} />
                            Atribuir voluntários
                          </button>
                        </div>

                        <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Voluntários da equipe</p>
                              <p className="mt-1 text-sm text-gray-600">
                                Função/equipe: <strong className="font-semibold text-gray-800">{equipeSelecionada.nome}</strong>
                              </p>
                            </div>
                            <span className="text-xs font-semibold text-gray-400">
                              {escala.voluntarios.length} voluntário(s)
                            </span>
                          </div>

                          <div className="mt-4 grid gap-2 md:grid-cols-2">
                            {escala.voluntarios.length === 0 ? (
                              <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500 md:col-span-2">
                                Nenhum voluntário da equipe foi atribuído para esta escala.
                              </div>
                            ) : escala.voluntarios.map((item) => {
                              const config = statusConfig[item.status] || statusConfig.PENDENTE;
                              const Icon = config.icon;

                              return (
                                <div key={item.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                                  <div className="flex items-start gap-2">
                                    <UsuarioInfoButton usuario={item.usuario} onClick={setUsuarioModal} />
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                        <p className="text-sm font-bold text-gray-900">{item.usuario.nomeCompleto}</p>
                                        {item.usuario.telefone && (
                                          <span className="text-[11px] font-medium text-gray-400">{item.usuario.telefone}</span>
                                        )}
                                      </div>
                                    </div>
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
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Painel>
            </section>
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-gray-200 bg-white px-6 py-10 text-gray-500">
            Nenhuma equipe disponível para gerenciamento.
          </div>
        )}
      </main>

      <UsuarioModal usuario={usuarioModal} onClose={() => setUsuarioModal(null)} />
      <Footer />
    </div>
  );
}

function Painel({ titulo, icone: Icon, badge, children }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-dourado-600" />
          <h2 className="text-lg font-bold text-gray-950">{titulo}</h2>
        </div>
        {typeof badge === 'number' && badge > 0 && (
          <span className="rounded-full bg-sky-700 px-2.5 py-1 text-xs font-bold text-white">
            {badge}
          </span>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Campo({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 block w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
      />
    </label>
  );
}

function Feedback({ tipo, mensagem }) {
  const isErro = tipo === 'erro';

  return (
    <div className={`mt-5 flex items-center gap-2 rounded-md border px-4 py-3 text-sm font-medium ${
      isErro ? 'border-red-100 bg-red-50 text-red-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'
    }`}>
      {isErro && <AlertCircle size={16} />}
      {mensagem}
    </div>
  );
}

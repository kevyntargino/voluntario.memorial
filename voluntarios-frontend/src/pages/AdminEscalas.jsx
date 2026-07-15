import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileText,
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
import { UsuarioInfoButton, UsuarioModal } from '../components/UsuarioModal';
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

const formEscalaInicial = {
  tipo: 'ESPORADICA',
  titulo: '',
  data: '',
  horarios: ['09:00'],
  diaSemana: 0,
  semanaMes: 1,
  horario: '18:00',
  local: '',
  descricao: '',
  equipeIds: [],
};
const formAvisoInicial = { titulo: '', mensagem: '', dataAviso: '', publico: 'TODOS', equipeIds: [], usuarioIds: [] };
const formEquipeInicial = { nome: '' };
const formNovoVoluntarioInicial = { nomeCompleto: '', email: '', telefone: '', equipeIds: [] };
const formManualInicial = { titulo: '', descricao: '', versao: '1.0', oculto: false, arquivo: null };
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

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

async function prepararArquivoPdf(file) {
  if (!file) return null;

  if (file.type !== 'application/pdf') {
    throw new Error('Selecione um arquivo PDF.');
  }

  const base64 = await readAsDataUrl(file);
  return {
    fileName: file.name,
    contentType: file.type,
    base64,
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
  const [formEscala, setFormEscala] = useState(formEscalaInicial);
  const [formAviso, setFormAviso] = useState(formAvisoInicial);
  const [formNovoVoluntario, setFormNovoVoluntario] = useState(formNovoVoluntarioInicial);
  const [manuais, setManuais] = useState([]);
  const [formManual, setFormManual] = useState(formManualInicial);
  const getPainelPelaRota = useCallback(() => {
    if (pathname === '/admin/voluntarios') return 'voluntarios';
    if (pathname === '/admin/lideres') return 'lideres';
    if (pathname === '/admin/equipes') return 'equipes';
    if (pathname === '/admin/notificacoes') return 'notificacao';
    if (pathname === '/admin/escalas') return 'escalas';
    if (pathname === '/admin/manuais') return 'manuais';
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
  const [mostrarFormEscala, setMostrarFormEscala] = useState(false);
  const [mostrarFormManual, setMostrarFormManual] = useState(false);
  const [manualEditandoId, setManualEditandoId] = useState(null);
  const [mostrarCadastroVoluntario, setMostrarCadastroVoluntario] = useState(false);
  const [usuarioModal, setUsuarioModal] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState(null);
  const isAdmin = usuario?.permissoes?.includes('ADMINISTRADOR');

  const carregarDados = useCallback(async () => {
    setErro('');
    setCarregando(true);

    try {
      const [respostaDashboard, respostaEscalas, respostaManuais] = await Promise.all([
        fetch(buildApiUrl('/api/admin/dashboard'), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(buildApiUrl('/api/escalas/admin'), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(buildApiUrl('/api/manuais/admin'), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const dadosDashboard = await respostaDashboard.json();
      const dadosEscalas = await respostaEscalas.json();
      const dadosManuais = await respostaManuais.json();

      if (!respostaDashboard.ok || !respostaEscalas.ok || !respostaManuais.ok) {
        if (respostaDashboard.status === 401 || respostaEscalas.status === 401 || respostaManuais.status === 401) {
          logout();
          navigate('/login', { replace: true });
          return;
        }

        throw new Error(dadosDashboard.erro || dadosEscalas.erro || dadosManuais.erro || 'Não foi possível carregar o painel administrativo.');
      }

      setDashboard(dadosDashboard);
      setEquipes(dadosDashboard.equipes || []);
      setUsuarios(dadosDashboard.usuarios || []);
      setRecorrentes(dadosEscalas.recorrentes || []);
      setEsporadicas(dadosEscalas.esporadicas || []);
      setManuais(dadosManuais.manuais || []);
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
        escala.dataHora,
        escala.dataHora ? formatarData(escala.dataHora) : '',
        escala.voluntarios?.map((item) => item.usuario?.nomeCompleto).join(' '),
      ].filter(Boolean).join(' ').toLowerCase().includes(termo))
    ));
    const eventos = new Map();

    for (const escala of filtradas) {
      const data = escala.dataHora ? new Date(escala.dataHora).toISOString() : 'sem-data';
      const chave = escala.tipo === 'ESPORADICA'
        ? `ESPORADICA:${escala.grupoEsporadicoId || escala.id}`
        : `RECORRENTE:${escala.diaSemana}:${escala.semanaMes}:${data}`;
      const tituloRecorrente = `${escala.semanaMes}º ${escala.diaSemana === 0 ? 'Domingo' : 'Sábado'}`;
      const evento = eventos.get(chave) || {
        id: chave,
        titulo: escala.tipo === 'RECORRENTE' ? tituloRecorrente : escala.titulo || 'Escala sem título',
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

  const alternarEquipeNovoVoluntario = (equipeId) => {
    setFormNovoVoluntario((atual) => ({
      ...atual,
      equipeIds: atual.equipeIds.includes(equipeId)
        ? atual.equipeIds.filter((id) => id !== equipeId)
        : [...atual.equipeIds, equipeId],
    }));
  };

  const cadastrarVoluntarioAdmin = async (event) => {
    event.preventDefault();
    setErro('');
    setSucesso('');
    setSalvandoId('novo-voluntario');

    try {
      const resposta = await fetch(buildApiUrl('/api/admin/usuarios'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(formNovoVoluntario),
      });
      const dados = await resposta.json();

      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível cadastrar o voluntário.');

      setSucesso(dados.senhaTemporaria
        ? `${dados.mensagem || 'Voluntário cadastrado.'} Senha temporária: ${dados.senhaTemporaria}`
        : dados.mensagem || 'Voluntário cadastrado.');
      setFormNovoVoluntario(formNovoVoluntarioInicial);
      setMostrarCadastroVoluntario(false);
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível cadastrar o voluntário.');
    } finally {
      setSalvandoId(null);
    }
  };

  const atualizarVinculoEquipe = async ({ usuarioId, equipeId, tipo, adicionar }) => {
    const usuarioAtual = usuarios.find((item) => item.id === usuarioId);

    if (!usuarioAtual) {
      setErro('Usuário não encontrado para atualizar vínculo.');
      return;
    }

    const alternarId = (lista, id, deveAdicionar) => {
      const ids = new Set(lista);
      if (deveAdicionar) ids.add(id);
      else ids.delete(id);
      return Array.from(ids);
    };
    const equipeIdsAtuais = usuarioAtual.equipes?.map((equipe) => equipe.id) || [];
    const liderEquipeIdsAtuais = usuarioAtual.equipesLideradas?.map((equipe) => equipe.id) || [];
    const proximosEquipeIds = tipo === 'voluntario'
      ? alternarId(equipeIdsAtuais, equipeId, adicionar)
      : equipeIdsAtuais;
    const proximosLiderEquipeIds = tipo === 'lider'
      ? alternarId(liderEquipeIdsAtuais, equipeId, adicionar)
      : liderEquipeIdsAtuais;
    const permissoesBase = new Set(usuarioAtual.permissoes || []);

    if (tipo === 'voluntario' && adicionar) {
      permissoesBase.add('VOLUNTARIO');
    }

    if (tipo === 'lider' && adicionar) {
      permissoesBase.add('LIDER_EQUIPE');
    }

    const chaveSalvando = `${tipo}-${usuarioId}-${equipeId}`;
    setErro('');
    setSucesso('');
    setSalvandoId(chaveSalvando);

    try {
      const resposta = await fetch(buildApiUrl(`/api/admin/usuarios/${usuarioId}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomeCompleto: usuarioAtual.nomeCompleto,
          telefone: usuarioAtual.telefone || '',
          permissoes: Array.from(permissoesBase),
          equipeIds: proximosEquipeIds,
          liderEquipeIds: proximosLiderEquipeIds,
        }),
      });
      const dados = await resposta.json();

      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível atualizar o vínculo.');

      setSucesso(dados.mensagem || 'Vínculo atualizado com sucesso.');
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível atualizar o vínculo.');
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
    const setter = campo === 'aviso' ? setFormAviso : setFormEscala;
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
    setSalvandoId('nova-escala');

    const dataHoras = (formEscala.horarios || [])
      .filter((horario) => horario)
      .map((horario) => `${formEscala.data}T${horario}`);
    const endpoint = formEscala.tipo === 'RECORRENTE'
      ? '/api/escalas/admin/recorrentes'
      : '/api/escalas/admin/esporadicas';
    const body = formEscala.tipo === 'RECORRENTE'
      ? formEscala
      : {
        ...formEscala,
        dataHoras,
      };

    try {
      const resposta = await fetch(buildApiUrl(endpoint), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível criar a escala.');
      setSucesso(dados.mensagem || 'Escala criada.');
      setFormEscala(formEscalaInicial);
      setMostrarFormEscala(false);
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível criar a escala.');
    } finally {
      setSalvandoId(null);
    }
  };

  const salvarManual = async (event) => {
    event.preventDefault();
    setErro('');
    setSucesso('');
    setSalvandoId(manualEditandoId || 'novo-manual');

    try {
      const arquivo = await prepararArquivoPdf(formManual.arquivo);
      const resposta = await fetch(buildApiUrl(manualEditandoId ? `/api/manuais/admin/${manualEditandoId}` : '/api/manuais/admin'), {
        method: manualEditandoId ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: formManual.titulo,
          descricao: formManual.descricao,
          versao: formManual.versao,
          oculto: formManual.oculto,
          arquivo,
        }),
      });
      const dados = await resposta.json();

      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível salvar o manual.');

      setSucesso(dados.mensagem || 'Manual salvo com sucesso.');
      setFormManual(formManualInicial);
      setManualEditandoId(null);
      setMostrarFormManual(false);
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível salvar o manual.');
    } finally {
      setSalvandoId(null);
    }
  };

  const editarManual = (manual) => {
    setManualEditandoId(manual.id);
    setFormManual({
      titulo: manual.titulo || '',
      descricao: manual.descricao || '',
      versao: manual.versao || '1.0',
      oculto: Boolean(manual.oculto),
      arquivo: null,
    });
    setMostrarFormManual(true);
  };

  const alternarOcultarManual = async (manual) => {
    setErro('');
    setSucesso('');
    setSalvandoId(`manual-oculto-${manual.id}`);

    try {
      const resposta = await fetch(buildApiUrl(`/api/manuais/admin/${manual.id}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: manual.titulo,
          descricao: manual.descricao || '',
          versao: manual.versao || '1.0',
          oculto: !manual.oculto,
        }),
      });
      const dados = await resposta.json();

      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível atualizar a visibilidade.');

      setSucesso(dados.mensagem || 'Visibilidade atualizada.');
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível atualizar a visibilidade.');
    } finally {
      setSalvandoId(null);
    }
  };

  const excluirManual = async (manualId) => {
    setErro('');
    setSucesso('');
    setSalvandoId(`manual-delete-${manualId}`);

    try {
      const resposta = await fetch(buildApiUrl(`/api/manuais/admin/${manualId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await resposta.json();

      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível excluir o manual.');

      setSucesso(dados.mensagem || 'Manual excluído.');
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível excluir o manual.');
    } finally {
      setSalvandoId(null);
    }
  };

  const abrirArquivoManual = async (manual) => {
    setErro('');

    try {
      const resposta = await fetch(buildApiUrl(`/api/manuais/${manual.id}/arquivo`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => ({}));
        throw new Error(dados.erro || 'Não foi possível abrir o manual.');
      }

      const blob = await resposta.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) {
      setErro(error.message || 'Não foi possível abrir o manual.');
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col bg-[#f7f4ed] text-gray-900">
        <Navbar />
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
          <div className="rounded-lg border border-red-100 bg-red-50 p-5 text-red-700">Acesso restrito a administradores.</div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f4ed] text-gray-900">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
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
              <ProximaEscala escala={dashboard?.proximaEscala} onAbrirUsuario={setUsuarioModal} />

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-gray-950">Ações rápidas</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <BotaoPainel ativo={painelAberto === 'voluntarios'} icon={UsersRound} label="Ver voluntários" onClick={() => abrirPainel('voluntarios', '/admin/voluntarios')} />
                  <BotaoPainel ativo={painelAberto === 'lideres'} icon={UserCog} label="Ver líderes de equipe" onClick={() => abrirPainel('lideres', '/admin/lideres')} />
                  <BotaoPainel ativo={painelAberto === 'equipes'} icon={ShieldCheck} label="Ver equipes" onClick={() => abrirPainel('equipes', '/admin/equipes')} />
                  <BotaoPainel ativo={painelAberto === 'notificacao'} icon={Megaphone} label="Enviar notificação" onClick={() => abrirPainel('notificacao', '/admin/notificacoes')} />
                  <BotaoPainel ativo={painelAberto === 'escalas'} icon={CalendarClock} label="Gerenciar escalas" onClick={() => abrirPainel('escalas', '/admin/escalas')} />
                  <BotaoPainel ativo={painelAberto === 'manuais'} icon={BookOpen} label="Gerenciar Manuais" onClick={() => abrirPainel('manuais', '/admin/manuais')} />
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
                onAbrirUsuario={setUsuarioModal}
                permiteCadastrar={painelAberto === 'voluntarios'}
                mostrarCadastro={mostrarCadastroVoluntario}
                formNovoVoluntario={formNovoVoluntario}
                onMostrarCadastro={setMostrarCadastroVoluntario}
                onChangeNovoVoluntario={setFormNovoVoluntario}
                onAlternarEquipeNovoVoluntario={alternarEquipeNovoVoluntario}
                onCadastrarVoluntario={cadastrarVoluntarioAdmin}
              />
            )}

            {painelAberto === 'equipes' && (
              <PainelEquipes
                equipes={equipes}
                usuarios={usuarios}
                equipeSelecionada={equipeSelecionada}
                formEquipe={formEquipe}
                salvandoId={salvandoId}
                onChangeEquipe={setFormEquipe}
                onCriarEquipe={criarEquipe}
                onExcluirEquipe={excluirEquipe}
                onSelecionarEquipe={setEquipeSelecionadaId}
                onAbrirUsuario={setUsuarioModal}
                onAtualizarVinculo={atualizarVinculoEquipe}
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
                onAbrirUsuario={setUsuarioModal}
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
                formRecorrentes={formRecorrentes}
                formEscala={formEscala}
                salvandoId={salvandoId}
                onAlterarRecorrente={alterarRecorrente}
                onSalvarRecorrente={salvarRecorrente}
                onTipoEscalas={setTipoEscalas}
                onFiltroRecorrencia={setFiltroRecorrenciaAdmin}
                onBuscaEscalas={setBuscaEscalas}
                onOrdemEscalas={setOrdemEscalas}
                onEditarEscala={setEscalaEditandoId}
                onChangeEscala={setFormEscala}
                onAlternarEquipe={(equipeId) => alternarEquipe('esporadica', equipeId)}
                onCriarEsporadica={criarEsporadica}
                onAbrirUsuario={setUsuarioModal}
                mostrarFormEscala={mostrarFormEscala}
                onMostrarFormEscala={setMostrarFormEscala}
              />
            )}

            {painelAberto === 'manuais' && (
              <PainelManuais
                manuais={manuais}
                formManual={formManual}
                mostrarFormManual={mostrarFormManual}
                manualEditandoId={manualEditandoId}
                salvandoId={salvandoId}
                onMostrarFormManual={setMostrarFormManual}
                onChangeManual={setFormManual}
                onSalvarManual={salvarManual}
                onEditarManual={editarManual}
                onCancelarManual={() => {
                  setFormManual(formManualInicial);
                  setManualEditandoId(null);
                  setMostrarFormManual(false);
                }}
                onAlternarOcultarManual={alternarOcultarManual}
                onExcluirManual={excluirManual}
                onAbrirArquivoManual={abrirArquivoManual}
              />
            )}
          </>
        )}
      </main>
      <UsuarioModal usuario={usuarioModal} onClose={() => setUsuarioModal(null)} />
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

function ProximaEscala({ escala, onAbrirUsuario }) {
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
                  <div className="flex items-start gap-2">
                    <UsuarioInfoButton usuario={item.usuario} onClick={onAbrirUsuario} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <p className="text-sm font-semibold text-gray-800">{item.usuario.nomeCompleto}</p>
                        {item.usuario.telefone && (
                          <span className="text-[11px] font-medium text-gray-400">{item.usuario.telefone}</span>
                        )}
                      </div>
                    </div>
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

function PainelUsuarios({
  titulo,
  usuarios,
  equipes,
  formsUsuarios,
  salvandoId,
  editandoUsuarioId,
  onEditar,
  onAlterar,
  onAlternarPermissao,
  onAlternarEquipe,
  onAlternarLiderEquipe,
  onSalvar,
  onExcluir,
  onAbrirUsuario,
  permiteCadastrar = false,
  mostrarCadastro = false,
  formNovoVoluntario = formNovoVoluntarioInicial,
  onMostrarCadastro,
  onChangeNovoVoluntario,
  onAlternarEquipeNovoVoluntario,
  onCadastrarVoluntario,
}) {
  const [busca, setBusca] = useState('');
  const [equipeFiltro, setEquipeFiltro] = useState('TODAS');
  const [ordem, setOrdem] = useState('nome-asc');
  const isLideres = titulo.toLowerCase().includes('líder');
  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return usuarios
      .filter((usuario) => {
        const equipesDoUsuario = isLideres ? usuario.equipesLideradas || [] : usuario.equipes || [];
        const correspondeEquipe = equipeFiltro === 'TODAS' || equipesDoUsuario.some((equipe) => equipe.id === equipeFiltro);
        const texto = [
          usuario.nomeCompleto,
          usuario.email,
          usuario.telefone,
          usuario.permissoes?.join(' '),
          usuario.equipes?.map((equipe) => equipe.nome).join(' '),
          usuario.equipesLideradas?.map((equipe) => equipe.nome).join(' '),
        ].filter(Boolean).join(' ').toLowerCase();

        return correspondeEquipe && (!termo || texto.includes(termo));
      })
      .sort((a, b) => {
        if (ordem === 'nome-desc') return (b.nomeCompleto || '').localeCompare(a.nomeCompleto || '', 'pt-BR');
        if (ordem === 'recentes') return new Date(b.criadoEm || 0).getTime() - new Date(a.criadoEm || 0).getTime();
        return (a.nomeCompleto || '').localeCompare(b.nomeCompleto || '', 'pt-BR');
      });
  }, [busca, equipeFiltro, isLideres, ordem, usuarios]);

  return (
    <section className="mt-5 rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-950">{titulo}</h2>
            <p className="mt-1 text-sm text-gray-500">{usuariosFiltrados.length} usuário(s) encontrado(s).</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] lg:min-w-[680px]">
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                className="block w-full rounded-md border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                placeholder="Pesquisar por nome, email, telefone ou equipe"
              />
            </label>
            <select
              value={equipeFiltro}
              onChange={(event) => setEquipeFiltro(event.target.value)}
              className="rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
            >
              <option value="TODAS">Todas as equipes</option>
              {equipes.map((equipe) => (
                <option key={equipe.id} value={equipe.id}>{equipe.nome}</option>
              ))}
            </select>
            <select
              value={ordem}
              onChange={(event) => setOrdem(event.target.value)}
              className="rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
            >
              <option value="nome-asc">Nome A-Z</option>
              <option value="nome-desc">Nome Z-A</option>
              <option value="recentes">Mais recentes</option>
            </select>
          </div>
        </div>
        {permiteCadastrar && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => onMostrarCadastro((atual) => !atual)}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              <Plus size={16} />
              {mostrarCadastro ? 'Fechar cadastro' : 'Cadastrar voluntário'}
            </button>
          </div>
        )}
      </div>
      {permiteCadastrar && mostrarCadastro && (
        <form onSubmit={onCadastrarVoluntario} className="grid gap-4 border-b border-gray-100 bg-gray-50 px-5 py-5 lg:grid-cols-2">
          <Campo label="Nome completo" value={formNovoVoluntario.nomeCompleto} onChange={(value) => onChangeNovoVoluntario((atual) => ({ ...atual, nomeCompleto: value }))} />
          <Campo label="E-mail" type="email" value={formNovoVoluntario.email} onChange={(value) => onChangeNovoVoluntario((atual) => ({ ...atual, email: value }))} />
          <Campo label="Telefone" value={formNovoVoluntario.telefone} onChange={(value) => onChangeNovoVoluntario((atual) => ({ ...atual, telefone: value }))} />
          <div className="lg:col-span-2">
            <p className="mb-3 rounded-md border border-dourado-100 bg-dourado-50 px-3 py-2 text-sm font-semibold text-dourado-800">
              A senha inicial será gerada automaticamente como NomeDoVoluntario123.
            </p>
            <GrupoChecks titulo="Equipes do voluntário">
              {equipes.map((equipe) => (
                <label key={equipe.id} className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <input type="checkbox" checked={formNovoVoluntario.equipeIds.includes(equipe.id)} onChange={() => onAlternarEquipeNovoVoluntario(equipe.id)} />
                  {equipe.nome}
                </label>
              ))}
            </GrupoChecks>
          </div>
          <div className="flex flex-wrap gap-2 lg:col-span-2">
            <button disabled={salvandoId === 'novo-voluntario'} className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60">
              {salvandoId === 'novo-voluntario' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus size={16} />}
              Adicionar voluntário
            </button>
            <button
              type="button"
              onClick={() => {
                onMostrarCadastro(false);
                onChangeNovoVoluntario(formNovoVoluntarioInicial);
              }}
              className="rounded-md border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      <div className="divide-y divide-gray-100">
        {usuariosFiltrados.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-500">
            Nenhum usuário encontrado com os filtros selecionados.
          </div>
        ) : usuariosFiltrados.map((usuario) => {
          const form = formsUsuarios[usuario.id] || criarFormUsuario(usuario);
          const editando = editandoUsuarioId === usuario.id;

          return (
            <div key={usuario.id} className="px-5 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <UsuarioInfoButton usuario={usuario} onClick={onAbrirUsuario} />
                  <div className="min-w-0">
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

function PainelEquipes({ equipes, usuarios, equipeSelecionada, formEquipe, salvandoId, onChangeEquipe, onCriarEquipe, onExcluirEquipe, onSelecionarEquipe, onAbrirUsuario, onAtualizarVinculo }) {
  const equipeAtiva = equipeSelecionada || equipes[0] || null;
  const [novoLiderId, setNovoLiderId] = useState('');
  const [novoVoluntarioId, setNovoVoluntarioId] = useState('');
  const lideresDisponiveis = useMemo(() => (
    usuarios.filter((usuario) => !usuario.equipesLideradas?.some((equipe) => equipe.id === equipeAtiva?.id))
  ), [equipeAtiva?.id, usuarios]);
  const voluntariosDisponiveis = useMemo(() => (
    usuarios.filter((usuario) => !usuario.equipes?.some((equipe) => equipe.id === equipeAtiva?.id))
  ), [equipeAtiva?.id, usuarios]);

  useEffect(() => {
    setNovoLiderId('');
    setNovoVoluntarioId('');
  }, [equipeAtiva?.id]);

  const adicionarLider = () => {
    if (!novoLiderId || !equipeAtiva) return;
    onAtualizarVinculo({ usuarioId: novoLiderId, equipeId: equipeAtiva.id, tipo: 'lider', adicionar: true });
  };

  const adicionarVoluntario = () => {
    if (!novoVoluntarioId || !equipeAtiva) return;
    onAtualizarVinculo({ usuarioId: novoVoluntarioId, equipeId: equipeAtiva.id, tipo: 'voluntario', adicionar: true });
  };

  return (
    <section className="mt-5 space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-950">Equipes cadastradas</h2>
            <p className="mt-1 text-sm text-gray-500">Clique em uma equipe para visualizar liderança e voluntários.</p>
          </div>
          <form onSubmit={onCriarEquipe} className="flex gap-2 lg:min-w-[420px]">
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
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {equipes.map((equipe) => (
            <button
              key={equipe.id}
              type="button"
              onClick={() => onSelecionarEquipe(equipe.id)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition ${
                equipeAtiva?.id === equipe.id
                  ? 'border-gray-950 bg-gray-950 text-white'
                  : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300'
              }`}
            >
              {equipe.nome}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        {!equipeAtiva ? (
          <div className="p-8 text-sm text-gray-500">
            Nenhuma equipe cadastrada ainda.
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-dourado-700">Equipe</p>
                <h2 className="mt-1 text-2xl font-bold text-gray-950">{equipeAtiva.nome}</h2>
                <p className="mt-1 text-sm text-gray-500">{equipeAtiva.voluntarios?.length || 0} voluntário(s) cadastrados.</p>
              </div>
              <button type="button" disabled={salvandoId === equipeAtiva.id} onClick={() => onExcluirEquipe(equipeAtiva.id)} className="inline-flex items-center justify-center gap-2 rounded-md border border-red-100 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">
                <Trash2 size={16} />
                Excluir equipe
              </button>
            </div>
            <div className="grid gap-5 p-5 lg:grid-cols-2">
              <div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-gray-500">Liderança</h3>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <select
                      value={novoLiderId}
                      onChange={(event) => setNovoLiderId(event.target.value)}
                      className="min-w-0 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                    >
                      <option value="">Adicionar líder</option>
                      {lideresDisponiveis.map((usuario) => (
                        <option key={usuario.id} value={usuario.id}>{usuario.nomeCompleto}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!novoLiderId || salvandoId?.startsWith('lider-')}
                      onClick={adicionarLider}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:opacity-50"
                    >
                      <Plus size={15} />
                      Adicionar
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {(equipeAtiva.lideres || []).length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhum líder cadastrado nesta equipe.</p>
                  ) : equipeAtiva.lideres.map((lider) => (
                    <Contato
                      key={lider.id}
                      pessoa={lider}
                      onAbrirUsuario={onAbrirUsuario}
                      acaoExtra={(
                        <button
                          type="button"
                          disabled={salvandoId === `lider-${lider.id}-${equipeAtiva.id}`}
                          onClick={() => onAtualizarVinculo({ usuarioId: lider.id, equipeId: equipeAtiva.id, tipo: 'lider', adicionar: false })}
                          className="rounded-md border border-red-100 bg-white px-2.5 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          Remover líder
                        </button>
                      )}
                    />
                  ))}
                </div>
              </div>
              <div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-gray-500">Voluntários</h3>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <select
                      value={novoVoluntarioId}
                      onChange={(event) => setNovoVoluntarioId(event.target.value)}
                      className="min-w-0 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                    >
                      <option value="">Adicionar voluntário</option>
                      {voluntariosDisponiveis.map((usuario) => (
                        <option key={usuario.id} value={usuario.id}>{usuario.nomeCompleto}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!novoVoluntarioId || salvandoId?.startsWith('voluntario-')}
                      onClick={adicionarVoluntario}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
                    >
                      <Plus size={15} />
                      Adicionar
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {(equipeAtiva.voluntarios || []).length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhum voluntário cadastrado nesta equipe.</p>
                  ) : equipeAtiva.voluntarios.map((voluntario) => (
                    <Contato
                      key={voluntario.id}
                      pessoa={voluntario}
                      onAbrirUsuario={onAbrirUsuario}
                      acaoExtra={(
                        <button
                          type="button"
                          disabled={salvandoId === `voluntario-${voluntario.id}-${equipeAtiva.id}`}
                          onClick={() => onAtualizarVinculo({ usuarioId: voluntario.id, equipeId: equipeAtiva.id, tipo: 'voluntario', adicionar: false })}
                          className="rounded-md border border-red-100 bg-white px-2.5 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          Remover
                        </button>
                      )}
                    />
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

function Contato({ pessoa, onAbrirUsuario, acaoExtra = null }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-2">
        <UsuarioInfoButton usuario={pessoa} onClick={onAbrirUsuario} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="text-sm font-bold text-gray-950">{pessoa.nomeCompleto}</p>
            {pessoa.telefone && (
              <span className="text-[11px] font-medium text-gray-400">{pessoa.telefone}</span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">{pessoa.email}</p>
        </div>
      </div>
      {acaoExtra}
    </div>
  );
}

function PainelNotificacao({ equipes, usuarios, formAviso, salvandoId, onSubmit, onChange, onAlternarEquipe, onAlternarUsuario, onAbrirUsuario }) {
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
                <UsuarioInfoButton usuario={user} onClick={onAbrirUsuario} className="h-7 w-7" />
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
  formRecorrentes,
  formEscala,
  salvandoId,
  onAlterarRecorrente,
  onSalvarRecorrente,
  onTipoEscalas,
  onFiltroRecorrencia,
  onBuscaEscalas,
  onOrdemEscalas,
  onEditarEscala,
  onChangeEscala,
  onAlternarEquipe,
  onCriarEsporadica,
  onAbrirUsuario,
  mostrarFormEscala,
  onMostrarFormEscala,
}) {
  const agora = new Date();
  const eventosFuturos = eventos.filter((evento) => !evento.dataHora || new Date(evento.dataHora) >= agora);
  const eventosEsporadicos = eventos.filter((evento) => evento.tipo === 'ESPORADICA');
  const eventosRecorrentes = eventos.filter((evento) => evento.tipo === 'RECORRENTE');
  const eventosListagem = [...eventosEsporadicos, ...eventosRecorrentes];
  const tituloListagem = tipoEscalas === 'ESPORADICA'
    ? 'Escalas esporádicas'
    : tipoEscalas === 'RECORRENTE'
      ? 'Escalas recorrentes'
      : 'Escalas esporádicas';

  return (
    <section className="mt-5 grid min-w-0 gap-5">
      <div className="min-w-0 rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-950">Gerenciar escalas</h2>
              <p className="mt-1 text-sm text-gray-500">
                Veja cada escala como um evento e acompanhe as pessoas escaladas por função/equipe.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
              <button
                type="button"
                onClick={() => onMostrarFormEscala((atual) => !atual)}
                className="inline-flex items-center gap-2 rounded-md bg-dourado-700 px-3 py-2 text-sm font-bold text-white transition hover:bg-dourado-800"
              >
                <Plus size={16} />
                {mostrarFormEscala ? 'Fechar nova escala' : 'Nova Escala'}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {mostrarFormEscala && (
            <div className="rounded-2xl border border-dourado-100 bg-dourado-50/60 p-4 shadow-sm">
              <form onSubmit={onCriarEsporadica} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-gray-950">Nova Escala</h2>
                    <p className="mt-1 text-sm text-gray-500">Escolha se a escala será recorrente ou esporádica e selecione as equipes envolvidas.</p>
                  </div>
                  <button
                    disabled={salvandoId === 'nova-escala'}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-dourado-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {salvandoId === 'nova-escala' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
                    Salvar escala
                  </button>
                </div>

                <div>
                  <span className="text-sm font-semibold text-gray-700">Tipo</span>
                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1">
                    {[
                      { value: 'ESPORADICA', label: 'Esporádica' },
                      { value: 'RECORRENTE', label: 'Recorrente' },
                    ].map((opcao) => (
                      <button
                        key={opcao.value}
                        type="button"
                        onClick={() => onChangeEscala((atual) => ({ ...atual, tipo: opcao.value }))}
                        className={`rounded-md px-3 py-2 text-sm font-bold transition ${
                          formEscala.tipo === opcao.value ? 'bg-gray-950 text-white' : 'text-gray-600 hover:bg-white'
                        }`}
                      >
                        {opcao.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Campo label="Título" value={formEscala.titulo} onChange={(value) => onChangeEscala((atual) => ({ ...atual, titulo: value }))} />

                {formEscala.tipo === 'ESPORADICA' ? (
                  <div>
                    <Campo label="Data" type="date" value={formEscala.data} onChange={(value) => onChangeEscala((atual) => ({ ...atual, data: value }))} />
                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-gray-700">Horários</span>
                        <button
                          type="button"
                          onClick={() => onChangeEscala((atual) => ({ ...atual, horarios: [...(atual.horarios || []), ''] }))}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
                        >
                          <Plus size={13} />
                          Adicionar horário
                        </button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {(formEscala.horarios || []).map((horario, index) => (
                          <div key={`${index}-${horario}`} className="flex gap-2">
                            <input
                              type="time"
                              value={horario}
                              onChange={(event) => onChangeEscala((atual) => ({
                                ...atual,
                                horarios: (atual.horarios || []).map((item, itemIndex) => (itemIndex === index ? event.target.value : item)),
                              }))}
                              className="block min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                            />
                            {(formEscala.horarios || []).length > 1 && (
                              <button
                                type="button"
                                onClick={() => onChangeEscala((atual) => ({
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
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Select label="Dia" value={formEscala.diaSemana} options={dias} onChange={(value) => onChangeEscala((atual) => ({ ...atual, diaSemana: Number(value) }))} />
                    <Select label="Fim de semana" value={formEscala.semanaMes} options={semanas.map((semana) => ({ value: semana, label: `${semana}º` }))} onChange={(value) => onChangeEscala((atual) => ({ ...atual, semanaMes: Number(value) }))} />
                    <Campo label="Horário" type="time" value={formEscala.horario} onChange={(value) => onChangeEscala((atual) => ({ ...atual, horario: value }))} />
                  </div>
                )}

                <div className="grid gap-3 lg:grid-cols-2">
                  <Campo label="Local" value={formEscala.local} onChange={(value) => onChangeEscala((atual) => ({ ...atual, local: value }))} />
                  <CampoTexto label="Descrição" value={formEscala.descricao} onChange={(value) => onChangeEscala((atual) => ({ ...atual, descricao: value }))} />
                </div>
                <GrupoChecks titulo="Equipes solicitadas">
                  {equipes.map((equipe) => (
                    <label key={equipe.id} className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <input type="checkbox" checked={formEscala.equipeIds.includes(equipe.id)} onChange={() => onAlternarEquipe(equipe.id)} />
                      {equipe.nome}
                    </label>
                  ))}
                </GrupoChecks>
                <button disabled={salvandoId === 'nova-escala'} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                  {salvandoId === 'nova-escala' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={16} />}
                  Salvar escala e enviar para líderes
                </button>
              </form>
            </div>
          )}

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

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Próximas escalas</p>
                <p className="mt-1 text-sm text-gray-600">Cards roláveis das próximas datas dentro dos filtros atuais.</p>
              </div>
              <span className="text-xs font-bold text-gray-400">{eventosFuturos.length} futura(s)</span>
            </div>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
              {eventosFuturos.length === 0 ? (
                <div className="min-w-full rounded-lg border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
                  Nenhuma escala futura encontrada para esse filtro.
                </div>
              ) : eventosFuturos.map((evento) => (
                <button
                  key={`futuro-${evento.id}`}
                  type="button"
                  onClick={() => onBuscaEscalas(evento.titulo)}
                  className="min-w-[230px] max-w-[260px] shrink-0 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300"
                >
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                    evento.tipo === 'ESPORADICA'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-gray-200 bg-gray-50 text-gray-500'
                  }`}
                  >
                    {evento.tipo === 'ESPORADICA' ? 'Esporádica' : 'Recorrente'}
                  </span>
                  <p className="mt-3 line-clamp-2 text-sm font-bold text-gray-950">{evento.titulo}</p>
                  <p className="mt-2 text-xs font-semibold text-gray-500">{formatarData(evento.dataHora)}</p>
                  <p className="mt-1 text-xs text-gray-400">{evento.areas.length} área(s)</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {eventosListagem.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
                Nenhuma escala encontrada para esse filtro.
              </div>
            ) : (
              <>
                <div>
                  <p className={`text-xs font-bold uppercase tracking-[0.14em] ${tipoEscalas === 'RECORRENTE' ? 'text-gray-500' : 'text-amber-700'}`}>{tituloListagem}</p>
                  {eventosEsporadicos.length === 0 && (
                    tipoEscalas !== 'RECORRENTE' && (
                    <p className="mt-2 rounded-lg border border-dashed border-amber-100 bg-amber-50 px-4 py-5 text-sm text-amber-700">
                      Nenhuma escala esporádica encontrada com os filtros atuais.
                    </p>
                    )
                  )}
                </div>
                {eventosListagem.map((evento, index) => {
                  const mostrarTituloRecorrente = evento.tipo === 'RECORRENTE' && eventosListagem[index - 1]?.tipo !== 'RECORRENTE';

                  return (
                    <React.Fragment key={evento.id}>
                      {mostrarTituloRecorrente && (
                        <p className="pt-2 text-xs font-bold uppercase tracking-[0.14em] text-gray-500">Escalas recorrentes</p>
                      )}
                <div className="min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-4 shadow-sm sm:p-5">
                  <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 max-w-full">
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
                      <h3 className="mt-3 break-words text-xl font-bold text-gray-950">{evento.titulo}</h3>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                        <span>{formatarData(evento.dataHora)}</span>
                        {evento.local && <span>Local: {evento.local}</span>}
                        {evento.tipo === 'RECORRENTE' && (
                          <span>{evento.semanaMes}º {evento.diaSemana === 0 ? 'domingo' : 'sábado'}</span>
                        )}
                      </div>
                      {evento.descricao && (
                        <p className="mt-3 max-w-2xl break-words text-sm leading-6 text-gray-600">{evento.descricao}</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 max-w-full overflow-x-auto rounded-xl border border-gray-200 bg-white">
                    <table className="min-w-[680px] text-left text-sm">
                      <thead className="bg-gray-50 text-xs font-bold uppercase tracking-[0.14em] text-gray-400">
                        <tr>
                          <th className="px-3 py-3">Função</th>
                          <th className="px-3 py-3">Voluntário</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="px-3 py-3 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {evento.areas.flatMap((area) => {
                          const voluntarios = (area.voluntarios || []).length > 0
                            ? area.voluntarios
                            : [{ id: `${area.id}-vazio`, status: 'PENDENTE', substituto: false, usuario: null }];

                          return voluntarios.map((item) => {
                            const config = statusConfig[item.status] || statusConfig.PENDENTE;
                            const Icon = config.icon;

                            return (
                              <tr key={`${area.id}-${item.id}`} className="align-top">
                                <td className="px-3 py-3 font-bold text-gray-900">{area.equipe?.nome || 'Sem equipe'}</td>
                                <td className="px-3 py-3 text-gray-700">
                                  {item.usuario ? (
                                    <div className="flex items-start gap-2">
                                      <UsuarioInfoButton usuario={item.usuario} onClick={onAbrirUsuario} />
                                      <div className="min-w-0">
                                        <span className="break-words font-semibold">{item.usuario.nomeCompleto}</span>
                                        {item.usuario.telefone && (
                                          <span className="ml-2 whitespace-nowrap text-[11px] font-medium text-gray-400">{item.usuario.telefone}</span>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-gray-400">Nenhum voluntário atribuído</span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  {item.usuario ? (
                                    <div className="flex flex-wrap gap-1.5">
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
                                  ) : (
                                    <span className="text-xs text-gray-400">-</span>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-right">
                                  {area.tipo === 'RECORRENTE' && (
                                    <button
                                      type="button"
                                      onClick={() => onEditarEscala(escalaEditandoId === area.id ? null : area.id)}
                                      className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
                                    >
                                      {escalaEditandoId === area.id ? 'Fechar' : 'Editar'}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          });
                        })}
                      </tbody>
                    </table>
                  </div>

                  {evento.areas.map((area) => {
                    const form = formRecorrentes[area.id] || {};

                    return escalaEditandoId === area.id && area.tipo === 'RECORRENTE' ? (
                      <div key={`${area.id}-edicao`} className="mt-4 grid min-w-0 gap-3 rounded-lg border border-gray-200 bg-white p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_auto] lg:items-end">
                        <Campo label="Título" value={form.titulo || ''} onChange={(value) => onAlterarRecorrente(area.id, 'titulo', value)} />
                        <Select label="Dia" value={form.diaSemana ?? 0} options={dias} onChange={(value) => onAlterarRecorrente(area.id, 'diaSemana', Number(value))} />
                        <Select label="Fim de semana" value={form.semanaMes || 1} options={semanas.map((semana) => ({ value: semana, label: `${semana}º` }))} onChange={(value) => onAlterarRecorrente(area.id, 'semanaMes', Number(value))} />
                        <Campo label="Horário" type="time" value={form.horario || '18:00'} onChange={(value) => onAlterarRecorrente(area.id, 'horario', value)} />
                        <button type="button" disabled={salvandoId === area.id} onClick={() => onSalvarRecorrente(area.id)} className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-950 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                          {salvandoId === area.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
                          Salvar
                        </button>
                      </div>
                    ) : null;
                  })}
                </div>
                    </React.Fragment>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>

    </section>
  );
}

function PainelManuais({
  manuais,
  formManual,
  mostrarFormManual,
  manualEditandoId,
  salvandoId,
  onMostrarFormManual,
  onChangeManual,
  onSalvarManual,
  onEditarManual,
  onCancelarManual,
  onAlternarOcultarManual,
  onExcluirManual,
  onAbrirArquivoManual,
}) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('TODOS');
  const manuaisFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return manuais.filter((manual) => {
      const correspondeFiltro = filtro === 'TODOS'
        || (filtro === 'VISIVEIS' && !manual.oculto)
        || (filtro === 'OCULTOS' && manual.oculto);
      const texto = [
        manual.titulo,
        manual.descricao,
        manual.versao,
        manual.dataManual ? formatarData(manual.dataManual) : '',
      ].filter(Boolean).join(' ').toLowerCase();

      return correspondeFiltro && (!termo || texto.includes(termo));
    });
  }, [busca, filtro, manuais]);

  return (
    <section className="mt-5 space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-dourado-700">Biblioteca MCom</p>
            <h2 className="mt-1 text-2xl font-bold text-gray-950">Gerenciar Manuais</h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Cadastre arquivos únicos em PDF, edite metadados e controle se o manual aparece para os usuários.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onChangeManual(formManualInicial);
              onMostrarFormManual((atual) => !atual);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
          >
            <Plus size={16} />
            {mostrarFormManual ? 'Fechar cadastro' : 'Novo manual'}
          </button>
        </div>
      </div>

      {mostrarFormManual && (
        <form onSubmit={onSalvarManual} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-1 border-b border-gray-100 pb-4">
            <h3 className="text-lg font-bold text-gray-950">{manualEditandoId ? 'Editar manual' : 'Cadastrar manual'}</h3>
            <p className="text-sm text-gray-500">
              A data é preenchida automaticamente pelo sistema. Ao substituir o PDF, o arquivo anterior é removido do storage.
            </p>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Campo label="Título" value={formManual.titulo} onChange={(value) => onChangeManual((atual) => ({ ...atual, titulo: value }))} />
            <Campo label="Versão" value={formManual.versao} onChange={(value) => onChangeManual((atual) => ({ ...atual, versao: value }))} placeholder="Ex: 1.0" />
            <div className="lg:col-span-2">
              <CampoTexto label="Descrição" value={formManual.descricao} onChange={(value) => onChangeManual((atual) => ({ ...atual, descricao: value }))} />
            </div>
            <label className="block lg:col-span-2">
              <span className="text-sm font-semibold text-gray-700">Arquivo PDF</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => onChangeManual((atual) => ({ ...atual, arquivo: event.target.files?.[0] || null }))}
                className="mt-2 block w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition file:mr-3 file:rounded-md file:border-0 file:bg-gray-950 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
              />
              <p className="mt-1 text-xs text-gray-500">
                {manualEditandoId ? 'Envie um novo PDF somente se quiser substituir o arquivo atual.' : 'Obrigatório para cadastrar. Tamanho máximo: 15MB.'}
              </p>
            </label>
            <label className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">
              <input
                type="checkbox"
                checked={Boolean(formManual.oculto)}
                onChange={(event) => onChangeManual((atual) => ({ ...atual, oculto: event.target.checked }))}
              />
              Cadastrar como oculto
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
            <button
              disabled={salvandoId === 'novo-manual' || salvandoId === manualEditandoId}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
            >
              {(salvandoId === 'novo-manual' || salvandoId === manualEditandoId) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
              {manualEditandoId ? 'Salvar manual' : 'Cadastrar manual'}
            </button>
            <button
              type="button"
              onClick={onCancelarManual}
              className="rounded-md border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-950">Manuais cadastrados</h3>
              <p className="mt-1 text-sm text-gray-500">{manuaisFiltrados.length} manual(is) encontrado(s).</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] lg:min-w-[560px]">
              <label className="relative block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  className="block w-full rounded-md border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                  placeholder="Pesquisar por título, descrição, versão ou data"
                />
              </label>
              <select
                value={filtro}
                onChange={(event) => setFiltro(event.target.value)}
                className="rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
              >
                <option value="TODOS">Todos</option>
                <option value="VISIVEIS">Visíveis</option>
                <option value="OCULTOS">Ocultos</option>
              </select>
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {manuaisFiltrados.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-500">
              Nenhum manual encontrado.
            </div>
          ) : manuaisFiltrados.map((manual) => (
            <div key={manual.id} className="px-5 py-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600">
                    <FileText size={22} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="break-words text-base font-bold text-gray-950">{manual.titulo}</h4>
                      <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-600">
                        v{manual.versao || '1.0'}
                      </span>
                      <span className={`rounded border px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] ${
                        manual.oculto
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      }`}
                      >
                        {manual.oculto ? 'Oculto' : 'Visível'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-gray-400">
                      Data: {manual.dataManual ? formatarData(manual.dataManual) : 'Automática'}
                    </p>
                    {manual.descricao && (
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">{manual.descricao}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onAbrirArquivoManual(manual)}
                    className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                  >
                    <Download size={15} />
                    Abrir PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditarManual(manual)}
                    className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={salvandoId === `manual-oculto-${manual.id}`}
                    onClick={() => onAlternarOcultarManual(manual)}
                    className="inline-flex items-center gap-2 rounded-md border border-amber-100 bg-white px-3 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-60"
                  >
                    {manual.oculto ? <Eye size={15} /> : <EyeOff size={15} />}
                    {manual.oculto ? 'Exibir' : 'Ocultar'}
                  </button>
                  <button
                    type="button"
                    disabled={salvandoId === `manual-delete-${manual.id}`}
                    onClick={() => onExcluirManual(manual.id)}
                    className="inline-flex items-center gap-2 rounded-md border border-red-100 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    {salvandoId === `manual-delete-${manual.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 size={15} />}
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          ))}
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

function Campo({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-2 block w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10" />
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

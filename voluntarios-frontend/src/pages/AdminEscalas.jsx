import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bell,
  BookOpen,
  CalendarDays,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  List,
  Megaphone,
  ArrowDownUp,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserCog,
  UsersRound,
  X,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import { Footer } from '../components/Footer';
import { UsuarioInfoButton, UsuarioModal } from '../components/UsuarioModal';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { buildApiUrl } from '../lib/api';
import { escalaEstaEncerrada, getAgoraEscalas } from '../lib/escalas';
import { PhoneInput } from '../components/PhoneInput';
import { formatarTelefoneExibicao } from '../lib/telefone';
import { useModalDialog } from '../lib/useModalDialog';

const dias = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
];
const semanas = [1, 2, 3, 4, 5];
const permissoesDisponiveis = ['VOLUNTARIO', 'ADMINISTRADOR'];

const statusConfig = {
  PENDENTE: { label: 'Pendente', className: 'border-amber-200 bg-amber-50 text-amber-700', icon: Clock3 },
  CONFIRMADA: { label: 'Confirmada', className: 'border-emerald-200 bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  PEDIU_SUBSTITUICAO: { label: 'Substituição', className: 'border-sky-200 bg-sky-50 text-sky-700', icon: RefreshCcw },
  AUSENTE: { label: 'Ausente', className: 'border-red-200 bg-red-50 text-red-700', icon: AlertCircle },
};

const formEscalaInicial = {
  tipo: 'ESPORADICA',
  frequencia: 'NAO_REPETE',
  titulo: '',
  data: '',
  dataFim: '',
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
const filtrosRecorrentes = dias.flatMap(({ value: diaSemana, label: diaLabel }) => (
  semanas.map((semanaMes) => ({
    value: `${diaSemana}-${semanaMes}`,
    diaSemana,
    semanaMes,
    label: `${semanaMes}ª ${diaLabel}`,
  }))
));

function formatarData(dataHora) {
  if (!dataHora) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(dataHora));
}

function toTime(dataHora) {
  if (!dataHora) return '18:00';
  return new Date(dataHora).toISOString().slice(11, 16);
}

function toDateTimeInput(dataHora) {
  if (!dataHora) return '';
  const data = new Date(dataHora);
  return Number.isNaN(data.getTime()) ? '' : data.toISOString().slice(0, 16);
}

function getAreasEvento(evento) {
  return evento?.areas || evento?.escalas || [];
}

function getOcorrenciasUnicas(evento) {
  const ocorrencias = new Map();

  getAreasEvento(evento).forEach((area) => {
    if (area.dataHora && !ocorrencias.has(area.dataHora)) {
      ocorrencias.set(area.dataHora, area);
    }
  });

  return Array.from(ocorrencias.values())
    .sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime());
}

function getAreaPorDataHora(evento, dataHora) {
  return getAreasEvento(evento).find((area) => area.dataHora === dataHora) || null;
}

function criarFormEdicaoEscala(evento, area) {
  const dataHora = area?.dataHora || evento?.dataHora || '';

  return {
    eventoId: area?.eventoId || evento?.id || '',
    tipo: evento?.tipo || area?.tipo || 'ESPORADICA',
    frequencia: evento?.frequencia || 'NAO_REPETE',
    dataHoraAtual: dataHora,
    dataHora: toDateTimeInput(dataHora),
    titulo: evento?.titulo || area?.titulo || '',
    local: evento?.local || area?.local || '',
    descricao: evento?.descricao || area?.descricao || '',
    ordemCulto: area?.ordemCulto || null,
    ordemArquivo: null,
  };
}

function criarFormExclusaoEscala(evento, area) {
  const dataHora = area?.dataHora || evento?.dataHora || '';

  return {
    eventoId: area?.eventoId || evento?.id || '',
    tipo: evento?.tipo || area?.tipo || 'ESPORADICA',
    frequencia: evento?.frequencia || 'NAO_REPETE',
    dataHoraAtual: dataHora,
    titulo: evento?.titulo || area?.titulo || '',
  };
}

function getUtcDateParts(dataHora) {
  const data = new Date(dataHora);
  if (Number.isNaN(data.getTime())) return null;

  return {
    ano: data.getUTCFullYear(),
    mes: data.getUTCMonth(),
    dia: data.getUTCDate(),
    diaSemana: data.getUTCDay(),
    horas: data.getUTCHours(),
    minutos: data.getUTCMinutes(),
  };
}

function criarDataHoraInput(data, horario) {
  return `${data}T${horario}`;
}

function criarOcorrenciasDosEventos(eventos) {
  return eventos.flatMap((evento) => {
    const ocorrencias = new Map();

    for (const escala of evento.escalas || []) {
      const chave = escala.dataHora ? new Date(escala.dataHora).toISOString() : `sem-data-${escala.id}`;
      const ocorrencia = ocorrencias.get(chave) || {
        id: `${evento.id}:${chave}`,
        eventoId: evento.id,
        titulo: evento.titulo,
        tipo: evento.tipo,
        frequencia: evento.frequencia,
        dataHora: escala.dataHora,
        local: evento.local,
        descricao: evento.descricao,
        areas: [],
      };
      ocorrencia.areas.push(escala);
      ocorrencias.set(chave, ocorrencia);
    }

    return Array.from(ocorrencias.values());
  });
}

function parseDataHoraInput(dataHora) {
  const match = String(dataHora || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, ano, mes, dia, horas, minutos] = match.map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia, horas, minutos, 0, 0));

  if (
    data.getUTCFullYear() !== ano
    || data.getUTCMonth() !== mes - 1
    || data.getUTCDate() !== dia
    || data.getUTCHours() !== horas
    || data.getUTCMinutes() !== minutos
  ) {
    return null;
  }

  return data;
}

function hojeParaInput() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function agoraComoDataHoraInput() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  const horas = String(agora.getHours()).padStart(2, '0');
  const minutos = String(agora.getMinutes()).padStart(2, '0');

  return `${ano}-${mes}-${dia}T${horas}:${minutos}`;
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

function gerarSenhaTemporaria(nomeCompleto) {
  const primeiroNome = String(nomeCompleto || '').trim().split(/\s+/)[0] || '';
  return primeiroNome ? `${primeiroNome.toLowerCase()}123` : '';
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const timeout = window.setTimeout(() => {
      reader.abort();
      reject(new Error('A leitura do PDF demorou demais. Tente um arquivo menor.'));
    }, 20000);

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('Não foi possível ler o arquivo.'));
    };
    reader.onloadend = () => window.clearTimeout(timeout);
    reader.readAsDataURL(file);
  });
}

async function fetchComTimeout(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('O envio demorou demais. Verifique sua conexão ou tente um PDF menor.');
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function prepararArquivoPdf(file, tamanhoMaximoMb = 15) {
  if (!file) return null;

  if (file.type !== 'application/pdf') {
    throw new Error('Selecione um arquivo PDF.');
  }

  if (file.size > tamanhoMaximoMb * 1024 * 1024) {
    throw new Error(`O PDF deve ter no máximo ${tamanhoMaximoMb}MB.`);
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
  const [eventosCadastrados, setEventosCadastrados] = useState([]);
  const [formsUsuarios, setFormsUsuarios] = useState({});
  const [formRecorrentes, setFormRecorrentes] = useState({});
  const [formEscala, setFormEscala] = useState(formEscalaInicial);
  const [formAviso, setFormAviso] = useState(formAvisoInicial);
  const [avisosAdmin, setAvisosAdmin] = useState([]);
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
    if (pathname === '/admin/ausencias') return 'ausencias';
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
  const [escalaEmEdicao, setEscalaEmEdicao] = useState(null);
  const [formEdicaoEscala, setFormEdicaoEscala] = useState(null);
  const [escalaEmExclusao, setEscalaEmExclusao] = useState(null);
  const [formExclusaoEscala, setFormExclusaoEscala] = useState(null);
  const [mostrarFormEscala, setMostrarFormEscala] = useState(false);
  const [mostrarFormManual, setMostrarFormManual] = useState(false);
  const [manualEditandoId, setManualEditandoId] = useState(null);
  const [mostrarCadastroVoluntario, setMostrarCadastroVoluntario] = useState(false);
  const [usuarioModal, setUsuarioModal] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState(null);
  const isAdmin = usuario?.permissoes?.includes('ADMINISTRADOR');

  const jaCarregouRef = useRef(false);

  const carregarDados = useCallback(async () => {
    setErro('');
    // Só mostramos o spinner de tela cheia no primeiro carregamento; as
    // atualizações após cada mutação acontecem em segundo plano, sem "piscar"
    // o painel inteiro (os dados atuais permanecem visíveis até chegarem os novos).
    if (!jaCarregouRef.current) {
      setCarregando(true);
    }

    try {
      const [respostaDashboard, respostaEscalas, respostaManuais, respostaAvisos] = await Promise.all([
        fetch(buildApiUrl('/api/admin/dashboard'), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(buildApiUrl('/api/escalas/admin'), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(buildApiUrl('/api/manuais/admin'), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(buildApiUrl('/api/avisos/admin/opcoes'), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const dadosDashboard = await respostaDashboard.json().catch(() => ({}));
      const dadosEscalas = await respostaEscalas.json().catch(() => ({}));
      const dadosManuais = await respostaManuais.json().catch(() => ({}));
      const dadosAvisos = await respostaAvisos.json().catch(() => ({}));

      if (!respostaDashboard.ok || !respostaEscalas.ok || !respostaManuais.ok || !respostaAvisos.ok) {
        if (respostaDashboard.status === 401 || respostaEscalas.status === 401 || respostaManuais.status === 401 || respostaAvisos.status === 401) {
          logout();
          navigate('/login', { replace: true });
          return;
        }

        throw new Error(dadosDashboard.erro || dadosEscalas.erro || dadosManuais.erro || dadosAvisos.erro || 'Não foi possível carregar o painel administrativo.');
      }

      setDashboard(dadosDashboard);
      setEquipes(dadosDashboard.equipes || []);
      setUsuarios(dadosDashboard.usuarios || []);
      setEventosCadastrados(dadosEscalas.eventos || []);
      setManuais(dadosManuais.manuais || []);
      setAvisosAdmin(dadosAvisos.avisos || []);
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
      jaCarregouRef.current = true;
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
    const filtrados = eventosCadastrados.filter((evento) => (
      (tipoEscalas === 'TODAS' || evento.tipo === tipoEscalas)
      && (tipoEscalas !== 'RECORRENTE' || filtroRecorrenciaAdmin === 'TODAS' || (() => {
        const filtro = filtrosRecorrentes.find((item) => item.value === filtroRecorrenciaAdmin);
        return !filtro || (evento.diaSemana === filtro.diaSemana && evento.semanaMes === filtro.semanaMes);
      })())
      && (!termo || [
        evento.titulo,
        evento.local,
        evento.descricao,
        evento.frequencia,
        evento.equipes?.map((equipe) => equipe.nome).join(' '),
        evento.escalas?.map((escala) => [
          escala.dataHora ? formatarData(escala.dataHora) : '',
          escala.voluntarios?.map((item) => item.usuario?.nomeCompleto).join(' '),
        ].join(' ')).join(' '),
      ].filter(Boolean).join(' ').toLowerCase().includes(termo))
    ));

    const agora = Date.now();
    return filtrados.map((evento) => {
      const escalasEvento = evento.escalas || [];
      const proximaEscala = escalasEvento.find((escala) => new Date(escala.dataHora).getTime() >= agora);

      return {
        ...evento,
        dataHora: proximaEscala?.dataHora || escalasEvento.at(-1)?.dataHora || evento.dataInicio,
        proximaDataHora: proximaEscala?.dataHora || null,
        totalEscalasFuturas: escalasEvento.filter((escala) => new Date(escala.dataHora).getTime() >= agora).length,
        areas: escalasEvento,
      };
    }).sort((a, b) => (
      ordemEscalas === 'distantes'
        ? new Date(b.proximaDataHora || b.dataHora).getTime() - new Date(a.proximaDataHora || a.dataHora).getTime()
        : new Date(a.proximaDataHora || a.dataHora).getTime() - new Date(b.proximaDataHora || b.dataHora).getTime()
    ));
  }, [buscaEscalas, eventosCadastrados, filtroRecorrenciaAdmin, ordemEscalas, tipoEscalas]);

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
      setUsuarioModal(null);
      setEditandoUsuarioId(null);
      return true;
    } catch (error) {
      setErro(error.message || 'Não foi possível excluir o usuário.');
      return false;
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
      return true;
    } catch (error) {
      setErro(error.message || 'Não foi possível excluir a equipe.');
      return false;
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
    setter((atual) => {
      const removendo = atual.equipeIds.includes(equipeId);

      return {
        ...atual,
        equipeIds: removendo
          ? atual.equipeIds.filter((id) => id !== equipeId)
          : [...atual.equipeIds, equipeId],
      };
    });
  };

  const alternarTodasEquipesEscala = () => {
    setFormEscala((atual) => {
      const equipeIds = equipes.map((equipe) => equipe.id);
      const todasSelecionadas = equipeIds.length > 0 && equipeIds.every((id) => atual.equipeIds.includes(id));

      return {
        ...atual,
        equipeIds: todasSelecionadas ? [] : equipeIds,
      };
    });
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
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível enviar a notificação.');
    } finally {
      setSalvandoId(null);
    }
  };

  const alternarOcultoAviso = async (aviso) => {
    setErro('');
    setSucesso('');
    setSalvandoId(`aviso-oculto-${aviso.id}`);

    try {
      const resposta = await fetch(buildApiUrl(`/api/avisos/admin/${aviso.id}/ocultar`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ oculto: !aviso.oculto }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível atualizar o aviso.');
      setSucesso(dados.mensagem || 'Aviso atualizado.');
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível atualizar o aviso.');
    } finally {
      setSalvandoId(null);
    }
  };

  const excluirAviso = async (avisoId) => {
    if (!window.confirm('Deseja excluir este aviso definitivamente?')) return;

    setErro('');
    setSucesso('');
    setSalvandoId(`aviso-excluir-${avisoId}`);

    try {
      const resposta = await fetch(buildApiUrl(`/api/avisos/admin/${avisoId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível excluir o aviso.');
      setSucesso(dados.mensagem || 'Aviso excluído.');
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível excluir o aviso.');
    } finally {
      setSalvandoId(null);
    }
  };

  const criarEsporadica = async (event) => {
    event.preventDefault();
    setErro('');
    setSucesso('');
    setSalvandoId('nova-escala');

    try {
      const recorrente = formEscala.tipo === 'RECORRENTE';
      const endpoint = '/api/escalas/admin/eventos';
      let body = formEscala;

      if (!recorrente && formEscala.frequencia === 'NAO_REPETE') {
        const dataHoras = (formEscala.horarios || [])
          .filter((horario) => horario)
          .map((horario) => criarDataHoraInput(formEscala.data, horario));
        const datas = dataHoras.map(parseDataHoraInput);

        if (!formEscala.data || datas.length === 0 || datas.some((data) => !data)) {
          throw new Error('Informe uma data e pelo menos um horário válido.');
        }

        if (dataHoras.some((dataHora) => dataHora <= agoraComoDataHoraInput())) {
          throw new Error('As escalas esporádicas devem ter data e horário futuros.');
        }

        body = {
          ...formEscala,
          dataHoras,
        };
      } else if (!recorrente) {
        if (!formEscala.data || !formEscala.dataFim) {
          throw new Error('Informe as datas inicial e final do evento esporádico repetido.');
        }
        body = {
          ...formEscala,
          dataHora: criarDataHoraInput(formEscala.data, formEscala.horario),
        };
      }

      const resposta = await fetch(buildApiUrl(endpoint), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível criar o evento.');
      setSucesso(dados.mensagem || 'Evento criado.');
      setFormEscala(formEscalaInicial);
      setMostrarFormEscala(false);
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível criar o evento.');
    } finally {
      setSalvandoId(null);
    }
  };

  const enviarOrdemCulto = async (escala, file) => {
    const arquivo = await prepararArquivoPdf(file, 10);
    const resposta = await fetchComTimeout(buildApiUrl('/api/ordens-culto/admin'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventoId: escala.eventoId, dataHora: escala.dataHora, arquivo }),
    }, 90000);
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível enviar a ordem de culto.');
    return dados;
  };

  const submeterOrdemCulto = async (escala, file) => {
    if (!file) return;
    setErro('');
    setSucesso('');
    setSalvandoId(`ordem-${escala.eventoId}-${escala.dataHora}`);

    try {
      const dados = await enviarOrdemCulto(escala, file);
      setSucesso(dados.mensagem || 'Ordem de culto enviada.');
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível enviar a ordem de culto.');
    } finally {
      setSalvandoId(null);
    }
  };

  const abrirEdicaoEscala = (evento, area) => {
    const ocorrencias = getOcorrenciasUnicas(evento);
    const areaBase = area
      || ocorrencias.find((item) => !(item.encerrada || escalaEstaEncerrada(item.dataHora)))
      || ocorrencias[0]
      || null;

    if (!areaBase) {
      setErro('Não foi possível localizar a escala para edição.');
      return;
    }

    setErro('');
    setEscalaEmEdicao(evento);
    setFormEdicaoEscala(criarFormEdicaoEscala(evento, areaBase));
  };

  const selecionarOcorrenciaEdicao = (dataHora) => {
    const area = getAreaPorDataHora(escalaEmEdicao, dataHora);

    setFormEdicaoEscala((atual) => ({
      ...atual,
      dataHoraAtual: dataHora,
      dataHora: toDateTimeInput(dataHora),
      ordemCulto: area?.ordemCulto || null,
      ordemArquivo: null,
    }));
  };

  const fecharEdicaoEscala = () => {
    setEscalaEmEdicao(null);
    setFormEdicaoEscala(null);
  };

  const abrirExclusaoEscala = (evento, area) => {
    const ocorrencias = getOcorrenciasUnicas(evento);
    const areaBase = area
      || ocorrencias.find((item) => !(item.encerrada || escalaEstaEncerrada(item.dataHora)))
      || null;

    if (!areaBase) {
      setErro('Não foi possível localizar uma escala futura para excluir.');
      return;
    }

    setErro('');
    setEscalaEmExclusao(evento);
    setFormExclusaoEscala(criarFormExclusaoEscala(evento, areaBase));
  };

  const selecionarOcorrenciaExclusao = (dataHora) => {
    setFormExclusaoEscala((atual) => ({
      ...atual,
      dataHoraAtual: dataHora,
    }));
  };

  const fecharExclusaoEscala = () => {
    setEscalaEmExclusao(null);
    setFormExclusaoEscala(null);
  };

  const salvarEdicaoEscala = async (event) => {
    event.preventDefault();
    if (!formEdicaoEscala) return;

    setErro('');
    setSucesso('');
    setSalvandoId(`editar-escala-${formEdicaoEscala.eventoId}`);

    try {
      const resposta = await fetchComTimeout(buildApiUrl(`/api/escalas/admin/eventos/${formEdicaoEscala.eventoId}/ocorrencias`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: formEdicaoEscala.titulo,
          local: formEdicaoEscala.local,
          descricao: formEdicaoEscala.descricao,
          dataHoraAtual: formEdicaoEscala.dataHoraAtual,
          dataHora: formEdicaoEscala.dataHora,
        }),
      }, 90000);
      const dados = await resposta.json().catch(() => ({}));

      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível salvar a escala.');

      if (formEdicaoEscala.ordemArquivo) {
        try {
          await enviarOrdemCulto({
            eventoId: formEdicaoEscala.eventoId,
            dataHora: dados.dataHora || formEdicaoEscala.dataHora,
          }, formEdicaoEscala.ordemArquivo);
        } catch (error) {
          await carregarDados();
          throw new Error(`Escala atualizada, mas a ordem de culto não foi anexada: ${error.message}`);
        }
      }

      setSucesso(formEdicaoEscala.ordemArquivo
        ? 'Escala atualizada e ordem de culto anexada.'
        : dados.mensagem || 'Escala atualizada.');
      fecharEdicaoEscala();
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível salvar a escala.');
    } finally {
      setSalvandoId(null);
    }
  };

  const excluirEscalaAdmin = async () => {
    if (!formExclusaoEscala) return;

    setErro('');
    setSucesso('');
    setSalvandoId(`excluir-escala-${formExclusaoEscala.eventoId}`);

    try {
      const resposta = await fetchComTimeout(buildApiUrl(`/api/escalas/admin/eventos/${formExclusaoEscala.eventoId}/ocorrencias?dataHora=${encodeURIComponent(formExclusaoEscala.dataHoraAtual)}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }, 60000);
      const dados = await resposta.json().catch(() => ({}));

      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível excluir a escala.');

      setSucesso(dados.mensagem || 'Escala excluída.');
      fecharExclusaoEscala();
      await carregarDados();
    } catch (error) {
      setErro(error.message || 'Não foi possível excluir a escala.');
    } finally {
      setSalvandoId(null);
    }
  };

  const abrirOrdemCulto = async (ordemCulto) => {
    setErro('');
    const janela = window.open('about:blank', '_blank');

    try {
      const resposta = await fetch(buildApiUrl(ordemCulto.arquivoUrl || `/api/ordens-culto/${ordemCulto.id}/arquivo`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => ({}));
        throw new Error(dados.erro || 'Não foi possível abrir a ordem de culto.');
      }
      const url = URL.createObjectURL(await resposta.blob());
      if (janela) {
        janela.opener = null;
        janela.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      janela?.close();
      setErro(error.message || 'Não foi possível abrir a ordem de culto.');
    }
  };

  const salvarManual = async (event) => {
    event.preventDefault();
    setErro('');
    setSucesso('');

    try {
      if (formManual.titulo.trim().length < 3) {
        throw new Error('Informe o título do manual.');
      }

      if (!manualEditandoId && !formManual.arquivo) {
        throw new Error('Selecione um arquivo PDF para cadastrar o manual.');
      }

      setSalvandoId(manualEditandoId || 'novo-manual');
      const arquivo = await prepararArquivoPdf(formManual.arquivo);
      const resposta = await fetchComTimeout(buildApiUrl(manualEditandoId ? `/api/manuais/admin/${manualEditandoId}` : '/api/manuais/admin'), {
        method: manualEditandoId ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: formManual.titulo,
          descricao: formManual.descricao,
          versao: formManual.versao,
          oculto: formManual.oculto,
          arquivo,
        }),
      }, 90000);
      const dados = await resposta.json().catch(() => ({}));

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
    if (!window.confirm('Deseja excluir este manual definitivamente?')) return;

    setErro('');
    setSucesso('');
    setSalvandoId(`manual-delete-${manualId}`);

    try {
      const resposta = await fetch(buildApiUrl(`/api/manuais/admin/${manualId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await resposta.json().catch(() => ({}));

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
              <Metrica
                titulo="Total de voluntários"
                valor={dashboard?.metricas?.totalVoluntarios || 0}
                icon={UsersRound}
                ativo={painelAberto === 'voluntarios'}
                onClick={() => abrirPainel('voluntarios', '/admin/voluntarios')}
              />
              <Metrica
                titulo="Total de equipes"
                valor={dashboard?.metricas?.totalEquipes || 0}
                icon={ShieldCheck}
                ativo={painelAberto === 'equipes'}
                onClick={() => abrirPainel('equipes', '/admin/equipes')}
              />
              <Metrica
                titulo="Ausências nas últimas 4 escalas"
                valor={dashboard?.metricas?.ausenciasUltimas4 || 0}
                icon={AlertCircle}
                destaque
                ativo={painelAberto === 'ausencias'}
                onClick={() => abrirPainel('ausencias', '/admin/ausencias')}
              />
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
                onExcluir={painelAberto === 'voluntarios' ? excluirUsuario : undefined}
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

            {painelAberto === 'ausencias' && (
              <PainelAusencias
                ausencias={dashboard?.ausenciasUltimas4Detalhes || []}
                onAbrirUsuario={setUsuarioModal}
              />
            )}

            {painelAberto === 'notificacao' && (
              <PainelNotificacao
                equipes={equipes}
                usuarios={usuarios}
                avisos={avisosAdmin}
                formAviso={formAviso}
                salvandoId={salvandoId}
                onSubmit={criarAviso}
                onChange={setFormAviso}
                onAlternarEquipe={(equipeId) => alternarEquipe('aviso', equipeId)}
                onAlternarUsuario={alternarUsuarioAviso}
                onAbrirUsuario={setUsuarioModal}
                onAlternarOcultoAviso={alternarOcultoAviso}
                onExcluirAviso={excluirAviso}
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
                escalaEmEdicao={escalaEmEdicao}
                escalaEmExclusao={escalaEmExclusao}
                formRecorrentes={formRecorrentes}
                formEscala={formEscala}
                formEdicaoEscala={formEdicaoEscala}
                formExclusaoEscala={formExclusaoEscala}
                salvandoId={salvandoId}
                onAlterarRecorrente={alterarRecorrente}
                onSalvarRecorrente={salvarRecorrente}
                onTipoEscalas={setTipoEscalas}
                onFiltroRecorrencia={setFiltroRecorrenciaAdmin}
                onBuscaEscalas={setBuscaEscalas}
                onOrdemEscalas={setOrdemEscalas}
                onEditarEscala={setEscalaEditandoId}
                onAbrirEdicaoEscala={abrirEdicaoEscala}
                onFecharEdicaoEscala={fecharEdicaoEscala}
                onChangeEdicaoEscala={setFormEdicaoEscala}
                onSelecionarOcorrenciaEdicao={selecionarOcorrenciaEdicao}
                onSalvarEdicaoEscala={salvarEdicaoEscala}
                onAbrirExclusaoEscala={abrirExclusaoEscala}
                onFecharExclusaoEscala={fecharExclusaoEscala}
                onSelecionarOcorrenciaExclusao={selecionarOcorrenciaExclusao}
                onConfirmarExclusaoEscala={excluirEscalaAdmin}
                onChangeEscala={setFormEscala}
                onAlternarEquipe={(equipeId) => alternarEquipe('esporadica', equipeId)}
                onAlternarTodasEquipes={alternarTodasEquipesEscala}
                onCriarEsporadica={criarEsporadica}
                onAbrirUsuario={setUsuarioModal}
                onSubmeterOrdemCulto={submeterOrdemCulto}
                onAbrirOrdemCulto={abrirOrdemCulto}
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
      <UsuarioModal
        usuario={usuarioModal}
        onClose={() => setUsuarioModal(null)}
        podeExcluir={Boolean(usuarioModal && usuarioModal.id !== usuario?.id)}
        onExcluir={excluirUsuario}
        excluindo={Boolean(usuarioModal && salvandoId === usuarioModal.id)}
      />
      <Footer />
    </div>
  );
}

function Metrica({ titulo, valor, icon: Icon, destaque = false, ativo = false, onClick }) {
  const Conteudo = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">{titulo}</p>
        <Icon className={`h-5 w-5 ${destaque ? 'text-red-600' : 'text-dourado-600'}`} />
      </div>
      <p className="mt-4 text-4xl font-bold text-gray-950">{valor}</p>
    </>
  );
  const className = `rounded-2xl border p-5 text-left shadow-sm transition ${
    destaque ? 'border-red-100 bg-red-50' : 'border-gray-200 bg-white'
  } ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-gray-950/15' : ''} ${
    ativo ? 'ring-2 ring-gray-950/15' : ''
  }`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} aria-pressed={ativo}>
        {Conteudo}
      </button>
    );
  }

  return (
    <div className={className}>
      {Conteudo}
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
                          <span className="text-[11px] font-medium text-gray-400">{formatarTelefoneExibicao(item.usuario.telefone)}</span>
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
  const [usuarioConfirmandoExclusao, setUsuarioConfirmandoExclusao] = useState(null);
  const isLideres = titulo.toLowerCase().includes('líder');
  const excluindoUsuario = Boolean(usuarioConfirmandoExclusao && salvandoId === usuarioConfirmandoExclusao.id);
  const senhaTemporariaNovoVoluntario = gerarSenhaTemporaria(formNovoVoluntario.nomeCompleto);
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

  const confirmarExclusao = async () => {
    if (!usuarioConfirmandoExclusao || !onExcluir) return;

    const excluiu = await onExcluir(usuarioConfirmandoExclusao.id);
    if (excluiu) setUsuarioConfirmandoExclusao(null);
  };

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
          <PhoneInput value={formNovoVoluntario.telefone} onChange={(telefone) => onChangeNovoVoluntario((atual) => ({ ...atual, telefone }))} />
          <div className="lg:col-span-2">
            <p className="mb-3 rounded-md border border-dourado-100 bg-dourado-50 px-3 py-2 text-sm font-semibold text-dourado-800">
              Senha inicial: {senhaTemporariaNovoVoluntario || 'digite o nome do voluntário'}
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
                        <span className="text-xs font-medium text-gray-400">{formatarTelefoneExibicao(usuario.telefone)}</span>
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
                </div>
              </div>

              {editando && (
                <div className="mt-4 grid gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 xl:grid-cols-[1fr_1fr_auto]">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo label="Nome" value={form.nomeCompleto} onChange={(value) => onAlterar(usuario.id, 'nomeCompleto', value)} />
                    <PhoneInput value={form.telefone} onChange={(telefone) => onAlterar(usuario.id, 'telefone', telefone)} />
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
                  <div className="flex flex-col justify-end gap-2">
                    <button type="button" disabled={salvandoId === usuario.id} onClick={() => onSalvar(usuario.id)} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gray-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                      {salvandoId === usuario.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={15} />}
                      Salvar edição
                    </button>
                    {onExcluir && (
                      <button
                        type="button"
                        disabled={salvandoId === usuario.id}
                        onClick={() => setUsuarioConfirmandoExclusao(usuario)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                      >
                        <Trash2 size={15} />
                        Excluir voluntário
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {usuarioConfirmandoExclusao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-red-50 p-2 text-red-600">
                <AlertCircle size={22} />
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-red-700">Confirmar exclusão</p>
                <h2 className="mt-2 text-xl font-bold leading-7 text-gray-950">
                  Tem certeza que quer excluir o Voluntário {usuarioConfirmandoExclusao.nomeCompleto || 'selecionado'}?
                </h2>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={excluindoUsuario}
                onClick={() => setUsuarioConfirmandoExclusao(null)}
                className="rounded-md border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
              >
                Não
              </button>
              <button
                type="button"
                disabled={excluindoUsuario}
                onClick={confirmarExclusao}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {excluindoUsuario ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 size={16} />}
                Sim
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PainelEquipes({ equipes, usuarios, equipeSelecionada, formEquipe, salvandoId, onChangeEquipe, onCriarEquipe, onExcluirEquipe, onSelecionarEquipe, onAbrirUsuario, onAtualizarVinculo }) {
  const equipeAtiva = equipeSelecionada || equipes[0] || null;
  const [novoLiderId, setNovoLiderId] = useState('');
  const [novoVoluntarioId, setNovoVoluntarioId] = useState('');
  const [equipeConfirmandoExclusao, setEquipeConfirmandoExclusao] = useState(null);
  const excluindoEquipe = Boolean(equipeConfirmandoExclusao && salvandoId === equipeConfirmandoExclusao.id);
  const lideresDisponiveis = useMemo(() => (
    usuarios.filter((usuario) => !usuario.equipesLideradas?.some((equipe) => equipe.id === equipeAtiva?.id))
  ), [equipeAtiva?.id, usuarios]);
  const voluntariosDisponiveis = useMemo(() => (
    usuarios.filter((usuario) => !usuario.equipes?.some((equipe) => equipe.id === equipeAtiva?.id))
  ), [equipeAtiva?.id, usuarios]);

  useEffect(() => {
    setNovoLiderId('');
    setNovoVoluntarioId('');
    setEquipeConfirmandoExclusao(null);
  }, [equipeAtiva?.id]);

  const adicionarLider = () => {
    if (!novoLiderId || !equipeAtiva) return;
    onAtualizarVinculo({ usuarioId: novoLiderId, equipeId: equipeAtiva.id, tipo: 'lider', adicionar: true });
  };

  const adicionarVoluntario = () => {
    if (!novoVoluntarioId || !equipeAtiva) return;
    onAtualizarVinculo({ usuarioId: novoVoluntarioId, equipeId: equipeAtiva.id, tipo: 'voluntario', adicionar: true });
  };

  const confirmarExclusaoEquipe = async () => {
    if (!equipeConfirmandoExclusao || !onExcluirEquipe) return;

    const excluiu = await onExcluirEquipe(equipeConfirmandoExclusao.id);
    if (excluiu) setEquipeConfirmandoExclusao(null);
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
              <button type="button" disabled={salvandoId === equipeAtiva.id} onClick={() => setEquipeConfirmandoExclusao(equipeAtiva)} className="inline-flex items-center justify-center gap-2 rounded-md border border-red-100 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">
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

      {equipeConfirmandoExclusao && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-red-50 p-2 text-red-600">
                <AlertCircle size={22} />
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-red-700">Confirmar exclusão</p>
                <h2 className="mt-2 text-xl font-bold leading-7 text-gray-950">
                  Tem certeza que quer excluir a equipe {equipeConfirmandoExclusao.nome || 'selecionada'}?
                </h2>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={excluindoEquipe}
                onClick={() => setEquipeConfirmandoExclusao(null)}
                className="rounded-md border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
              >
                Não
              </button>
              <button
                type="button"
                disabled={excluindoEquipe}
                onClick={confirmarExclusaoEquipe}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {excluindoEquipe ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 size={16} />}
                Sim
              </button>
            </div>
          </div>
        </div>
      )}
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
              <span className="text-[11px] font-medium text-gray-400">{formatarTelefoneExibicao(pessoa.telefone)}</span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">{pessoa.email}</p>
        </div>
      </div>
      {acaoExtra}
    </div>
  );
}

function PainelAusencias({ ausencias, onAbrirUsuario }) {
  return (
    <section className="mt-5 rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-950">Ausências nas últimas 4 escalas</h2>
            <p className="mt-1 text-sm text-gray-500">
              Escalas recentes com voluntários marcados como ausentes, justificativa e substituição.
            </p>
          </div>
          <span className="w-fit rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-red-700">
            {ausencias.length} ausência{ausencias.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {ausencias.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-base font-bold text-gray-950">Nenhuma ausência encontrada</p>
            <p className="mt-2 text-sm text-gray-500">As últimas 4 escalas não possuem voluntários marcados como ausentes.</p>
          </div>
        ) : ausencias.map((ausencia) => (
          <article key={ausencia.id} className="px-5 py-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(180px,0.8fr)_minmax(260px,1.2fr)_minmax(220px,1fr)]">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">Escala</p>
                <h3 className="mt-1 text-base font-bold text-gray-950">{ausencia.escala?.titulo || 'Escala sem título'}</h3>
                <p className="mt-1 text-sm font-semibold text-gray-500">{formatarData(ausencia.escala?.dataHora)}</p>
                {ausencia.escala?.local && <p className="mt-1 text-xs text-gray-500">Local: {ausencia.escala.local}</p>}
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">Voluntário e equipe</p>
                <div className="mt-2 flex min-w-0 items-start gap-2">
                  <UsuarioInfoButton usuario={ausencia.voluntario} onClick={onAbrirUsuario} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-950">{ausencia.voluntario?.nomeCompleto || 'Voluntário'}</p>
                    <p className="mt-1 text-xs text-gray-500">{ausencia.equipe?.nome || 'Sem equipe'}</p>
                    {ausencia.voluntario?.telefone && (
                      <p className="mt-1 text-xs text-gray-400">{formatarTelefoneExibicao(ausencia.voluntario.telefone)}</p>
                    )}
                  </div>
                </div>
                <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">Justificativa</p>
                  <p className="mt-1 text-sm leading-6 text-gray-700">
                    {ausencia.justificativa || 'Nenhuma justificativa registrada.'}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">Substituição</p>
                {ausencia.teveSubstituto ? (
                  <div className="mt-2 space-y-2">
                    {(ausencia.substitutos || []).map((substituto) => (
                      <div key={substituto.id} className="flex items-start gap-2 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2">
                        <UsuarioInfoButton usuario={substituto.usuario} onClick={onAbrirUsuario} className="h-8 w-8" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-950">{substituto.usuario?.nomeCompleto || 'Substituto'}</p>
                          <p className="mt-0.5 text-xs font-semibold text-emerald-700">Substituto atribuído</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-500">
                    Não houve substituto registrado.
                  </p>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PainelNotificacao({
  equipes,
  usuarios,
  avisos,
  formAviso,
  salvandoId,
  onSubmit,
  onChange,
  onAlternarEquipe,
  onAlternarUsuario,
  onAbrirUsuario,
  onAlternarOcultoAviso,
  onExcluirAviso,
}) {
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

      <div className="border-t border-gray-100 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-gray-500">Avisos enviados</h3>
            <p className="mt-1 text-sm text-gray-500">Oculte avisos sem apagar o histórico ou exclua definitivamente quando necessário.</p>
          </div>
          <span className="w-fit rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-gray-500">
            {avisos.length} aviso{avisos.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {avisos.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
              Nenhum aviso enviado ainda.
            </div>
          ) : avisos.map((aviso) => (
            <article key={aviso.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-bold text-gray-950">{aviso.titulo}</h4>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${
                      aviso.oculto ? 'bg-gray-200 text-gray-600' : 'bg-gray-950 text-white'
                    }`}>
                      {aviso.oculto ? 'Oculto' : 'Visível'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-gray-500">{formatarData(aviso.dataAviso)}</p>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-600">{aviso.mensagem}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={salvandoId === `aviso-oculto-${aviso.id}`}
                    onClick={() => onAlternarOcultoAviso(aviso)}
                    className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-100 disabled:opacity-60"
                  >
                    {salvandoId === `aviso-oculto-${aviso.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : aviso.oculto ? <Eye size={15} /> : <EyeOff size={15} />}
                    {aviso.oculto ? 'Exibir' : 'Ocultar'}
                  </button>
                  <button
                    type="button"
                    disabled={salvandoId === `aviso-excluir-${aviso.id}`}
                    onClick={() => onExcluirAviso(aviso.id)}
                    className="inline-flex items-center gap-2 rounded-md border border-red-100 bg-white px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    {salvandoId === `aviso-excluir-${aviso.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 size={15} />}
                    Excluir
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
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
  escalaEmEdicao,
  escalaEmExclusao,
  formRecorrentes,
  formEscala,
  formEdicaoEscala,
  formExclusaoEscala,
  salvandoId,
  onAlterarRecorrente,
  onSalvarRecorrente,
  onTipoEscalas,
  onFiltroRecorrencia,
  onBuscaEscalas,
  onOrdemEscalas,
  onEditarEscala,
  onAbrirEdicaoEscala,
  onFecharEdicaoEscala,
  onChangeEdicaoEscala,
  onSelecionarOcorrenciaEdicao,
  onSalvarEdicaoEscala,
  onAbrirExclusaoEscala,
  onFecharExclusaoEscala,
  onSelecionarOcorrenciaExclusao,
  onConfirmarExclusaoEscala,
  onChangeEscala,
  onAlternarEquipe,
  onAlternarTodasEquipes,
  onCriarEsporadica,
  onAbrirUsuario,
  onSubmeterOrdemCulto,
  onAbrirOrdemCulto,
  mostrarFormEscala,
  onMostrarFormEscala,
}) {
  const [visualizacao, setVisualizacao] = useState('lista');
  const [periodo, setPeriodo] = useState('futuras');
  const eventosDoPeriodo = useMemo(() => {
    const agora = getAgoraEscalas().getTime();
    return eventos.map((evento) => {
    const escalas = (evento.escalas || evento.areas || [])
      .filter((escala) => {
        const data = new Date(escala.dataHora).getTime();
        return periodo === 'passadas' ? data < agora : data >= agora;
      })
      .sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime());

    if (escalas.length === 0) return null;
    const dataDestaque = periodo === 'passadas' ? escalas.at(-1)?.dataHora : escalas[0]?.dataHora;
    return {
      ...evento,
      escalas,
      areas: escalas,
      dataHora: dataDestaque,
      proximaDataHora: periodo === 'futuras' ? dataDestaque : null,
      totalEscalasFuturas: periodo === 'futuras' ? escalas.length : 0,
    };
  }).filter(Boolean).sort((a, b) => {
    const diferenca = new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime();
    if (periodo === 'passadas') return ordemEscalas === 'proximas' ? -diferenca : diferenca;
    return ordemEscalas === 'proximas' ? diferenca : -diferenca;
    });
  }, [eventos, periodo, ordemEscalas]);
  const ocorrenciasCalendario = useMemo(() => criarOcorrenciasDosEventos(eventosDoPeriodo), [eventosDoPeriodo]);
  const eventosFuturos = periodo === 'futuras' ? eventosDoPeriodo : [];
  const eventosEsporadicos = useMemo(() => eventosDoPeriodo.filter((evento) => evento.tipo === 'ESPORADICA'), [eventosDoPeriodo]);
  const eventosRecorrentes = useMemo(() => eventosDoPeriodo.filter((evento) => evento.tipo === 'RECORRENTE'), [eventosDoPeriodo]);
  const eventosListagem = [...eventosEsporadicos, ...eventosRecorrentes];
  const tituloListagem = tipoEscalas === 'ESPORADICA'
    ? 'Eventos esporádicos'
    : tipoEscalas === 'RECORRENTE'
      ? 'Eventos recorrentes'
      : 'Eventos esporádicos';
  const todasEquipesSelecionadas = equipes.length > 0 && equipes.every((equipe) => formEscala.equipeIds.includes(equipe.id));

  return (
    <section className="mt-5 grid min-w-0 gap-5">
      <div className="min-w-0 rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-950">Eventos e escalas</h2>
              <p className="mt-1 text-sm text-gray-500">
                Cadastre o evento uma vez e acompanhe dentro dele as escalas de cada data e função.
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
                {mostrarFormEscala ? 'Fechar novo evento' : 'Novo evento'}
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
                    <h2 className="text-lg font-bold text-gray-950">Novo evento</h2>
                    <p className="mt-1 text-sm text-gray-500">Defina a repetição do evento e as equipes que terão escalas em cada ocorrência.</p>
                  </div>
                  <button
                    disabled={salvandoId === 'nova-escala'}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-dourado-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {salvandoId === 'nova-escala' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
                    Salvar evento
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
                        onClick={() => onChangeEscala((atual) => ({
                          ...atual,
                          tipo: opcao.value,
                          frequencia: opcao.value === 'RECORRENTE' ? 'SEMANAL' : 'NAO_REPETE',
                        }))}
                        className={`rounded-md px-3 py-2 text-sm font-bold transition ${
                          formEscala.tipo === opcao.value ? 'bg-gray-950 text-white' : 'text-gray-600 hover:bg-white'
                        }`}
                      >
                        {opcao.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Campo label="Nome do evento" value={formEscala.titulo} onChange={(value) => onChangeEscala((atual) => ({ ...atual, titulo: value }))} />

                <div>
                  <span className="text-sm font-semibold text-gray-700">Repetição</span>
                  <div className={`mt-2 grid gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1 ${formEscala.tipo === 'ESPORADICA' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {[
                      ...(formEscala.tipo === 'ESPORADICA' ? [{ value: 'NAO_REPETE', label: 'Não repete' }] : []),
                      { value: 'SEMANAL', label: 'Semanal' },
                      { value: 'MENSAL', label: 'Mensal' },
                    ].map((opcao) => (
                      <button
                        key={opcao.value}
                        type="button"
                        onClick={() => onChangeEscala((atual) => ({ ...atual, frequencia: opcao.value }))}
                        className={`rounded-md px-2 py-2 text-sm font-bold transition ${formEscala.frequencia === opcao.value ? 'bg-gray-950 text-white' : 'text-gray-600 hover:bg-white'}`}
                      >
                        {opcao.label}
                      </button>
                    ))}
                  </div>
                </div>

                {formEscala.tipo === 'ESPORADICA' && formEscala.frequencia === 'NAO_REPETE' ? (
                  <div>
                    <Campo label="Data" type="date" min={hojeParaInput()} value={formEscala.data} onChange={(value) => onChangeEscala((atual) => ({ ...atual, data: value }))} />
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
                          <div key={index} className="flex gap-2">
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
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {formEscala.tipo === 'ESPORADICA' && (
                      <Campo label="Data inicial" type="date" min={hojeParaInput()} value={formEscala.data} onChange={(value) => onChangeEscala((atual) => ({ ...atual, data: value }))} />
                    )}
                    {formEscala.tipo === 'ESPORADICA' && (
                      <Campo label="Repetir até" type="date" min={formEscala.data || hojeParaInput()} value={formEscala.dataFim} onChange={(value) => onChangeEscala((atual) => ({ ...atual, dataFim: value }))} />
                    )}
                    {formEscala.tipo === 'RECORRENTE' && (
                      <Select label="Dia" value={formEscala.diaSemana} options={dias} onChange={(value) => onChangeEscala((atual) => ({ ...atual, diaSemana: Number(value) }))} />
                    )}
                    {formEscala.tipo === 'RECORRENTE' && formEscala.frequencia === 'MENSAL' && (
                      <Select label="Semana do mês" value={formEscala.semanaMes} options={semanas.map((semana) => ({ value: semana, label: `${semana}ª` }))} onChange={(value) => onChangeEscala((atual) => ({ ...atual, semanaMes: Number(value) }))} />
                    )}
                    <Campo label="Horário" type="time" value={formEscala.horario} onChange={(value) => onChangeEscala((atual) => ({ ...atual, horario: value }))} />
                  </div>
                )}

                <div className="grid gap-3 lg:grid-cols-2">
                  <Campo label="Local" value={formEscala.local} onChange={(value) => onChangeEscala((atual) => ({ ...atual, local: value }))} />
                  <CampoTexto label="Descrição" value={formEscala.descricao} onChange={(value) => onChangeEscala((atual) => ({ ...atual, descricao: value }))} />
                </div>
                <GrupoChecks titulo="Equipes/funções do evento">
                  <label className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-900">
                    <input
                      type="checkbox"
                      checked={todasEquipesSelecionadas}
                      onChange={onAlternarTodasEquipes}
                    />
                    Selecionar todas as equipes
                  </label>
                  {equipes.map((equipe) => (
                    <label key={equipe.id} className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <input type="checkbox" checked={formEscala.equipeIds.includes(equipe.id)} onChange={() => onAlternarEquipe(equipe.id)} />
                      {equipe.nome}
                    </label>
                  ))}
                </GrupoChecks>

                {formEscala.equipeIds.length > 0 && (
                  <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                    A escala vai para as equipes selecionadas. Os voluntários de cada ocorrência são atribuídos pelo líder da equipe solicitada.
                  </p>
                )}
                <button disabled={salvandoId === 'nova-escala'} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                  {salvandoId === 'nova-escala' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={16} />}
                  Criar evento e gerar escalas
                </button>
              </form>
            </div>
          )}

          {tipoEscalas === 'RECORRENTE' && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <Select
                label="Filtrar recorrentes"
                value={filtroRecorrencia}
                options={[
                  { value: 'TODAS', label: 'Todos os dias e semanas' },
                  ...filtrosRecorrentes,
                ]}
                onChange={onFiltroRecorrencia}
              />
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto_auto] lg:items-center">
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={buscaEscalas}
                onChange={(event) => onBuscaEscalas(event.target.value)}
                className="block w-full rounded-md border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                placeholder="Pesquisar por equipe, título ou voluntário"
              />
            </label>
            <div className="inline-flex justify-self-start rounded-lg border border-gray-200 bg-gray-50 p-1" aria-label="Modo de visualização">
              <button
                type="button"
                onClick={() => setVisualizacao('lista')}
                className={`flex h-9 w-9 items-center justify-center rounded-md transition ${visualizacao === 'lista' ? 'bg-gray-950 text-white' : 'text-gray-500 hover:bg-white hover:text-gray-900'}`}
                title="Visualizar como lista"
                aria-label="Visualizar como lista"
                aria-pressed={visualizacao === 'lista'}
              >
                <List size={17} />
              </button>
              <button
                type="button"
                onClick={() => setVisualizacao('calendario')}
                className={`flex h-9 w-9 items-center justify-center rounded-md transition ${visualizacao === 'calendario' ? 'bg-gray-950 text-white' : 'text-gray-500 hover:bg-white hover:text-gray-900'}`}
                title="Visualizar como calendário"
                aria-label="Visualizar como calendário"
                aria-pressed={visualizacao === 'calendario'}
              >
                <CalendarDays size={17} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => onOrdemEscalas(ordemEscalas === 'proximas' ? 'distantes' : 'proximas')}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
              title="Alternar ordenação"
            >
              <ArrowDownUp size={16} />
              {ordemEscalas === 'proximas' ? 'Mais próximas' : 'Mais distantes'}
            </button>
            <button
              type="button"
              onClick={() => setPeriodo((atual) => (atual === 'futuras' ? 'passadas' : 'futuras'))}
              className={`inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-bold transition ${
                periodo === 'passadas'
                  ? 'border-gray-950 bg-gray-950 text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <CalendarClock size={16} />
              {periodo === 'passadas' ? 'Ver escalas futuras' : 'Ver escalas passadas'}
            </button>
            <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-600">
              {eventosDoPeriodo.length} evento(s)
            </span>
          </div>

          {visualizacao === 'calendario' ? (
            <CalendarioEscalas eventos={ocorrenciasCalendario} />
          ) : (
            <>
          {periodo === 'futuras' && <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Próximos eventos</p>
                <p className="mt-1 text-sm text-gray-600">A primeira ocorrência futura de cada evento dentro dos filtros atuais.</p>
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
                  <p className="mt-1 text-xs text-gray-400">{evento.totalEscalasFuturas} escala(s) futura(s)</p>
                </button>
              ))}
            </div>
          </div>}

          <div className="space-y-4">
            {eventosListagem.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
                Nenhuma escala {periodo === 'passadas' ? 'passada' : 'futura'} encontrada para esse filtro.
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
                  const acoesOrdemCulto = evento.areas.filter((area) => {
                    const primeiraEscalaDaOcorrencia = evento.areas.find((item) => item.dataHora === area.dataHora)?.id === area.id;
                    const encerrada = area.encerrada || escalaEstaEncerrada(area.dataHora);
                    return primeiraEscalaDaOcorrencia && area.eventoId && !encerrada;
                  });
                  const areaEditavel = getOcorrenciasUnicas(evento)
                    .find((area) => !(area.encerrada || escalaEstaEncerrada(area.dataHora))) || null;

                  return (
                    <React.Fragment key={evento.id}>
                      {mostrarTituloRecorrente && (
                        <p className="pt-2 text-xs font-bold uppercase tracking-[0.14em] text-gray-500">Eventos recorrentes</p>
                      )}
                <div className="min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-4 shadow-sm sm:p-5">
                  <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 max-w-full">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-dourado-200 bg-dourado-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-dourado-700">
                          {evento.areas.length} escala(s) no período
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
                          <span>{evento.frequencia === 'SEMANAL' ? 'Toda semana' : `${evento.semanaMes}ª semana do mês`}</span>
                        )}
                      </div>
                      {evento.descricao && (
                        <p className="mt-3 max-w-2xl break-words text-sm leading-6 text-gray-600">{evento.descricao}</p>
                      )}
                      {acoesOrdemCulto.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {acoesOrdemCulto.map((area) => (
                            <div key={`ordem-${area.id}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                              <span className="text-xs font-bold text-gray-500">{formatarData(area.dataHora)}</span>
                              {area.ordemCulto && (
                                <button
                                  type="button"
                                  onClick={() => onAbrirOrdemCulto(area.ordemCulto)}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
                                >
                                  <Eye size={14} />
                                  Visualizar ordem de culto
                                </button>
                              )}
                              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-gray-950 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-gray-800">
                                {salvandoId === `ordem-${area.eventoId}-${area.dataHora}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText size={14} />}
                                {area.ordemCulto ? 'Substituir ordem de culto' : 'Enviar ordem de culto'}
                                <input
                                  type="file"
                                  accept="application/pdf"
                                  disabled={salvandoId === `ordem-${area.eventoId}-${area.dataHora}`}
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    event.target.value = '';
                                    onSubmeterOrdemCulto(area, file);
                                  }}
                                  className="sr-only"
                                />
                              </label>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!areaEditavel}
                        onClick={() => onAbrirEdicaoEscala(evento, areaEditavel)}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title={areaEditavel ? 'Editar escala' : 'Escalas passadas não podem ser editadas'}
                      >
                        <Pencil size={15} />
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={!areaEditavel}
                        onClick={() => onAbrirExclusaoEscala(evento, areaEditavel)}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-red-100 bg-white px-3 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title={areaEditavel ? 'Excluir escala' : 'Escalas passadas não podem ser excluídas'}
                      >
                        <Trash2 size={15} />
                        Excluir
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 max-h-[560px] max-w-full overflow-auto rounded-xl border border-gray-200 bg-white">
                    <table className="min-w-[780px] text-left text-sm">
                      <thead className="bg-gray-50 text-xs font-bold uppercase tracking-[0.14em] text-gray-400">
                        <tr>
                          <th className="px-3 py-3">Função</th>
                          <th className="px-3 py-3">Data da escala</th>
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
                          const encerrada = area.encerrada || escalaEstaEncerrada(area.dataHora);

                          return voluntarios.map((item) => {
                            const config = statusConfig[item.status] || statusConfig.PENDENTE;
                            const Icon = config.icon;

                            return (
                              <tr key={`${area.id}-${item.id}`} className="align-top">
                                <td className="px-3 py-3 font-bold text-gray-900">{area.equipe?.nome || 'Sem equipe'}</td>
                                <td className="whitespace-nowrap px-3 py-3 font-semibold text-gray-600">{formatarData(area.dataHora)}</td>
                                <td className="px-3 py-3 text-gray-700">
                                  {item.usuario ? (
                                    <div className="flex items-start gap-2">
                                      <UsuarioInfoButton usuario={item.usuario} onClick={onAbrirUsuario} />
                                      <div className="min-w-0">
                                        <span className="break-words font-semibold">{item.usuario.nomeCompleto}</span>
                                        {item.usuario.telefone && (
                                          <span className="ml-2 whitespace-nowrap text-[11px] font-medium text-gray-400">{formatarTelefoneExibicao(item.usuario.telefone)}</span>
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
                                  {area.tipo === 'RECORRENTE' && !area.eventoId && !encerrada && (
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
            </>
          )}
        </div>
      </div>

      {escalaEmEdicao && formEdicaoEscala && (
        <ModalEdicaoEscala
          evento={escalaEmEdicao}
          form={formEdicaoEscala}
          salvandoId={salvandoId}
          onChange={onChangeEdicaoEscala}
          onSelecionarOcorrencia={onSelecionarOcorrenciaEdicao}
          onSubmit={onSalvarEdicaoEscala}
          onClose={onFecharEdicaoEscala}
          onAbrirOrdemCulto={onAbrirOrdemCulto}
        />
      )}
      {escalaEmExclusao && formExclusaoEscala && (
        <ModalExclusaoEscala
          evento={escalaEmExclusao}
          form={formExclusaoEscala}
          salvandoId={salvandoId}
          onSelecionarOcorrencia={onSelecionarOcorrenciaExclusao}
          onConfirmar={onConfirmarExclusaoEscala}
          onClose={onFecharExclusaoEscala}
        />
      )}
    </section>
  );
}

function ModalEdicaoEscala({
  evento,
  form,
  salvandoId,
  onChange,
  onSelecionarOcorrencia,
  onSubmit,
  onClose,
  onAbrirOrdemCulto,
}) {
  const salvando = salvandoId === `editar-escala-${form.eventoId}`;
  const ocorrencias = getOcorrenciasUnicas(evento);
  const areasDaOcorrencia = getAreasEvento(evento)
    .filter((area) => area.dataHora === form.dataHoraAtual);
  const podeEditarData = form.frequencia === 'NAO_REPETE';
  const painelRef = useModalDialog(() => { if (!salvando) onClose(); });

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-950/45 px-4 py-6 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !salvando && onClose()}>
      <form ref={painelRef} onSubmit={onSubmit} role="dialog" aria-modal="true" aria-labelledby="titulo-modal-edicao-escala" className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-dourado-700">Editar escala</p>
            <h2 id="titulo-modal-edicao-escala" className="mt-1 text-xl font-bold text-gray-950">{form.titulo || 'Escala sem título'}</h2>
          </div>
          <button type="button" disabled={salvando} onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50" title="Fechar" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-5">
          {ocorrencias.length > 1 && (
            <Select
              label="Ocorrência"
              value={form.dataHoraAtual}
              options={ocorrencias.map((area) => ({ value: area.dataHora, label: formatarData(area.dataHora) }))}
              onChange={onSelecionarOcorrencia}
            />
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Campo label="Título" value={form.titulo} onChange={(value) => onChange((atual) => ({ ...atual, titulo: value }))} />
            <Campo
              label="Data e horário"
              type="datetime-local"
              value={form.dataHora}
              disabled={!podeEditarData}
              onChange={(value) => onChange((atual) => ({ ...atual, dataHora: value }))}
            />
            <Campo label="Local" value={form.local} onChange={(value) => onChange((atual) => ({ ...atual, local: value }))} />
            <div className="lg:row-span-2">
              <CampoTexto label="Descrição" value={form.descricao} onChange={(value) => onChange((atual) => ({ ...atual, descricao: value }))} />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Funções desta ocorrência</p>
            <div className="flex flex-wrap gap-2">
              {areasDaOcorrencia.map((area) => (
                <span key={area.id} className="rounded border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-600">
                  {area.equipe?.nome || 'Sem equipe'}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-gray-950">Ordem de culto</p>
                <p className="mt-1 text-xs text-gray-500">
                  {form.ordemArquivo?.name || (form.ordemCulto ? form.ordemCulto.titulo : 'Nenhum PDF anexado')}
                </p>
              </div>
              {form.ordemCulto && (
                <button
                  type="button"
                  onClick={() => onAbrirOrdemCulto(form.ordemCulto)}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-100"
                >
                  <Eye size={15} />
                  Visualizar atual
                </button>
              )}
            </div>
            <label className="mt-3 block">
              <span className="sr-only">Anexar ordem de culto em PDF</span>
              <input
                key={form.dataHoraAtual}
                type="file"
                accept="application/pdf"
                disabled={salvando}
                onChange={(event) => onChange((atual) => ({ ...atual, ordemArquivo: event.target.files?.[0] || null }))}
                className="block w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition file:mr-3 file:rounded-md file:border-0 file:bg-gray-950 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 disabled:opacity-60"
              />
            </label>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" disabled={salvando} onClick={onClose} className="rounded-md border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60">
            Cancelar
          </button>
          <button disabled={salvando} className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-gray-800 disabled:opacity-60">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : form.ordemArquivo ? <FileText size={16} /> : <Save size={16} />}
            Salvar escala
          </button>
        </div>
      </form>
    </div>
  );
}

function ModalExclusaoEscala({
  evento,
  form,
  salvandoId,
  onSelecionarOcorrencia,
  onConfirmar,
  onClose,
}) {
  const excluindo = salvandoId === `excluir-escala-${form.eventoId}`;
  const excluiSerie = form.frequencia !== 'NAO_REPETE';
  const ocorrenciasExcluiveis = getOcorrenciasUnicas(evento)
    .filter((area) => !(area.encerrada || escalaEstaEncerrada(area.dataHora)));
  const areasDaOcorrencia = getAreasEvento(evento)
    .filter((area) => area.dataHora === form.dataHoraAtual);
  const painelRef = useModalDialog(() => { if (!excluindo) onClose(); });

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-950/45 px-4 py-6 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !excluindo && onClose()}>
      <div ref={painelRef} role="dialog" aria-modal="true" aria-labelledby="titulo-modal-exclusao-escala" className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-red-50 p-2 text-red-600">
            <AlertCircle size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-red-700">Confirmar exclusão</p>
            <h2 id="titulo-modal-exclusao-escala" className="mt-2 break-words text-xl font-bold leading-7 text-gray-950">
              Excluir {excluiSerie ? 'evento recorrente' : 'escala'} {form.titulo || 'selecionada'}?
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              {excluiSerie
                ? 'Todas as escalas futuras deste evento serão removidas e novas ocorrências deixarão de ser geradas.'
                : 'Esta ocorrência será removida com voluntários, status e ordem de culto vinculados a ela.'}
            </p>
          </div>
        </div>

        {!excluiSerie && ocorrenciasExcluiveis.length > 1 && (
          <div className="mt-5">
            <Select
              label="Ocorrência"
              value={form.dataHoraAtual}
              options={ocorrenciasExcluiveis.map((area) => ({ value: area.dataHora, label: formatarData(area.dataHora) }))}
              onChange={onSelecionarOcorrencia}
            />
          </div>
        )}

        <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-red-700">
            {excluiSerie ? 'A partir de' : 'Ocorrência'}
          </p>
          <p className="mt-1 text-sm font-bold text-gray-950">{formatarData(form.dataHoraAtual)}</p>
          {areasDaOcorrencia.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {areasDaOcorrencia.map((area) => (
                <span key={area.id} className="rounded border border-red-100 bg-white px-2.5 py-1 text-xs font-bold text-red-700">
                  {area.equipe?.nome || 'Sem equipe'}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={excluindo}
            onClick={onClose}
            className="rounded-md border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={excluindo}
            onClick={onConfirmar}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {excluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 size={16} />}
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}

function CalendarioEscalas({ eventos }) {
  const [mesAtual, setMesAtual] = useState(() => {
    const hoje = new Date();
    return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  });
  const [diaSelecionado, setDiaSelecionado] = useState(null);
  const hoje = new Date();
  const inicioMes = new Date(mesAtual.getFullYear(), mesAtual.getMonth(), 1);
  const inicioGrade = new Date(inicioMes);
  inicioGrade.setDate(inicioGrade.getDate() - inicioGrade.getDay());
  const diasGrade = Array.from({ length: 42 }, (_, index) => {
    const data = new Date(inicioGrade);
    data.setDate(inicioGrade.getDate() + index);
    return data;
  });
  const nomeMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(mesAtual);
  const nomesSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const eventosNaData = (data) => eventos.filter((evento) => {
    if (!evento.dataHora) return false;
    const dataEvento = getUtcDateParts(evento.dataHora);
    return dataEvento
      && dataEvento.ano === data.getFullYear()
      && dataEvento.mes === data.getMonth()
      && dataEvento.dia === data.getDate();
  });

  const eventosSelecionados = diaSelecionado ? eventosNaData(diaSelecionado) : [];
  const dataEvento = (evento) => evento.dataHora;

  useEffect(() => {
    if (!diaSelecionado) return undefined;
    const fecharComEscape = (event) => {
      if (event.key === 'Escape') setDiaSelecionado(null);
    };
    window.addEventListener('keydown', fecharComEscape);
    return () => window.removeEventListener('keydown', fecharComEscape);
  }, [diaSelecionado]);

  const navegarMes = (direcao) => {
    setMesAtual((atual) => new Date(atual.getFullYear(), atual.getMonth() + direcao, 1));
    setDiaSelecionado(null);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-3 sm:px-4">
        <button type="button" onClick={() => navegarMes(-1)} className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 text-gray-600 transition hover:bg-gray-50" title="Mês anterior" aria-label="Mês anterior">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-sm font-bold capitalize text-gray-950">{nomeMes}</p>
          <button type="button" onClick={() => setMesAtual(new Date(hoje.getFullYear(), hoje.getMonth(), 1))} className="mt-0.5 text-xs font-semibold text-dourado-700 hover:text-dourado-800">
            Ir para hoje
          </button>
        </div>
        <button type="button" onClick={() => navegarMes(1)} className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 text-gray-600 transition hover:bg-gray-50" title="Próximo mês" aria-label="Próximo mês">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
        {nomesSemana.map((dia) => <div key={dia} className="py-2 text-center text-[11px] font-bold uppercase text-gray-400">{dia}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {diasGrade.map((data) => {
          const eventosDoDia = eventosNaData(data);
          const pertenceAoMes = data.getMonth() === mesAtual.getMonth();
          const isHoje = data.getFullYear() === hoje.getFullYear() && data.getMonth() === hoje.getMonth() && data.getDate() === hoje.getDate();
          const chave = `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`;

          return (
            <button
              key={chave}
              type="button"
              disabled={eventosDoDia.length === 0}
              onClick={() => setDiaSelecionado(new Date(data))}
              className={`relative aspect-square min-h-12 border-b border-r border-gray-100 p-1.5 text-left transition sm:min-h-20 sm:p-2 ${pertenceAoMes ? 'bg-white' : 'bg-gray-50/70'} ${eventosDoDia.length > 0 ? 'cursor-pointer hover:bg-dourado-50/50' : 'cursor-default'}`}
              aria-label={`${data.getDate()} de ${nomeMes}${eventosDoDia.length ? `, ${eventosDoDia.length} escala(s)` : ''}`}
            >
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isHoje ? 'bg-gray-950 text-white' : pertenceAoMes ? 'text-gray-700' : 'text-gray-300'}`}>{data.getDate()}</span>
              {eventosDoDia.length > 0 && (
                <span className="absolute bottom-1.5 left-1.5 right-1.5 flex flex-wrap gap-1 sm:bottom-2 sm:left-2 sm:right-2">
                  {eventosDoDia.slice(0, 3).map((evento) => (
                    <span key={evento.id} className={`h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2 ${evento.tipo === 'ESPORADICA' ? 'bg-amber-500' : 'bg-sky-600'}`} title={evento.titulo} />
                  ))}
                  {eventosDoDia.length > 3 && <span className="text-[9px] font-bold leading-2 text-gray-500">+{eventosDoDia.length - 3}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-gray-100 px-4 py-3 text-xs font-semibold text-gray-500">
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-sky-600" />Recorrente</span>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-500" />Esporádica</span>
      </div>

      {diaSelecionado && eventosSelecionados.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 px-4 py-6 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && setDiaSelecionado(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="titulo-escalas-dia" className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase text-dourado-700">Escalas do dia</p>
                <h2 id="titulo-escalas-dia" className="mt-1 text-xl font-bold text-gray-950">
                  {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(diaSelecionado)}
                </h2>
              </div>
              <button type="button" onClick={() => setDiaSelecionado(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900" title="Fechar" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[65vh] space-y-3 overflow-y-auto p-5">
              {eventosSelecionados.map((evento) => (
                <article key={evento.id} className="rounded-md border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${evento.tipo === 'ESPORADICA' ? 'bg-amber-500' : 'bg-sky-600'}`} />
                    <span className="text-xs font-bold uppercase text-gray-500">{evento.tipo === 'ESPORADICA' ? 'Esporádica' : 'Recorrente'}</span>
                  </div>
                  <h3 className="mt-2 text-base font-bold text-gray-950">{evento.titulo}</h3>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                    <span>{formatarData(dataEvento(evento))}</span>
                    {evento.local && <span>Local: {evento.local}</span>}
                  </div>
                  {evento.descricao && <p className="mt-2 text-sm leading-6 text-gray-600">{evento.descricao}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {evento.areas.map((area) => <span key={area.id} className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-700">{area.equipe?.nome || 'Sem equipe'}</span>)}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
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
  const salvandoManual = salvandoId === 'novo-manual' || (Boolean(manualEditandoId) && salvandoId === manualEditandoId);
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
              disabled={salvandoManual}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
            >
              {salvandoManual ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
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

function Campo({ label, value, onChange, type = 'text', placeholder = '', min, disabled = false }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <input
        type={type}
        value={value}
        min={min}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-2 block w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 disabled:cursor-not-allowed disabled:opacity-70 ${disabled ? 'bg-gray-50 text-gray-500' : 'bg-white'}`}
      />
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

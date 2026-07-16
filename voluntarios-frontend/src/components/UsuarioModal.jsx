import React, { useState } from 'react';
import { AlertTriangle, Loader2, Mail, Phone, ShieldCheck, Trash2, UserRound, X } from 'lucide-react';
import { formatarTelefoneExibicao } from '../lib/telefone';

function formatarData(valor, comHora = false) {
  if (!valor) return 'Não informado';

  try {
    return new Intl.DateTimeFormat('pt-BR', comHora ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(valor));
  } catch {
    return 'Não informado';
  }
}

function formatarPermissao(permissao) {
  return String(permissao || '').replaceAll('_', ' ');
}

function CampoDetalhe({ label, valor }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-gray-800">{valor || 'Não informado'}</p>
    </div>
  );
}

function ListaTags({ titulo, itens, prefixo = '' }) {
  if (!itens?.length) {
    return <CampoDetalhe label={titulo} valor="Não informado" />;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">{titulo}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {itens.map((item) => (
          <span key={item.id || item} className="rounded border border-dourado-200 bg-dourado-50 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-dourado-700">
            {prefixo}{item.nome || item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function UsuarioInfoButton({ usuario, onClick, className = '' }) {
  if (!usuario) return null;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick(usuario);
      }}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 ${className}`}
      title={`Ver dados de ${usuario.nomeCompleto || 'usuário'}`}
      aria-label={`Ver dados de ${usuario.nomeCompleto || 'usuário'}`}
    >
      {usuario.urlFoto ? (
        <img src={usuario.urlFoto} alt="" className="h-full w-full object-cover" />
      ) : (
        <UserRound size={15} />
      )}
    </button>
  );
}

export function UsuarioModal({ usuario, onClose, podeExcluir = false, onExcluir, excluindo = false }) {
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  if (!usuario) return null;

  const confirmarExclusao = async () => {
    if (!onExcluir) return;
    await onExcluir(usuario.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-50 text-gray-500">
              {usuario.urlFoto ? (
                <img src={usuario.urlFoto} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserRound size={22} />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-gray-950">{usuario.nomeCompleto || 'Usuário sem nome'}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-dourado-700">Dados do usuário</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-gray-200 bg-white p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900" aria-label="Fechar modal">
            <X size={18} />
          </button>
        </div>

        {confirmandoExclusao ? (
          <div className="space-y-5 p-5">
            <div className="rounded-2xl border border-red-100 bg-red-50 p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-white p-2 text-red-600 shadow-sm">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.16em] text-red-700">Confirmar exclusão</p>
                  <h2 className="mt-2 text-2xl font-bold text-gray-950">
                    Tem certeza que deseja excluir {usuario.nomeCompleto || 'este voluntário'}?
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-red-800">
                    Essa ação remove definitivamente o cadastro do voluntário, seus vínculos com equipes e registros relacionados às escalas. Use somente quando este usuário não deve mais existir no MCom.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Voluntário selecionado</p>
              <p className="mt-2 text-lg font-bold text-gray-950">{usuario.nomeCompleto || 'Usuário sem nome'}</p>
              <p className="mt-1 text-sm text-gray-500">{usuario.email || 'E-mail não informado'}</p>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={excluindo}
                onClick={() => setConfirmandoExclusao(false)}
                className="rounded-md border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
              >
                Cancelar e manter voluntário
              </button>
              <button
                type="button"
                disabled={excluindo}
                onClick={confirmarExclusao}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {excluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 size={16} />}
                Excluir definitivamente
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoDetalhe label="Nome completo" valor={usuario.nomeCompleto} />
              <CampoDetalhe label="ID" valor={usuario.id} />
              <CampoDetalhe label="E-mail" valor={usuario.email} />
              <CampoDetalhe label="Telefone" valor={formatarTelefoneExibicao(usuario.telefone)} />
              <CampoDetalhe label="Sexo" valor={usuario.sexo ? formatarPermissao(usuario.sexo) : null} />
              <CampoDetalhe label="Nascimento" valor={formatarData(usuario.dataNascimento)} />
              <CampoDetalhe label="Criado em" valor={formatarData(usuario.criadoEm, true)} />
              <CampoDetalhe label="Atualizado em" valor={formatarData(usuario.atualizadoEm, true)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ListaTags titulo="Permissões" itens={(usuario.permissoes || []).map(formatarPermissao)} />
              <ListaTags titulo="Equipes como voluntário" itens={usuario.equipes || []} prefixo="Voluntário: " />
              <ListaTags titulo="Equipes lideradas" itens={usuario.equipesLideradas || []} prefixo="Líder: " />
              <CampoDetalhe label="Foto" valor={usuario.urlFoto} />
            </div>

            <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs font-semibold text-gray-500">
              {usuario.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail size={13} />
                  {usuario.email}
                </span>
              )}
              {usuario.telefone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone size={13} />
                  {formatarTelefoneExibicao(usuario.telefone)}
                </span>
              )}
              {(usuario.permissoes || []).length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck size={13} />
                  {(usuario.permissoes || []).map(formatarPermissao).join(', ')}
                </span>
              )}
            </div>

            {podeExcluir && (
              <div className="rounded-xl border border-red-100 bg-red-50/70 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-red-800">Zona de exclusão</p>
                    <p className="mt-1 text-xs leading-5 text-red-700">Disponível apenas para administradores. A confirmação aparece antes da exclusão definitiva.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmandoExclusao(true)}
                    className="inline-flex w-fit items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50"
                  >
                    <Trash2 size={15} />
                    Excluir voluntário
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

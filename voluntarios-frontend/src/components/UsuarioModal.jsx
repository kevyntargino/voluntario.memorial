import React from 'react';
import { Mail, Phone, ShieldCheck, UserRound, X } from 'lucide-react';

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

export function UsuarioModal({ usuario, onClose }) {
  if (!usuario) return null;

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

        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoDetalhe label="Nome completo" valor={usuario.nomeCompleto} />
            <CampoDetalhe label="ID" valor={usuario.id} />
            <CampoDetalhe label="E-mail" valor={usuario.email} />
            <CampoDetalhe label="Telefone" valor={usuario.telefone} />
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
                {usuario.telefone}
              </span>
            )}
            {(usuario.permissoes || []).length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck size={13} />
                {(usuario.permissoes || []).map(formatarPermissao).join(', ')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

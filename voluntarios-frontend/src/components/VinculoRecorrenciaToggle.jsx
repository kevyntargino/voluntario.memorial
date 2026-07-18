import React from 'react';

export function VinculoRecorrenciaToggle({ ativo, onChange, disabled = false }) {
  return (
    <div className="mt-4 flex items-start justify-between gap-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-3">
      <div>
        <p className="text-sm font-bold text-gray-950">Vincular à recorrência</p>
        <p className="mt-1 text-xs leading-5 text-gray-600">
          {ativo
            ? 'Ligado: a seleção será aplicada também às próximas ocorrências equivalentes.'
            : 'Desligado: a seleção valerá somente para esta ocorrência.'}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={ativo}
        aria-label="Vincular voluntários à recorrência"
        disabled={disabled}
        onClick={() => onChange(!ativo)}
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-60 ${ativo ? 'bg-blue-700' : 'bg-gray-300'}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${ativo ? 'left-1 translate-x-5' : 'left-1 translate-x-0'}`} />
      </button>
    </div>
  );
}

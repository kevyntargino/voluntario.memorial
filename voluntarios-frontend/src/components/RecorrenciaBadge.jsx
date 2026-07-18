import React from 'react';
import { Repeat2 } from 'lucide-react';

const nomesDiasSemana = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function getRecorrenciaEscala(escala) {
  if (escala?.tipo !== 'RECORRENTE' || escala.semanaMes == null) {
    return null;
  }

  const semanaMes = Number(escala.semanaMes);

  if (!Number.isInteger(semanaMes) || semanaMes < 1 || semanaMes > 5) {
    return null;
  }

  const diaSemana = Number(escala.diaSemana);
  const dia = Number.isInteger(diaSemana) && diaSemana >= 0 && diaSemana <= 6
    ? nomesDiasSemana[diaSemana]
    : 'fim de semana';

  return {
    semanaMes,
    ordinal: `${semanaMes}º`,
    label: `${semanaMes}º ${dia}`,
    title: `Recorrente no ${semanaMes}º ${dia}`,
  };
}

export function RecorrenciaBadge({ escala, className = '' }) {
  const recorrencia = getRecorrenciaEscala(escala);

  if (!recorrencia) {
    return null;
  }

  return (
    <span
      className={`inline-flex min-h-7 w-fit items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200 ${className}`}
      title={recorrencia.title}
      aria-label={recorrencia.title}
    >
      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-blue-700 px-1 text-[10px] leading-none text-white dark:bg-blue-300 dark:text-blue-950">
        {recorrencia.ordinal}
      </span>
      <Repeat2 size={13} />
      <span>{recorrencia.label}</span>
    </span>
  );
}

export function RecorrenciaOrdinal({ escala, className = '' }) {
  const recorrencia = getRecorrenciaEscala(escala);

  if (!recorrencia) {
    return null;
  }

  return (
    <span
      className={`inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border border-dourado-200 bg-dourado-50 px-1.5 align-middle text-xs font-black leading-none text-dourado-700 dark:border-dourado-700 dark:bg-dourado-950/50 dark:text-dourado-200 ${className}`}
      title={recorrencia.title}
      aria-label={recorrencia.title}
    >
      {recorrencia.ordinal}
    </span>
  );
}

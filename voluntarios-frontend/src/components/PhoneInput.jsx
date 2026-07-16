import React, { useEffect, useRef, useState } from 'react';
import { formatarNumeroTelefone, paisesTelefone, separarTelefone, somenteDigitos } from '../lib/telefone';

function criarEstado(valor) {
  const telefone = separarTelefone(valor);
  const paisConhecido = paisesTelefone.some(({ ddi }) => ddi === telefone.ddi);
  return {
    ddi: telefone.ddi,
    numero: telefone.numero,
    personalizado: !paisConhecido,
  };
}

function limitarNumero(numero, ddi) {
  const limite = ddi === '55' ? 11 : Math.max(6, 15 - ddi.length);
  return somenteDigitos(numero).slice(0, limite);
}

export function PhoneInput({ label = 'Telefone', value, onChange, highlighted = false, dataCadastroCampo }) {
  const [estado, setEstado] = useState(() => criarEstado(value));
  const ultimoValorRef = useRef(value || '');

  useEffect(() => {
    const proximoValor = value || '';

    if (proximoValor !== ultimoValorRef.current) {
      ultimoValorRef.current = proximoValor;
      setEstado(criarEstado(proximoValor));
    }
  }, [value]);

  const emitir = (ddi, numero) => {
    const telefone = numero && ddi ? `${ddi}${numero}` : '';
    ultimoValorRef.current = telefone;
    onChange(telefone);
  };

  const alterarPais = (proximoValor) => {
    if (proximoValor === 'OUTRO') {
      setEstado((atual) => ({ ...atual, ddi: '', personalizado: true }));
      return;
    }

    const numero = limitarNumero(estado.numero, proximoValor);
    setEstado((atual) => ({ ...atual, ddi: proximoValor, numero, personalizado: false }));
    emitir(proximoValor, numero);
  };

  const alterarDdiPersonalizado = (valorDdi) => {
    const ddi = somenteDigitos(valorDdi).slice(0, 4);
    const numero = limitarNumero(estado.numero, ddi);
    setEstado((atual) => ({ ...atual, ddi, numero }));
    emitir(ddi, numero);
  };

  const alterarNumero = (valorNumero) => {
    const numero = limitarNumero(valorNumero, estado.ddi);
    setEstado((atual) => ({ ...atual, numero }));
    emitir(estado.ddi, numero);
  };

  const borda = highlighted
    ? 'border-amber-400 ring-2 ring-amber-200/70 dark:border-amber-600 dark:ring-amber-900/50'
    : 'border-gray-300 dark:border-gray-700';

  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</span>
      <div className={`mt-2 flex min-h-11 overflow-hidden rounded-md border bg-white transition focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900/10 dark:bg-gray-950 dark:focus-within:border-gray-400 dark:focus-within:ring-gray-400/20 ${borda}`}>
        <select
          value={estado.personalizado ? 'OUTRO' : estado.ddi}
          onChange={(event) => alterarPais(event.target.value)}
          className="w-[8.5rem] shrink-0 border-0 border-r border-gray-200 bg-gray-50 px-2 text-xs font-semibold text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 sm:w-[10.5rem]"
          aria-label="País e código internacional"
        >
          {paisesTelefone.map((pais) => <option key={pais.ddi} value={pais.ddi}>{pais.nome} +{pais.ddi}</option>)}
          <option value="OUTRO">Outro código</option>
        </select>
        {estado.personalizado && (
          <div className="flex shrink-0 items-center border-r border-gray-200 px-2 dark:border-gray-700">
            <span className="text-sm text-gray-500 dark:text-gray-400">+</span>
            <input
              value={estado.ddi}
              onChange={(event) => alterarDdiPersonalizado(event.target.value)}
              inputMode="numeric"
              className="w-11 border-0 bg-transparent p-0 text-sm font-semibold text-gray-800 outline-none dark:text-gray-100"
              aria-label="Código internacional"
              placeholder="00"
            />
          </div>
        )}
        <input
          data-cadastro-campo={dataCadastroCampo}
          value={formatarNumeroTelefone(estado.numero, estado.ddi)}
          onChange={(event) => alterarNumero(event.target.value)}
          inputMode="tel"
          autoComplete="tel-national"
          className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-100"
          placeholder={estado.ddi === '55' ? '(67) 4002-8922' : 'Número de telefone'}
          aria-label="Número de telefone"
        />
      </div>
    </label>
  );
}

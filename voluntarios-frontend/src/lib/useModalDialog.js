import { useEffect, useRef } from 'react';

const SELETOR_FOCAVEL = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Acessibilidade padrão de diálogo modal: trava o scroll do fundo, fecha no
 * Escape, mantém o foco preso dentro do painel (Tab/Shift+Tab) e devolve o foco
 * ao elemento anterior ao fechar. Retorna a ref que deve ser aplicada ao painel.
 */
export function useModalDialog(onClose, ativo = true) {
  const painelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!ativo) {
      return undefined;
    }

    const elementoAnterior = document.activeElement;
    const { body } = document;
    const overflowAnterior = body.style.overflow;
    body.style.overflow = 'hidden';

    const focaveis = () => Array.from(painelRef.current?.querySelectorAll(SELETOR_FOCAVEL) || [])
      .filter((elemento) => elemento.offsetParent !== null || elemento === document.activeElement);

    const raf = window.requestAnimationFrame(() => {
      const painel = painelRef.current;
      if (!painel || painel.contains(document.activeElement)) {
        return;
      }
      (focaveis()[0] || painel).focus?.();
    });

    const aoTeclar = (event) => {
      if (event.key === 'Escape') {
        onCloseRef.current?.();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const lista = focaveis();
      if (lista.length === 0) {
        return;
      }

      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      const focado = document.activeElement;

      if (event.shiftKey && (focado === primeiro || !painelRef.current?.contains(focado))) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && focado === ultimo) {
        event.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener('keydown', aoTeclar);

    return () => {
      document.removeEventListener('keydown', aoTeclar);
      window.cancelAnimationFrame(raf);
      body.style.overflow = overflowAnterior;
      elementoAnterior?.focus?.();
    };
  }, [ativo]);

  return painelRef;
}

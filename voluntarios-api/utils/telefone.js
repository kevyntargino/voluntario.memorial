export function normalizarTelefone(valor) {
  if (valor === null || valor === undefined) return null;
  const digitos = String(valor).replace(/\D/g, '').slice(0, 15);
  return digitos || null;
}

export function normalizarTelefoneBrasilParaLogin(valor) {
  const digitos = normalizarTelefone(valor);

  if (!digitos) return null;

  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) {
    return digitos;
  }

  if (digitos.length === 10 || digitos.length === 11) {
    return `55${digitos}`;
  }

  return null;
}

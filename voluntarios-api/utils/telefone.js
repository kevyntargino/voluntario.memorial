export function normalizarTelefone(valor) {
  if (valor === null || valor === undefined) return null;
  const digitos = String(valor).replace(/\D/g, '').slice(0, 15);
  return digitos || null;
}

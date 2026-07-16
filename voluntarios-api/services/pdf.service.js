export const MAX_ORDEM_CULTO_PDF_SIZE = 10 * 1024 * 1024;

export function validarPdfBase64(arquivo, tamanhoMaximo = MAX_ORDEM_CULTO_PDF_SIZE) {
  if (!arquivo || arquivo.contentType !== 'application/pdf' || typeof arquivo.base64 !== 'string') {
    return { erro: 'Selecione um arquivo PDF válido.' };
  }

  const base64 = arquivo.base64.includes(',') ? arquivo.base64.split(',').pop() : arquivo.base64;
  const buffer = Buffer.from(base64, 'base64');

  if (buffer.length === 0) return { erro: 'O PDF enviado está vazio.' };
  if (buffer.length > tamanhoMaximo) return { erro: 'A ordem de culto deve ter no máximo 10MB.' };
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    return { erro: 'O arquivo enviado não contém um PDF válido.' };
  }

  return { buffer };
}

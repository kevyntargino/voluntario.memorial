import test from 'node:test';
import assert from 'node:assert/strict';
import { validarPdfBase64 } from '../services/pdf.service.js';

test('aceita conteúdo PDF com assinatura válida', () => {
  const resultado = validarPdfBase64({
    contentType: 'application/pdf',
    base64: Buffer.from('%PDF-1.7\nconteudo').toString('base64'),
  });

  assert.equal(resultado.erro, undefined);
  assert.equal(resultado.buffer.subarray(0, 5).toString(), '%PDF-');
});

test('rejeita arquivo que apenas declara o tipo PDF', () => {
  const resultado = validarPdfBase64({
    contentType: 'application/pdf',
    base64: Buffer.from('arquivo falso').toString('base64'),
  });

  assert.match(resultado.erro, /não contém um PDF válido/);
});

test('rejeita PDF acima do tamanho configurado', () => {
  const resultado = validarPdfBase64({
    contentType: 'application/pdf',
    base64: Buffer.from('%PDF-123456').toString('base64'),
  }, 5);

  assert.match(resultado.erro, /no máximo 10MB/);
});

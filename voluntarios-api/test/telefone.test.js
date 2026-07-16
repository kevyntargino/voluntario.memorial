import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarTelefone } from '../utils/telefone.js';

test('remove a formatação e mantém DDI, DDD e número', () => {
  assert.equal(normalizarTelefone('+55 (67) 4002-8922'), '556740028922');
});

test('mantém somente os 15 dígitos permitidos pelo padrão internacional', () => {
  assert.equal(normalizarTelefone('+351 912 345 678 999 000'), '351912345678999');
});

test('retorna nulo quando nenhum número foi informado', () => {
  assert.equal(normalizarTelefone(''), null);
  assert.equal(normalizarTelefone(null), null);
});

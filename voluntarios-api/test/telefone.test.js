import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarTelefone, normalizarTelefoneBrasilParaLogin } from '../utils/telefone.js';

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

test('normaliza telefone brasileiro de login com DDD sem DDI', () => {
  assert.equal(normalizarTelefoneBrasilParaLogin('(67) 99999-0001'), '5567999990001');
  assert.equal(normalizarTelefoneBrasilParaLogin('6740028922'), '556740028922');
});

test('mantém telefone brasileiro de login quando o DDI já foi informado', () => {
  assert.equal(normalizarTelefoneBrasilParaLogin('+55 (67) 99999-0001'), '5567999990001');
});

test('rejeita telefone de login incompleto', () => {
  assert.equal(normalizarTelefoneBrasilParaLogin('67999'), null);
});

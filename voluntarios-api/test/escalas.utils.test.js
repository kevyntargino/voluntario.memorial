import test from 'node:test';
import assert from 'node:assert/strict';
import { escalaEstaEncerrada, getAgoraEscalas } from '../utils/escalas.js';

test('compara o horário da escala no fuso operacional', () => {
  const agora = getAgoraEscalas(new Date('2026-07-16T21:30:00.000Z'));

  assert.equal(agora.toISOString(), '2026-07-16T17:30:00.000Z');
  assert.equal(escalaEstaEncerrada('2026-07-16T17:00:00.000Z', agora), true);
  assert.equal(escalaEstaEncerrada('2026-07-16T18:00:00.000Z', agora), false);
});

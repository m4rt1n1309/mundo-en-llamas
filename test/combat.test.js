import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackerDiceCount, defenderDiceCount, resolveCombat, isValidTrade, tradeValue, DEFAULT_CONFIG } from '../src/engine/index.js';
import { card } from './helpers.js';

test('el atacante tira un dado menos que sus ejércitos, máximo 3', () => {
  assert.deepEqual([1, 2, 3, 4, 10].map(attackerDiceCount), [0, 1, 2, 3, 3]);
});

test('el defensor tira un dado por ejército, máximo 3', () => {
  assert.deepEqual([1, 2, 3, 4, 10].map(defenderDiceCount), [1, 2, 3, 3, 3]);
});

test('se comparan de mayor a menor y el empate lo gana el defensor', () => {
  const r = resolveCombat([3, 6, 1], [6, 2]);
  assert.deepEqual(r.attack, [6, 3, 1]);
  assert.deepEqual(r.defend, [6, 2]);
  // 6 vs 6 empate -> pierde atacante; 3 vs 2 -> pierde defensor; el 1 no se compara
  assert.equal(r.attackerLosses, 1);
  assert.equal(r.defenderLosses, 1);
});

test('solo se comparan tantos pares como dados del que tiró menos', () => {
  const r = resolveCombat([2], [1, 1, 1]);
  assert.equal(r.attackerLosses + r.defenderLosses, 1);
  assert.equal(r.defenderLosses, 1);
});

test('canjes válidos: tres iguales, tres distintos o con comodín', () => {
  assert.ok(isValidTrade([card(1, 'tanque'), card(2, 'tanque'), card(3, 'tanque')]));
  assert.ok(isValidTrade([card(1, 'tanque'), card(2, 'avion'), card(3, 'barco')]));
  assert.ok(isValidTrade([card(1, 'tanque'), card(2, 'avion'), card(3, 'comodin')]));
  assert.ok(isValidTrade([card(1, 'tanque'), card(2, 'tanque'), card(3, 'comodin')]));
  assert.ok(!isValidTrade([card(1, 'tanque'), card(2, 'tanque'), card(3, 'barco')]));
  assert.ok(!isValidTrade([card(1, 'tanque'), card(2, 'tanque')]));
});

test('cada canje da más ejércitos', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((n) => tradeValue(DEFAULT_CONFIG, n)), [4, 6, 9, 12, 15, 20, 25]);
});

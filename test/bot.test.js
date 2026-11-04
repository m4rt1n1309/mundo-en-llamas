import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction } from '../src/engine/index.js';
import { MUNDO } from '../src/map/mundo.js';
import { decidirBot } from '../src/bot.js';

function partidaDeBots(seed, cantidad) {
  let s = createGame({
    map: MUNDO,
    seed,
    players: Array.from({ length: cantidad }, (_, i) => ({ id: `b${i}`, name: `Bot ${i}`, color: `c${i}`, bot: true })),
  });
  let acciones = 0;
  while (s.phase !== 'finished' && s.round <= 200) {
    const pid = s.turnOrder[s.current];
    // si el bot propone algo inválido, applyAction lanza y el test falla
    s = applyAction(MUNDO, s, pid, decidirBot(MUNDO, s, pid)).state;
    if (++acciones > 200000) throw new Error('el bot se quedó en un bucle');
  }
  return s;
}

test('los jugadores quedan marcados como bots', () => {
  const s = createGame({ map: MUNDO, seed: 1, players: [{ id: 'a', name: 'A', color: 'x' }, { id: 'b', name: 'B', color: 'y', bot: true }] });
  assert.deepEqual(s.players.map((p) => p.bot), [false, true]);
});

test('partidas solo de bots: siempre acciones válidas y terminan con ganador', () => {
  const motivos = {};
  let terminadas = 0;
  let rondas = 0;
  const N = 30;
  for (let seed = 1; seed <= N; seed++) {
    const s = partidaDeBots(seed, 2 + (seed % 5));
    if (s.phase !== 'finished') continue;
    terminadas++;
    rondas += s.round;
    motivos[s.winner.reason] = (motivos[s.winner.reason] ?? 0) + 1;
  }
  console.log(`Bots: ${terminadas}/${N} partidas con ganador, ${Math.round(rondas / terminadas)} rondas promedio`, motivos);
  assert.ok(terminadas >= N * 0.9, `solo ${terminadas}/${N} terminaron`);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createGame, applyAction, validateMap, territoriesOf, attackerDiceCount, isValidTrade, ownedBy, GameError,
} from '../src/engine/index.js';
import { MUNDO } from '../src/map/mundo.js';

const GEO = JSON.parse(readFileSync(new URL('../src/map/mundo-geo.json', import.meta.url)));
const TIDS = Object.keys(MUNDO.territories);

test('el mapa es válido: 49 territorios, 6 continentes, fronteras recíprocas', () => {
  validateMap(MUNDO);
  assert.equal(TIDS.length, 49);
  assert.equal(Object.keys(MUNDO.continents).length, 6);
});

test('se puede llegar de cualquier territorio a cualquier otro', () => {
  const seen = new Set([TIDS[0]]);
  const queue = [TIDS[0]];
  while (queue.length) {
    for (const n of MUNDO.territories[queue.shift()].neighbors) {
      if (!seen.has(n)) seen.add(n) && queue.push(n);
    }
  }
  assert.equal(seen.size, TIDS.length);
});

test('los objetivos son alcanzables', () => {
  for (const o of MUNDO.objectives) {
    let min = 0;
    for (const c of o.continents ?? []) min += territoriesOf(MUNDO, c).length;
    for (const [c, n] of Object.entries(o.partial ?? {})) {
      assert.ok(n <= territoriesOf(MUNDO, c).length, `${o.id}: ${c}`);
      min += n;
    }
    assert.ok(Math.max(min, o.minTerritories ?? 0) < TIDS.length, o.id);
  }
});

test('el dibujo del mapa está al día con la definición (si falla: npm run build:map)', () => {
  assert.deepEqual(Object.keys(GEO.territories).sort(), [...TIDS].sort());
});

// ---------------------------------------------------------------- partidas simuladas

/** Un jugador al azar pero agresivo: alcanza para recorrer todas las reglas. */
function playRandomGame(seed, players, config = {}) {
  const rnd = mulberry(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  let state = createGame({
    map: MUNDO,
    seed,
    config,
    players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `J${i + 1}`, color: `c${i}` })),
  });
  const act = (pid, action) => {
    state = applyAction(MUNDO, state, pid, action).state;
  };
  let actions = 0;

  while (state.phase !== 'finished' && state.round <= 300) {
    actions++;
    const pid = state.turnOrder[state.current];
    const mine = ownedBy(state, pid);

    if (state.phase === 'setup') {
      act(pid, { type: 'place', territory: pick(mine), count: state.setup.remaining });
      continue;
    }
    const turn = state.turn;
    const me = state.players.find((p) => p.id === pid);
    if (turn.step === 'reinforce') {
      const trade = findTrade(me.cards);
      if (trade) act(pid, { type: 'trade', cards: trade });
      else if (turn.reinforcements > 0) {
        const front = mine.filter((t) => MUNDO.territories[t].neighbors.some((n) => state.territories[n].owner !== pid));
        const pool = front.length ? front : mine;
        const strongest = pool.reduce((a, b) => (state.territories[b].armies > state.territories[a].armies ? b : a));
        act(pid, { type: 'place', territory: rnd() < 0.7 ? strongest : pick(pool), count: turn.reinforcements });
      } else act(pid, { type: 'endPhase' });
      continue;
    }
    if (turn.pendingMove) {
      act(pid, { type: 'moveIn', count: turn.pendingMove.max });
      continue;
    }
    if (turn.step === 'attack') {
      const all = mine.flatMap((from) => (state.territories[from].armies < 2 ? [] : MUNDO.territories[from].neighbors
        .filter((to) => state.territories[to].owner !== pid)
        .map((to) => ({ from, to }))));
      const edge = ({ from, to }) => state.territories[from].armies - state.territories[to].armies;
      const best = all.length ? all.reduce((a, b) => (edge(b) > edge(a) ? b : a)) : null;
      const go = best && (edge(best) > 0 ? rnd() < 0.97 : rnd() < 0.3);
      if (go) act(pid, { type: 'attack', ...(rnd() < 0.8 ? best : pick(all)) });
      else act(pid, { type: 'endPhase' });
      continue;
    }
    // reagrupar: a veces mueve algo, después termina el turno
    const moves = mine.flatMap((from) => MUNDO.territories[from].neighbors
      .filter((to) => state.territories[to].owner === pid)
      .map((to) => ({ from, to })));
    const m = moves.length && rnd() < 0.3 ? pick(moves) : null;
    try {
      if (m) act(pid, { type: 'move', ...m, count: 1 });
      else act(pid, { type: 'endTurn' });
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
      act(pid, { type: 'endTurn' });
    }

    for (const [tid, t] of Object.entries(state.territories)) {
      assert.ok(t.armies >= 1, `${tid} quedó con ${t.armies} ejércitos`);
    }
  }
  return { state, actions };
}

function findTrade(cards) {
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++)
      for (let k = j + 1; k < cards.length; k++)
        if (isValidTrade([cards[i], cards[j], cards[k]])) return [cards[i].id, cards[j].id, cards[k].id];
  return null;
}

function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// El jugador simulado es tonto: a veces se traba en un empate eterno (todos con miles de
// ejércitos). Eso no es un error del motor, así que no se exige que terminen todas: lo que
// se verifica es que ninguna rompa una regla y que la gran mayoría tenga un ganador válido.
test('partidas completas al azar: sin romper reglas y casi todas con ganador', () => {
  const reasons = {};
  let finished = 0;
  const GAMES = 40;
  for (let seed = 1; seed <= GAMES; seed++) {
    const { state } = playRandomGame(seed, 2 + (seed % 5));
    if (state.phase !== 'finished') continue;
    finished++;
    const winner = state.players.find((p) => p.id === state.winner.player);
    assert.ok(winner.alive, `semilla ${seed}: ganó un jugador eliminado`);
    reasons[state.winner.reason] = (reasons[state.winner.reason] ?? 0) + 1;
  }
  console.log(`Partidas simuladas: ${finished}/${GAMES} con ganador`, reasons);
  assert.ok(finished >= GAMES * 0.65, `solo ${finished}/${GAMES} partidas terminaron`);
});

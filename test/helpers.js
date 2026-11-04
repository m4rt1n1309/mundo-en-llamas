import { createGame, startTurn } from '../src/engine/index.js';

// Mapa de prueba:  a - b - c - d - e - f   (además a-c y d-f)
//                  [  norte  ] [   sur   ]
export const MAP = {
  id: 'test',
  name: 'Mapa de prueba',
  continents: {
    norte: { name: 'Norte', bonus: 2 },
    sur: { name: 'Sur', bonus: 3 },
  },
  territories: {
    a: { name: 'A', continent: 'norte', neighbors: ['b', 'c'] },
    b: { name: 'B', continent: 'norte', neighbors: ['a', 'c'] },
    c: { name: 'C', continent: 'norte', neighbors: ['a', 'b', 'd'] },
    d: { name: 'D', continent: 'sur', neighbors: ['c', 'e', 'f'] },
    e: { name: 'E', continent: 'sur', neighbors: ['d', 'f'] },
    f: { name: 'F', continent: 'sur', neighbors: ['d', 'e'] },
  },
  objectives: [
    { id: 'o-norte', continents: ['norte'], minTerritories: 4 },
    { id: 'o-sur', continents: ['sur'], minTerritories: 4 },
  ],
};

const PLAYERS = [
  { id: 'p1', name: 'Ana', color: 'rojo' },
  { id: 'p2', name: 'Beto', color: 'azul' },
  { id: 'p3', name: 'Caro', color: 'verde' },
];

export function makeGame({ players = 2, seed = 42, config } = {}) {
  return createGame({ map: MAP, players: PLAYERS.slice(0, players), seed, config });
}

/**
 * Deja la partida en juego con el reparto indicado: { a: ['p1', 3], ... }.
 * Todos quedan con el objetivo común (que por defecto es imposible: 99) salvo que se pida otro.
 */
export function arrange(state, ownership, currentId, { step = 'attack', common = 99 } = {}) {
  for (const [tid, [owner, armies]] of Object.entries(ownership)) state.territories[tid] = { owner, armies };
  state.config.commonTerritories = common;
  state.phase = 'playing';
  state.setup = null;
  for (const p of state.players) {
    p.alive = Object.values(state.territories).some((t) => t.owner === p.id);
    p.objective = { type: 'common', id: 'common' };
  }
  state.current = state.turnOrder.indexOf(currentId);
  startTurn(MAP, state);
  state.turn.step = step;
  if (step !== 'reinforce') state.turn.reinforcements = 0;
  return state;
}

/** rollDice que devuelve las tiradas indicadas en orden: atacante, defensor, atacante... */
export function scriptedDice(...rolls) {
  let i = 0;
  return (n) => {
    const r = rolls[i++];
    if (!r || r.length !== n) throw new Error(`Se esperaban ${n} dados y el guion tenía ${JSON.stringify(r)}`);
    return r;
  };
}

export const card = (id, symbol, territory = null) => ({ id, symbol, territory });

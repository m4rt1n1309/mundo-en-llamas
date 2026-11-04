import { GameError } from './errors.js';
import { rngFrom } from './rng.js';
import { attackerDiceCount, defenderDiceCount, resolveCombat } from './combat.js';
import { buildDeck, isValidTrade, tradeValue } from './cards.js';
import { dealObjectives, meetsObjective, reassignDestroyObjectives } from './objectives.js';
import { validateMap, territoriesOf, areAdjacent } from './map-utils.js';

export const DEFAULT_CONFIG = Object.freeze({
  minReinforcements: 3, // mínimo de ejércitos por turno
  setupArmies: [5, 3], // rondas de colocación inicial
  tradeValues: [4, 6, 9, 12, 15], // ejércitos por canje (por jugador)
  tradeIncrement: 5, // después del último valor, +5 por canje
  tradeTerritoryBonus: 2, // extra si una tarjeta canjeada es de un territorio tuyo
  forcedTradeAt: 5, // con esta cantidad de tarjetas hay que canjear
  commonObjectiveRatio: 0.6, // objetivo común: este % del mapa...
  commonTerritories: null, // ...o una cantidad fija
  maxConquestMove: 3, // máximo de ejércitos a pasar al conquistar
  wildCards: 2,
  destroyObjectives: true,
});

/**
 * Crea una partida. El estado es un objeto JSON plano: se puede guardar y mandar por red.
 * players: [{ id, name, color, bot? }]
 */
export function createGame({ map, players, seed = Date.now(), config = {} }) {
  validateMap(map);
  if (!Array.isArray(players) || players.length < 2 || players.length > 6) {
    throw new GameError('Se necesitan entre 2 y 6 jugadores.');
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) {
    throw new GameError('Hay jugadores repetidos.');
  }
  const cfg = structuredClone({ ...DEFAULT_CONFIG, ...config });
  const tids = Object.keys(map.territories);
  if (cfg.commonTerritories == null) cfg.commonTerritories = Math.ceil(tids.length * cfg.commonObjectiveRatio);

  const state = {
    version: 1,
    mapId: map.id,
    config: cfg,
    rng: seed >>> 0,
    phase: 'setup', // 'setup' | 'playing' | 'finished'
    round: 1,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      bot: !!p.bot,
      alive: true,
      cards: [],
      trades: 0,
      objective: null,
      eliminatedBy: null,
    })),
    turnOrder: [],
    current: 0,
    territories: {},
    deck: [],
    discard: [],
    setup: null,
    turn: null,
    winner: null,
  };
  const rng = rngFrom(state);
  state.turnOrder = rng.shuffle(state.players.map((p) => p.id));
  rng.shuffle([...tids]).forEach((tid, i) => {
    state.territories[tid] = { owner: state.turnOrder[i % state.turnOrder.length], armies: 1 };
  });
  state.deck = rng.shuffle(buildDeck(map, cfg));
  dealObjectives(map, state, rng);

  if (cfg.setupArmies.length) state.setup = { round: 0, remaining: cfg.setupArmies[0] };
  else beginPlaying(map, state, []);
  return state;
}

/**
 * Aplica una acción y devuelve { state, events } sin modificar el estado recibido.
 * Si la acción no es válida lanza GameError.
 *
 * Acciones:
 *  setup:      { type: 'place', territory, count }
 *  incorporar: { type: 'trade', cards: [id, id, id] }, { type: 'place', territory, count }
 *  atacar:     { type: 'attack', from, to, dice? }, { type: 'moveIn', count }
 *  reagrupar:  { type: 'move', from, to, count }
 *  siempre:    { type: 'endPhase' }, { type: 'endTurn' }
 *
 * options.rollDice(n) permite inyectar dados (tests).
 */
export function applyAction(map, prevState, playerId, action, options = {}) {
  if (prevState.phase === 'finished') throw new GameError('La partida terminó.');
  if (!action || typeof action.type !== 'string') throw new GameError('Acción inválida.');
  if (currentPlayerId(prevState) !== playerId) throw new GameError('No es tu turno.');

  const state = structuredClone(prevState);
  const events = [];
  const rng = rngFrom(state);
  const roll = options.rollDice ?? ((n) => Array.from({ length: n }, () => rng.die()));
  const ctx = { map, state, events, rng, roll };

  if (state.phase === 'setup') handleSetup(ctx, playerId, action);
  else handleTurn(ctx, playerId, action);
  return { state, events };
}

export function currentPlayerId(state) {
  return state.turnOrder[state.current];
}

export function ownedBy(state, pid) {
  return Object.keys(state.territories).filter((tid) => state.territories[tid].owner === pid);
}

/** Mitad de los territorios (mínimo 3) más el bonus de cada continente completo. */
export function reinforcementsFor(map, state, pid) {
  let n = Math.max(state.config.minReinforcements, Math.floor(ownedBy(state, pid).length / 2));
  for (const [cid, c] of Object.entries(map.continents)) {
    if (territoriesOf(map, cid).every((tid) => state.territories[tid].owner === pid)) n += c.bonus;
  }
  return n;
}

export function startTurn(map, state) {
  const pid = currentPlayerId(state);
  state.turn = {
    player: pid,
    step: 'reinforce', // 'reinforce' | 'attack' | 'regroup'
    reinforcements: reinforcementsFor(map, state, pid),
    conquests: 0,
    pendingMove: null,
    regroupLocked: {},
  };
}

// ---------------------------------------------------------------- setup

function handleSetup({ map, state, events }, pid, action) {
  if (action.type !== 'place') throw new GameError('Ahora solo podés ubicar tus ejércitos iniciales.');
  const t = ownTerritory(state, pid, action.territory);
  const count = parseCount(action.count, state.setup.remaining, `Te quedan ${state.setup.remaining} ejércitos para ubicar.`);
  t.armies += count;
  state.setup.remaining -= count;
  events.push({ type: 'placed', player: pid, territory: action.territory, count });
  if (state.setup.remaining > 0) return;

  state.current++;
  if (state.current >= state.turnOrder.length) {
    state.current = 0;
    state.setup.round++;
  }
  if (state.setup.round >= state.config.setupArmies.length) beginPlaying(map, state, events);
  else state.setup.remaining = state.config.setupArmies[state.setup.round];
}

function beginPlaying(map, state, events) {
  state.phase = 'playing';
  state.setup = null;
  state.current = 0;
  startTurn(map, state);
  events.push({ type: 'turnStarted', player: state.turn.player, reinforcements: state.turn.reinforcements });
}

// ---------------------------------------------------------------- turno

function handleTurn(ctx, pid, action) {
  if (ctx.state.turn.pendingMove && action.type !== 'moveIn') {
    throw new GameError('Primero decidí cuántos ejércitos pasás al territorio conquistado.');
  }
  switch (action.type) {
    case 'trade': return doTrade(ctx, pid, action);
    case 'place': return doPlace(ctx, pid, action);
    case 'attack': return doAttack(ctx, pid, action);
    case 'moveIn': return doMoveIn(ctx, pid, action);
    case 'move': return doRegroup(ctx, pid, action);
    case 'endPhase': return doEndPhase(ctx, pid);
    case 'endTurn': return doEndTurn(ctx, pid);
    default: throw new GameError(`Acción desconocida: ${action.type}`);
  }
}

function doTrade({ state, events }, pid, action) {
  const { turn, config } = state;
  if (turn.step !== 'reinforce') throw new GameError('Solo podés canjear tarjetas al incorporar ejércitos.');
  const ids = action.cards;
  if (!Array.isArray(ids) || ids.length !== 3 || new Set(ids).size !== 3) {
    throw new GameError('Elegí tres tarjetas distintas.');
  }
  const p = getPlayer(state, pid);
  const cards = ids.map((id) => p.cards.find((c) => c.id === id));
  if (cards.some((c) => !c)) throw new GameError('No tenés esas tarjetas.');
  if (!isValidTrade(cards)) {
    throw new GameError('Tienen que ser tres tarjetas del mismo símbolo o de tres símbolos distintos (el comodín vale por cualquiera).');
  }
  const armies = tradeValue(config, p.trades);
  p.trades++;
  turn.reinforcements += armies;
  p.cards = p.cards.filter((c) => !ids.includes(c.id));
  state.discard.push(...cards);

  const bonusCard = config.tradeTerritoryBonus > 0
    ? cards.find((c) => c.territory && state.territories[c.territory].owner === pid)
    : null;
  if (bonusCard) state.territories[bonusCard.territory].armies += config.tradeTerritoryBonus;
  events.push({
    type: 'traded',
    player: pid,
    armies,
    bonusTerritory: bonusCard?.territory ?? null,
    bonusArmies: bonusCard ? config.tradeTerritoryBonus : 0,
  });
}

function doPlace({ state, events }, pid, action) {
  const { turn, config } = state;
  if (turn.step !== 'reinforce') throw new GameError('Ya pasó la etapa de incorporar ejércitos.');
  const p = getPlayer(state, pid);
  if (p.cards.length >= config.forcedTradeAt) {
    throw new GameError(`Tenés ${p.cards.length} tarjetas: tenés que canjear antes de incorporar.`);
  }
  const t = ownTerritory(state, pid, action.territory);
  const count = parseCount(action.count, turn.reinforcements, `Te quedan ${turn.reinforcements} ejércitos para incorporar.`);
  t.armies += count;
  turn.reinforcements -= count;
  events.push({ type: 'placed', player: pid, territory: action.territory, count });
}

function doAttack(ctx, pid, action) {
  const { map, state, events, roll } = ctx;
  const { turn } = state;
  if (turn.step === 'reinforce') throw new GameError('Terminá de incorporar antes de atacar.');
  if (turn.step !== 'attack') throw new GameError('Ya no podés atacar en este turno.');
  const from = ownTerritory(state, pid, action.from);
  const to = getTerritory(state, action.to);
  if (to.owner === pid) throw new GameError('No podés atacar un territorio propio.');
  if (!areAdjacent(map, action.from, action.to)) throw new GameError('Esos territorios no son limítrofes.');
  if (from.armies < 2) throw new GameError('Necesitás al menos 2 ejércitos para atacar desde ahí.');

  const maxDice = attackerDiceCount(from.armies);
  const dice = action.dice ?? maxDice;
  if (!Number.isInteger(dice) || dice < 1 || dice > maxDice) {
    throw new GameError(`Podés tirar entre 1 y ${maxDice} dados.`);
  }
  const defender = to.owner;
  const result = resolveCombat(roll(dice), roll(defenderDiceCount(to.armies)));
  from.armies -= result.attackerLosses;
  to.armies -= result.defenderLosses;
  const conquered = to.armies === 0;
  events.push({
    type: 'attack',
    player: pid,
    defender,
    from: action.from,
    to: action.to,
    attackDice: result.attack,
    defendDice: result.defend,
    attackerLosses: result.attackerLosses,
    defenderLosses: result.defenderLosses,
    conquered,
  });
  if (conquered) conquer(ctx, pid, defender, action.from, action.to);
}

function conquer(ctx, pid, defenderId, fromId, toId) {
  const { state, events } = ctx;
  const from = state.territories[fromId];
  const to = state.territories[toId];
  to.owner = pid;
  state.turn.conquests++;

  if (ownedBy(state, defenderId).length === 0) {
    const victim = getPlayer(state, defenderId);
    victim.alive = false;
    victim.eliminatedBy = pid;
    getPlayer(state, pid).cards.push(...victim.cards);
    victim.cards = [];
    events.push({ type: 'eliminated', player: defenderId, by: pid });
    reassignDestroyObjectives(state, defenderId, pid, events);
  }

  // Si ganó con todos los pares, el origen tiene al menos 2 ejércitos.
  const max = Math.min(state.config.maxConquestMove, from.armies - 1);
  if (max <= 1) moveArmies(state, events, fromId, toId, 1);
  else state.turn.pendingMove = { from: fromId, to: toId, min: 1, max };

  checkVictory(ctx, pid);
}

function doMoveIn({ state, events }, pid, action) {
  const pm = state.turn.pendingMove;
  if (!pm) throw new GameError('No hay ningún territorio recién conquistado.');
  const count = action.count;
  if (!Number.isInteger(count) || count < pm.min || count > pm.max) {
    throw new GameError(`Tenés que pasar entre ${pm.min} y ${pm.max} ejércitos.`);
  }
  moveArmies(state, events, pm.from, pm.to, count);
}

function moveArmies(state, events, fromId, toId, count) {
  state.territories[fromId].armies -= count;
  state.territories[toId].armies += count;
  state.turn.pendingMove = null;
  events.push({ type: 'movedIn', player: state.turn.player, from: fromId, to: toId, count });
}

function doRegroup({ map, state, events }, pid, action) {
  const { turn } = state;
  if (turn.step === 'reinforce') throw new GameError('Terminá de incorporar antes de reagrupar.');
  const from = ownTerritory(state, pid, action.from, 'Solo podés reagrupar entre territorios propios.');
  const to = ownTerritory(state, pid, action.to, 'Solo podés reagrupar entre territorios propios.');
  if (!areAdjacent(map, action.from, action.to)) throw new GameError('Esos territorios no son limítrofes.');
  const available = from.armies - 1 - (turn.regroupLocked[action.from] ?? 0);
  if (available < 1) {
    throw new GameError('No quedan ejércitos para mover desde ahí (los que llegaron reagrupando no se vuelven a mover).');
  }
  const count = parseCount(action.count, available, `Podés mover hasta ${available} ejércitos desde ahí.`);

  if (turn.step === 'attack') {
    turn.step = 'regroup';
    events.push({ type: 'step', player: pid, step: 'regroup' });
  }
  from.armies -= count;
  to.armies += count;
  turn.regroupLocked[action.to] = (turn.regroupLocked[action.to] ?? 0) + count;
  events.push({ type: 'moved', player: pid, from: action.from, to: action.to, count });
}

function doEndPhase(ctx, pid) {
  const { state, events } = ctx;
  const { turn } = state;
  if (turn.step === 'reinforce') {
    if (turn.reinforcements > 0) {
      throw new GameError(`Todavía te quedan ${turn.reinforcements} ejércitos para incorporar.`);
    }
    if (getPlayer(state, pid).cards.length >= state.config.forcedTradeAt) {
      throw new GameError('Tenés demasiadas tarjetas: tenés que canjear.');
    }
    turn.step = 'attack';
    events.push({ type: 'step', player: pid, step: 'attack' });
  } else if (turn.step === 'attack') {
    turn.step = 'regroup';
    events.push({ type: 'step', player: pid, step: 'regroup' });
  } else {
    finishTurn(ctx, pid);
  }
}

function doEndTurn(ctx, pid) {
  if (ctx.state.turn.step === 'reinforce') throw new GameError('Terminá de incorporar primero.');
  finishTurn(ctx, pid);
}

function finishTurn({ map, state, events, rng }, pid) {
  if (state.turn.conquests > 0) {
    if (!state.deck.length && state.discard.length) {
      state.deck = rng.shuffle(state.discard);
      state.discard = [];
    }
    const card = state.deck.pop();
    if (card) {
      getPlayer(state, pid).cards.push(card);
      events.push({ type: 'cardDrawn', player: pid, card });
    }
  }
  events.push({ type: 'turnEnded', player: pid });

  const n = state.turnOrder.length;
  for (let i = 1; i <= n; i++) {
    const idx = (state.current + i) % n;
    if (getPlayer(state, state.turnOrder[idx]).alive) {
      if (idx <= state.current) state.round++;
      state.current = idx;
      break;
    }
  }
  startTurn(map, state);
  events.push({ type: 'turnStarted', player: state.turn.player, reinforcements: state.turn.reinforcements });
}

function checkVictory({ map, state, events }, pid) {
  const p = getPlayer(state, pid);
  let reason = null;
  if (state.players.filter((q) => q.alive).length === 1) reason = 'lastStanding';
  else if (meetsObjective(map, state, pid, p.objective)) reason = 'objective';
  else if (ownedBy(state, pid).length >= state.config.commonTerritories) reason = 'common';
  if (!reason) return;

  const pm = state.turn.pendingMove;
  if (pm) moveArmies(state, events, pm.from, pm.to, pm.min);
  state.phase = 'finished';
  state.winner = { player: pid, reason };
  events.push({ type: 'victory', player: pid, reason });
}

// ---------------------------------------------------------------- helpers

function getPlayer(state, pid) {
  return state.players.find((p) => p.id === pid);
}

function getTerritory(state, tid) {
  const t = state.territories[tid];
  if (!t) throw new GameError('Ese territorio no existe.');
  return t;
}

function ownTerritory(state, pid, tid, message = 'Ese territorio no es tuyo.') {
  const t = getTerritory(state, tid);
  if (t.owner !== pid) throw new GameError(message);
  return t;
}

function parseCount(count, max, tooManyMessage) {
  const n = count ?? 1;
  if (!Number.isInteger(n) || n < 1) throw new GameError('La cantidad tiene que ser un número entero mayor que cero.');
  if (n > max) throw new GameError(tooManyMessage);
  return n;
}

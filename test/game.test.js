import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, reinforcementsFor, viewFor, eventsFor, describeObjective, GameError } from '../src/engine/index.js';
import { MAP, makeGame, arrange, scriptedDice, card } from './helpers.js';

const act = (s, pid, action, rollDice) => applyAction(MAP, s, pid, action, { rollDice });
const throwsGame = (fn, re) => assert.throws(fn, (e) => e instanceof GameError && re.test(e.message));

// ------------------------------------------------------------ creación y setup

test('reparte todos los territorios con 1 ejército, objetivos y mazo', () => {
  const s = makeGame({ players: 3 });
  const ts = Object.values(s.territories);
  assert.equal(ts.length, 6);
  assert.ok(ts.every((t) => t.armies === 1));
  for (const p of s.players) {
    assert.equal(ts.filter((t) => t.owner === p.id).length, 2);
    assert.ok(p.objective);
  }
  assert.equal(s.deck.length, 6 + 2);
  assert.equal(s.phase, 'setup');
});

test('misma semilla, misma partida', () => {
  assert.deepEqual(makeGame({ seed: 7 }), makeGame({ seed: 7 }));
  assert.notDeepEqual(makeGame({ seed: 7 }).territories, makeGame({ seed: 8 }).territories);
});

test('setup: rondas de 5 y 3 ejércitos y después empieza el primer turno', () => {
  let s = makeGame();
  const order = s.turnOrder;
  for (const amount of [5, 3]) {
    for (const pid of order) {
      const tid = Object.keys(s.territories).find((t) => s.territories[t].owner === pid);
      throwsGame(() => act(s, pid, { type: 'place', territory: tid, count: amount + 1 }), /quedan/);
      s = act(s, pid, { type: 'place', territory: tid, count: amount }).state;
    }
  }
  assert.equal(s.phase, 'playing');
  assert.equal(s.turn.player, order[0]);
  assert.equal(s.turn.step, 'reinforce');
  assert.equal(Object.values(s.territories).reduce((n, t) => n + t.armies, 0), 6 + 2 * 8);
});

test('setup: no se juega fuera de turno ni en territorio ajeno', () => {
  const s = makeGame();
  const [first, second] = s.turnOrder;
  const ajeno = Object.keys(s.territories).find((t) => s.territories[t].owner === second);
  throwsGame(() => act(s, second, { type: 'place', territory: ajeno, count: 1 }), /No es tu turno/);
  throwsGame(() => act(s, first, { type: 'place', territory: ajeno, count: 1 }), /no es tuyo/);
});

test('applyAction no modifica el estado original', () => {
  const s = makeGame();
  const before = structuredClone(s);
  const pid = s.turnOrder[0];
  const tid = Object.keys(s.territories).find((t) => s.territories[t].owner === pid);
  act(s, pid, { type: 'place', territory: tid, count: 2 });
  assert.deepEqual(s, before);
});

// ------------------------------------------------------------ incorporación

test('incorporación: mitad de los territorios, mínimo 3, más continentes completos', () => {
  const s = arrange(makeGame(), {
    a: ['p1', 1], b: ['p1', 1], c: ['p1', 1], d: ['p1', 1], e: ['p2', 1], f: ['p2', 1],
  }, 'p1', { step: 'reinforce' });
  assert.equal(reinforcementsFor(MAP, s, 'p1'), 3 + 2); // max(3, 4/2) + norte
  assert.equal(reinforcementsFor(MAP, s, 'p2'), 3);
  assert.equal(s.turn.reinforcements, 5);
});

test('incorporación: hay que poner todo antes de atacar', () => {
  let s = arrange(makeGame(), {
    a: ['p1', 1], b: ['p1', 1], c: ['p1', 1], d: ['p2', 1], e: ['p2', 1], f: ['p2', 1],
  }, 'p1', { step: 'reinforce' });
  throwsGame(() => act(s, 'p1', { type: 'endPhase' }), /quedan 5/);
  throwsGame(() => act(s, 'p1', { type: 'attack', from: 'c', to: 'd' }), /incorporar/);
  s = act(s, 'p1', { type: 'place', territory: 'c', count: 5 }).state;
  s = act(s, 'p1', { type: 'endPhase' }).state;
  assert.equal(s.turn.step, 'attack');
  assert.equal(s.territories.c.armies, 6);
});

// ------------------------------------------------------------ ataque

const BASE = { a: ['p1', 1], b: ['p1', 1], c: ['p1', 4], d: ['p2', 2], e: ['p2', 1], f: ['p2', 1] };

test('ataque: la cantidad de dados depende de los ejércitos', () => {
  for (const [armies, expected] of [[2, 1], [3, 2], [4, 3], [9, 3]]) {
    const s = arrange(makeGame(), { ...BASE, c: ['p1', armies], d: ['p2', 5] }, 'p1');
    const rolled = [];
    act(s, 'p1', { type: 'attack', from: 'c', to: 'd' }, (n) => (rolled.push(n), Array(n).fill(1)));
    assert.deepEqual(rolled, [expected, 3], `con ${armies} ejércitos`);
  }
});

test('ataque: se puede elegir tirar menos dados, pero no más', () => {
  const s = arrange(makeGame(), BASE, 'p1');
  const { events } = act(s, 'p1', { type: 'attack', from: 'c', to: 'd', dice: 1 }, scriptedDice([1], [1, 1]));
  assert.equal(events[0].attackDice.length, 1);
  throwsGame(() => act(s, 'p1', { type: 'attack', from: 'c', to: 'd', dice: 4 }), /entre 1 y 3/);
});

test('ataque: empates a favor del defensor', () => {
  const s = arrange(makeGame(), BASE, 'p1');
  const { state, events } = act(s, 'p1', { type: 'attack', from: 'c', to: 'd' }, scriptedDice([6, 3, 1], [6, 3]));
  assert.equal(events[0].attackerLosses, 2);
  assert.equal(events[0].defenderLosses, 0);
  assert.equal(state.territories.c.armies, 2);
  assert.equal(state.territories.d.armies, 2);
});

test('ataque: validaciones', () => {
  const s = arrange(makeGame(), { ...BASE, a: ['p1', 5] }, 'p1');
  throwsGame(() => act(s, 'p1', { type: 'attack', from: 'a', to: 'e' }), /limítrofes/);
  throwsGame(() => act(s, 'p1', { type: 'attack', from: 'c', to: 'b' }), /propio/);
  throwsGame(() => act(s, 'p1', { type: 'attack', from: 'd', to: 'e' }), /no es tuyo/);
  throwsGame(() => act(s, 'p2', { type: 'attack', from: 'd', to: 'c' }), /No es tu turno/);
  const s2 = arrange(makeGame(), { ...BASE, c: ['p1', 1] }, 'p1');
  throwsGame(() => act(s2, 'p1', { type: 'attack', from: 'c', to: 'd' }), /al menos 2/);
});

test('conquista: se eligen entre 1 y 3 ejércitos para pasar', () => {
  const s0 = arrange(makeGame(), { ...BASE, c: ['p1', 5], d: ['p2', 1] }, 'p1');
  const { state: s, events } = act(s0, 'p1', { type: 'attack', from: 'c', to: 'd' }, scriptedDice([6, 6, 6], [1]));
  assert.ok(events[0].conquered);
  assert.equal(s.territories.d.owner, 'p1');
  assert.deepEqual(s.turn.pendingMove, { from: 'c', to: 'd', min: 1, max: 3 });
  throwsGame(() => act(s, 'p1', { type: 'endTurn' }), /Primero decidí/);
  throwsGame(() => act(s, 'p1', { type: 'moveIn', count: 4 }), /entre 1 y 3/);
  const s2 = act(s, 'p1', { type: 'moveIn', count: 3 }).state;
  assert.equal(s2.territories.c.armies, 2);
  assert.equal(s2.territories.d.armies, 3);
  assert.equal(s2.turn.pendingMove, null);
  assert.equal(s2.turn.conquests, 1);
});

test('conquista: con solo 2 ejércitos pasa 1 automáticamente', () => {
  const s0 = arrange(makeGame(), { ...BASE, c: ['p1', 2], d: ['p2', 1] }, 'p1');
  const { state } = act(s0, 'p1', { type: 'attack', from: 'c', to: 'd' }, scriptedDice([6], [1]));
  assert.equal(state.turn.pendingMove, null);
  assert.equal(state.territories.c.armies, 1);
  assert.equal(state.territories.d.armies, 1);
});

// ------------------------------------------------------------ eliminación y victoria

const TRES = { a: ['p1', 1], b: ['p1', 1], c: ['p1', 4], d: ['p2', 1], e: ['p3', 1], f: ['p3', 1] };

test('eliminar a un jugador: te quedás con sus tarjetas; si era tu objetivo, ganás', () => {
  const s0 = arrange(makeGame({ players: 3 }), TRES, 'p1');
  s0.players[0].objective = { type: 'destroy', id: 'x', target: 'p2' };
  s0.players[1].cards = [card('k1', 'tanque', 'a'), card('k2', 'barco', 'e')];
  const { state, events } = act(s0, 'p1', { type: 'attack', from: 'c', to: 'd' }, scriptedDice([6, 6, 6], [1]));
  assert.ok(events.some((e) => e.type === 'eliminated' && e.player === 'p2' && e.by === 'p1'));
  assert.equal(state.players[0].cards.length, 2);
  assert.equal(state.players[1].alive, false);
  assert.equal(state.phase, 'finished');
  assert.deepEqual(state.winner, { player: 'p1', reason: 'objective' });
  throwsGame(() => act(state, 'p1', { type: 'endTurn' }), /terminó/);
});

test('si otro destruye a tu objetivo, pasás a tener que destruir al siguiente', () => {
  const s0 = arrange(makeGame({ players: 3 }), TRES, 'p1');
  s0.players[2].objective = { type: 'destroy', id: 'x', target: 'p2' };
  const { state } = act(s0, 'p1', { type: 'attack', from: 'c', to: 'd' }, scriptedDice([6, 6, 6], [1]));
  assert.equal(state.phase, 'playing');
  assert.equal(state.players[2].objective.target, 'p1');
});

test('objetivo común: ganar al llegar a la cantidad de territorios', () => {
  const s0 = arrange(makeGame(), { ...BASE, d: ['p2', 1] }, 'p1', { common: 4 });
  const { state } = act(s0, 'p1', { type: 'attack', from: 'c', to: 'd' }, scriptedDice([6, 6, 6], [1]));
  assert.deepEqual(state.winner, { player: 'p1', reason: 'common' });
});

test('objetivo secreto de conquista', () => {
  const s0 = arrange(makeGame(), { ...BASE, d: ['p2', 1] }, 'p1');
  s0.players[0].objective = { type: 'conquest', id: 'o', continents: ['norte'], partial: {}, minTerritories: 4 };
  assert.equal(describeObjective(MAP, s0, s0.players[0].objective), 'Conquistar Norte y controlar al menos 4 territorios en total.');
  const { state } = act(s0, 'p1', { type: 'attack', from: 'c', to: 'd' }, scriptedDice([6, 6, 6], [1]));
  assert.deepEqual(state.winner, { player: 'p1', reason: 'objective' });
});

// ------------------------------------------------------------ reagrupar y fin de turno

test('reagrupar: solo entre propios limítrofes y lo que llega no se vuelve a mover', () => {
  let s = arrange(makeGame(), { ...BASE, a: ['p1', 3] }, 'p1');
  throwsGame(() => act(s, 'p1', { type: 'move', from: 'c', to: 'd', count: 1 }), /propios/);
  s = act(s, 'p1', { type: 'move', from: 'a', to: 'b', count: 2 }).state;
  assert.equal(s.turn.step, 'regroup');
  assert.equal(s.territories.b.armies, 3);
  throwsGame(() => act(s, 'p1', { type: 'move', from: 'b', to: 'c', count: 1 }), /no se vuelven a mover/);
  throwsGame(() => act(s, 'p1', { type: 'attack', from: 'c', to: 'd' }), /Ya no podés atacar/);
});

test('fin de turno: tarjeta solo si conquistaste, y pasa al siguiente', () => {
  const s0 = arrange(makeGame(), { ...BASE, d: ['p2', 1] }, 'p1');
  const sinConquista = act(s0, 'p1', { type: 'endTurn' }).state;
  assert.equal(sinConquista.players[0].cards.length, 0);
  assert.equal(sinConquista.turn.player, 'p2');
  assert.equal(sinConquista.turn.step, 'reinforce');

  let s = act(s0, 'p1', { type: 'attack', from: 'c', to: 'd' }, scriptedDice([6, 6, 6], [1])).state;
  s = act(s, 'p1', { type: 'moveIn', count: 1 }).state;
  const { state, events } = act(s, 'p1', { type: 'endTurn' });
  assert.equal(state.players[0].cards.length, 1);
  assert.ok(events.some((e) => e.type === 'cardDrawn' && e.card));
  assert.equal(eventsFor(events, 'p2').find((e) => e.type === 'cardDrawn').card, null);
});

test('el turno salta a los jugadores eliminados', () => {
  const s0 = arrange(makeGame({ players: 3 }), TRES, 'p1');
  const { state } = act(s0, 'p1', { type: 'attack', from: 'c', to: 'd' }, scriptedDice([6, 6, 6], [1]));
  const s = act(act(state, 'p1', { type: 'moveIn', count: 1 }).state, 'p1', { type: 'endTurn' }).state;
  assert.notEqual(s.turn.player, 'p2');
});

// ------------------------------------------------------------ tarjetas

test('canje: suma ejércitos crecientes y +2 en un territorio propio de las tarjetas', () => {
  let s = arrange(makeGame(), BASE, 'p1', { step: 'reinforce' });
  s.players[0].cards = [
    card('t1', 'tanque', 'a'), card('t2', 'tanque', 'e'), card('t3', 'tanque', 'f'),
    card('t4', 'avion'), card('t5', 'barco'), card('t6', 'comodin'),
  ];
  const start = s.turn.reinforcements;
  throwsGame(() => act(s, 'p1', { type: 'place', territory: 'a', count: 1 }), /canjear/);
  s = act(s, 'p1', { type: 'trade', cards: ['t1', 't2', 't3'] }).state;
  assert.equal(s.turn.reinforcements, start + 4);
  assert.equal(s.territories.a.armies, 1 + 2);
  s = act(s, 'p1', { type: 'trade', cards: ['t4', 't5', 't6'] }).state;
  assert.equal(s.turn.reinforcements, start + 4 + 6);
  assert.equal(s.players[0].cards.length, 0);
  assert.equal(s.discard.length, 6);
});

test('canje inválido', () => {
  const s = arrange(makeGame(), BASE, 'p1', { step: 'reinforce' });
  s.players[0].cards = [card('t1', 'tanque'), card('t2', 'tanque'), card('t3', 'barco')];
  throwsGame(() => act(s, 'p1', { type: 'trade', cards: ['t1', 't2', 't3'] }), /mismo símbolo/);
  throwsGame(() => act(s, 'p1', { type: 'trade', cards: ['t1', 't2', 'zz'] }), /No tenés/);
});

// ------------------------------------------------------------ vista

test('cada jugador ve solo sus tarjetas y su objetivo', () => {
  const s = makeGame();
  s.players[1].cards = [card('t1', 'tanque')];
  const v = viewFor(s, 'p1');
  assert.equal(v.rng, undefined);
  assert.equal(v.deck, undefined);
  assert.equal(v.deckCount, 8);
  assert.ok(v.players[0].objective);
  assert.equal(v.players[1].objective, null);
  assert.equal(v.players[1].cards, null);
  assert.equal(v.players[1].cardCount, 1);
});

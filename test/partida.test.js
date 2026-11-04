import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaPartida, jugarAccion, normalizar } from '../src/partida.js';

const JUGADORES = [
  { id: 'u1', name: 'Ana', color: 'rojo' },
  { id: 'u2', name: 'Beto', color: 'azul' },
];

/** Simula lo que hace Firebase: borra listas vacías, objetos vacíos y null. */
function comoFirebase(valor) {
  if (Array.isArray(valor)) {
    const lista = valor.map(comoFirebase).filter((v) => v !== undefined);
    return lista.length ? lista : undefined;
  }
  if (valor && typeof valor === 'object') {
    const obj = {};
    for (const [k, v] of Object.entries(valor)) {
      const limpio = comoFirebase(v);
      if (limpio !== undefined) obj[k] = limpio;
    }
    return Object.keys(obj).length ? obj : undefined;
  }
  return valor === null ? undefined : valor;
}

test('la partida guarda de quién es el turno y numera los eventos', () => {
  let p = nuevaPartida(JUGADORES, 5);
  assert.equal(p.turno, p.estado.turnOrder[0]);
  const yo = p.turno;
  const t = Object.keys(p.estado.territories).find((id) => p.estado.territories[id].owner === yo);
  p = jugarAccion(p, yo, { type: 'place', territory: t, count: 5 });
  assert.equal(p.evento.n, 1);
  assert.equal(p.evento.por, yo);
  assert.notEqual(p.turno, yo);
});

test('después de pasar por Firebase la partida se sigue pudiendo jugar', () => {
  let p = nuevaPartida(JUGADORES, 9);
  for (let i = 0; i < 4; i++) {
    const yo = p.turno;
    const t = Object.keys(p.estado.territories).find((id) => p.estado.territories[id].owner === yo);
    p = normalizar(comoFirebase(jugarAccion(p, yo, { type: 'place', territory: t, count: p.estado.setup.remaining })));
  }
  assert.equal(p.estado.phase, 'playing');
  assert.deepEqual(p.estado.turn.regroupLocked, {});
  assert.equal(p.estado.turn.pendingMove, null);
  assert.ok(p.estado.players.every((j) => Array.isArray(j.cards)));
  // un turno entero: incorporar todo y pasar
  const yo = p.turno;
  const t = Object.keys(p.estado.territories).find((id) => p.estado.territories[id].owner === yo);
  p = normalizar(comoFirebase(jugarAccion(p, yo, { type: 'place', territory: t, count: p.estado.turn.reinforcements })));
  p = normalizar(comoFirebase(jugarAccion(p, yo, { type: 'endPhase' })));
  p = normalizar(comoFirebase(jugarAccion(p, yo, { type: 'endTurn' })));
  assert.notEqual(p.turno, yo);
});
